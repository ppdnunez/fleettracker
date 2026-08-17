<?php

namespace App\Services;

use App\Models\Client;
use App\Models\Geofence;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Mirrors a work-zone into Traccar, and links it to the devices it applies to.
 *
 * Zones are authored here — the drawing tools, the colour, and the per-device alert direction all
 * live in this app — but nothing here watches positions. Traccar does: it decides containment on
 * every incoming position and raises geofenceEnter / geofenceExit, which is what the Geo Fence
 * report, the alert dispatcher and the map overlay are all built on. A zone that exists only in
 * this database is therefore inert, however complete it looks in the UI.
 *
 * Two separate things have to be true in Traccar for a zone to produce events:
 *
 *   1. the geofence exists, and
 *   2. each device is linked to it by a permission.
 *
 * The second is the one that is easy to miss: Traccar only evaluates a geofence against devices
 * explicitly linked to it, so an unlinked geofence is drawn on maps and never fires. Both are
 * done here together, because a zone with neither is the same as no zone at all.
 *
 * Identity matters as much as the payload. Everything is done as the *owning company's* Traccar
 * user rather than as whoever happens to be signed in, for two reasons: Traccar makes the creator
 * the owner, so a zone created by the service account is invisible to the company whose devices it
 * governs (its map overlay and report dropdown come back empty); and this runs from the console
 * too, where there is no signed-in user at all. A zone with no company — one drawn by a platform
 * administrator — falls back to the service account, which can see every device.
 */
class TraccarGeofenceSync
{
    private function baseUrl(): string
    {
        return rtrim(config('services.traccar.url'), '/') . '/api';
    }

    /**
     * @return array{0: string, 1: string}|null [email, password], or null when the owner cannot act
     */
    private function credentials(Geofence $zone): ?array
    {
        $client = $zone->client_id ? Client::find($zone->client_id) : null;

        if ($client === null) {
            return [config('services.traccar.email'), config('services.traccar.password')];
        }

        if (!$client->isActive() || !$client->hasTraccarCredentials()) {
            return null;
        }

        return [$client->traccar_email, $client->traccar_password];
    }

    private function http(array $auth)
    {
        return Http::withBasicAuth(...$auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->timeout(15);
    }

    /**
     * Pushes the zone's shape and links, creating the Traccar geofence on first sync.
     *
     * @return array{ok: bool, geofenceId: ?int, linked: int, unlinked: int, message: ?string}
     */
    public function sync(Geofence $zone): array
    {
        $auth = $this->credentials($zone);

        if ($auth === null) {
            return ['ok' => false, 'geofenceId' => null, 'linked' => 0, 'unlinked' => 0,
                    'message' => 'The company that owns this zone has no usable Traccar credentials, so it cannot be mirrored.'];
        }

        try {
            $geofenceId = $this->pushShape($zone, $auth);

            if ($geofenceId === null) {
                return ['ok' => false, 'geofenceId' => null, 'linked' => 0, 'unlinked' => 0,
                        'message' => 'Traccar rejected the zone shape.'];
            }

            $this->shareWithServiceAccount($zone, $geofenceId);
            $links = $this->syncLinks($zone, $geofenceId, $auth);

            return ['ok' => true, 'geofenceId' => $geofenceId, ...$links, 'message' => null];
        } catch (\Throwable $e) {
            Log::warning('Geofence sync to Traccar failed', ['zone' => $zone->id, 'error' => $e->getMessage()]);

            return ['ok' => false, 'geofenceId' => $zone->traccar_geofence_id, 'linked' => 0, 'unlinked' => 0,
                    'message' => 'Could not reach Traccar: ' . $e->getMessage()];
        }
    }

    /** Creates or updates the Traccar geofence, and remembers its id. */
    private function pushShape(Geofence $zone, array $auth): ?int
    {
        $payload = [
            'name'        => $zone->name,
            'area'        => $zone->area,
            'description' => 'Turprotrack work zone #' . $zone->id,
        ];

        if ($zone->traccar_geofence_id) {
            // Traccar keys the update off the id in the body, and a PUT for a geofence that has
            // since been deleted there answers 4xx — in which case it is re-created below rather
            // than leaving the zone permanently unmirrored.
            $response = $this->http($auth)->put(
                "{$this->baseUrl()}/geofences/{$zone->traccar_geofence_id}",
                $payload + ['id' => $zone->traccar_geofence_id]
            );

            if ($response->successful()) {
                return $zone->traccar_geofence_id;
            }
        }

        $response = $this->http($auth)->post("{$this->baseUrl()}/geofences", $payload);

        if (!$response->successful()) {
            Log::warning('Traccar refused a geofence', ['zone' => $zone->id, 'status' => $response->status(), 'body' => substr($response->body(), 0, 300)]);

            return null;
        }

        $id = $response->json()['id'] ?? null;

        if ($id) {
            $zone->forceFill(['traccar_geofence_id' => $id])->saveQuietly();
        }

        return $id;
    }

    /**
     * Also shows the mirror to the service account, so it appears in Traccar's own admin views.
     *
     * Traccar makes the creating user the owner and lists only objects the signed-in user is linked
     * to — so a company's zone, correctly created as that company, is missing from the
     * administrator's geofence list unless Traccar's "show all" toggle is on. Devices do not behave
     * that way here (the service account is linked to all of them), and a zone that exists but
     * cannot be found in Traccar looks exactly like a zone that was never created.
     *
     * Read-only visibility: it adds the administrator to the company's zone, and grants nothing to
     * the company. Skipped when the service account is already the owner, and when it can already
     * see the zone, because a duplicate permission is an error rather than a no-op.
     */
    private function shareWithServiceAccount(Geofence $zone, int $geofenceId): void
    {
        if (!$zone->client_id) {
            return;
        }

        $auth = [config('services.traccar.email'), config('services.traccar.password')];

        try {
            // Not GET /session: that reads a cookie session and answers 404 to a Basic-auth
            // caller, which is silent enough to look like success. /users is the admin-only
            // listing the service account is entitled to, and carries the id directly.
            $userId = collect($this->http($auth)->get("{$this->baseUrl()}/users")->json() ?? [])
                ->firstWhere('email', config('services.traccar.email'))['id'] ?? null;

            if ($userId === null) {
                return;
            }

            $visible = $this->http($auth)->get("{$this->baseUrl()}/geofences", ['userId' => $userId])->json() ?? [];

            foreach ($visible as $geofence) {
                if ((int) ($geofence['id'] ?? 0) === $geofenceId) {
                    return;
                }
            }

            $this->http($auth)->post("{$this->baseUrl()}/permissions", ['userId' => $userId, 'geofenceId' => $geofenceId]);
        } catch (\Throwable $e) {
            // Cosmetic for the administrator; never a reason to fail the sync the zone depends on.
            Log::info('Could not share a mirrored geofence with the service account', ['zone' => $zone->id, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Makes Traccar's device links match this zone's IMEI list — adding what is missing and
     * removing what is no longer wanted.
     *
     * @return array{linked: int, unlinked: int}
     */
    private function syncLinks(Geofence $zone, int $geofenceId, array $auth): array
    {
        $devices = $this->http($auth)->get("{$this->baseUrl()}/devices")->json() ?? [];
        $idByImei = [];
        foreach ($devices as $device) {
            $idByImei[(string) ($device['uniqueId'] ?? '')] = $device['id'];
        }

        $wanted = [];
        foreach ($zone->links as $link) {
            // A device the owner cannot see in Traccar is skipped rather than failing the sync:
            // the IMEI may belong to another company, or not be registered there yet.
            if (isset($idByImei[$link->imei])) {
                $wanted[] = (int) $idByImei[$link->imei];
            }
        }

        $current = $this->linkedDeviceIds($geofenceId, array_values($idByImei), $auth);

        $linked = $unlinked = 0;

        foreach (array_diff($wanted, $current) as $deviceId) {
            if ($this->http($auth)->post("{$this->baseUrl()}/permissions", ['deviceId' => $deviceId, 'geofenceId' => $geofenceId])->successful()) {
                $linked++;
            }
        }

        foreach (array_diff($current, $wanted) as $deviceId) {
            if ($this->http($auth)->delete("{$this->baseUrl()}/permissions", ['deviceId' => $deviceId, 'geofenceId' => $geofenceId])->successful()) {
                $unlinked++;
            }
        }

        return ['linked' => $linked, 'unlinked' => $unlinked];
    }

    /**
     * Which of these devices are already linked to the geofence.
     *
     * Traccar has no "devices for this geofence" query, but it does answer the reverse
     * (`GET /geofences?deviceId=`), so the devices are asked one by one — pooled, because a fleet
     * of fifty would otherwise be fifty round trips in series.
     *
     * @return int[]
     */
    private function linkedDeviceIds(int $geofenceId, array $deviceIds, array $auth): array
    {
        if (empty($deviceIds)) {
            return [];
        }

        $responses = Http::pool(fn ($pool) => array_map(
            fn ($id) => $pool->as((string) $id)
                ->withBasicAuth(...$auth)
                ->withHeaders(['Accept' => 'application/json'])
                ->get("{$this->baseUrl()}/geofences", ['deviceId' => $id]),
            $deviceIds
        ));

        $linked = [];

        foreach ($deviceIds as $id) {
            $response = $responses[(string) $id] ?? null;

            if (!$response || !$response->successful()) {
                continue;
            }

            foreach ($response->json() ?? [] as $geofence) {
                if ((int) ($geofence['id'] ?? 0) === $geofenceId) {
                    $linked[] = (int) $id;
                }
            }
        }

        return $linked;
    }

    /**
     * Removes the mirror when the zone is deleted here.
     *
     * Traccar cascades its own permissions, so the device links go with it. A failure is logged
     * and swallowed: the zone is already gone locally, and refusing the delete would leave the
     * operator unable to remove it at all.
     */
    public function forget(Geofence $zone): void
    {
        $auth = $this->credentials($zone);

        if ($auth === null || !$zone->traccar_geofence_id) {
            return;
        }

        try {
            $this->http($auth)->delete("{$this->baseUrl()}/geofences/{$zone->traccar_geofence_id}");
        } catch (\Throwable $e) {
            Log::warning('Could not remove a mirrored geofence from Traccar', ['zone' => $zone->id, 'error' => $e->getMessage()]);
        }
    }
}
