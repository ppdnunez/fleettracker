<?php

namespace App\Services;

use App\Models\Client;
use App\Models\Geofence;
use Illuminate\Http\Client\ConnectionException;
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

    /**
     * $timeout is worth raising only on the recovery path. Fifteen seconds is right for the calls
     * an operator is waiting on, but Traccar's unfiltered geofence listing has been measured here
     * at nearly thirty — so the one lookup that decides between adopting a mirror and stranding it
     * gets long enough to actually answer.
     */
    private function http(array $auth, int $timeout = 15)
    {
        return Http::withBasicAuth(...$auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->timeout($timeout);
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
            'description' => $this->mirrorTag($zone),
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

        // A previous attempt may have created the mirror even though this app never learned its id.
        // Traccar commits the POST and *then* answers, so a create whose response times out on the
        // way back leaves a real geofence there and a null traccar_geofence_id here. Posting again
        // would add a second copy of the same zone — and the first one becomes unreachable, because
        // forget() has no id to delete it by. Claiming the existing mirror by its tag is what keeps
        // a slow Traccar from turning into a duplicate now and an orphan later.
        if ($adopted = $this->findMirror($zone, $auth)) {
            return $this->adoptMirror($zone, $adopted, $payload, $auth);
        }

        try {
            $response = $this->http($auth)->post("{$this->baseUrl()}/geofences", $payload);
        } catch (ConnectionException $e) {
            // Traccar commits the create and *then* answers, so a timeout here says nothing about
            // whether the geofence now exists — and its id, the only handle on it, was in the reply
            // that never arrived. Left there, it is an orphan no later delete can reach.
            //
            // So the tag lookup that the next sync would do is done here instead, while the caller
            // is still waiting. That matters because the alternative is not merely a delayed fix:
            // until something re-syncs, the zone has no linked devices in Traccar and raises no
            // enter/exit events at all, while looking saved in the UI.
            if ($recovered = $this->findMirror($zone, $auth, timeout: 60)) {
                Log::info('Adopted a geofence mirror after a timed-out create', [
                    'zone' => $zone->id, 'geofence' => $recovered,
                ]);

                return $this->adoptMirror($zone, $recovered, $payload, $auth);
            }

            // Either the create genuinely never landed, or Traccar is too far gone to answer the
            // lookup either. Nothing was stranded that this can reach, and the original timeout is
            // the failure worth reporting.
            throw $e;
        }

        if (!$response->successful()) {
            Log::warning('Traccar refused a geofence', ['zone' => $zone->id, 'status' => $response->status(), 'body' => substr($response->body(), 0, 300)]);

            return null;
        }

        $id = $response->json()['id'] ?? null;

        if ($id) {
            $this->rememberMirror($zone, $id);
        }

        return $id;
    }

    /**
     * Takes ownership of a mirror that exists in Traccar but was not recorded here, and brings its
     * shape up to date.
     *
     * The id is saved first and deliberately: that single write is what makes the mirror reachable
     * again — updatable by the next sync, deletable by forget(). The shape push after it is
     * best-effort, because an outline that is briefly stale is a far smaller problem than a zone
     * Traccar owns and this app cannot name.
     */
    private function adoptMirror(Geofence $zone, int $geofenceId, array $payload, array $auth): int
    {
        $this->rememberMirror($zone, $geofenceId);

        try {
            $this->http($auth)->put(
                "{$this->baseUrl()}/geofences/{$geofenceId}",
                $payload + ['id' => $geofenceId]
            );
        } catch (\Throwable $e) {
            Log::info('Adopted a geofence mirror but could not refresh its shape', [
                'zone' => $zone->id, 'geofence' => $geofenceId, 'error' => $e->getMessage(),
            ]);
        }

        return $geofenceId;
    }

    /**
     * The marker that ties a Traccar geofence back to the work zone it mirrors.
     *
     * Traccar has no field for a foreign key, but it round-trips `description` untouched, and it
     * shows it in its own geofence list — so the tag identifies a mirror both to this code and to
     * an administrator looking at Traccar directly.
     */
    private function mirrorTag(Geofence $zone): string
    {
        return 'Turprotrack work zone #' . $zone->id;
    }

    /**
     * This zone's existing mirror in Traccar, found by its tag, or null if it has none.
     *
     * Scoped to what the owner's own credentials can see — the same identity that would have
     * created the mirror — so this can never adopt another company's geofence. Failure to reach
     * Traccar answers null: the caller then attempts a create, which is the safe way to be wrong,
     * since a duplicate can be removed but a missing zone silently raises no events at all.
     */
    private function findMirror(Geofence $zone, array $auth, int $timeout = 15): ?int
    {
        try {
            $existing = $this->http($auth, $timeout)->get("{$this->baseUrl()}/geofences")->json() ?? [];
        } catch (\Throwable) {
            return null;
        }

        $tag = $this->mirrorTag($zone);

        foreach ($existing as $geofence) {
            if (($geofence['description'] ?? null) === $tag && isset($geofence['id'])) {
                return (int) $geofence['id'];
            }
        }

        return null;
    }

    /** Records which Traccar geofence mirrors this zone. Bookkeeping, so it raises no model events. */
    private function rememberMirror(Geofence $zone, int $traccarGeofenceId): void
    {
        $zone->forceFill(['traccar_geofence_id' => $traccarGeofenceId])->saveQuietly();
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

        if ($auth === null) {
            return;
        }

        // Usually the id is already known. When it is not, the mirror may still exist — a create
        // whose response timed out leaves exactly that — so it is looked up by tag rather than
        // abandoned in Traccar, where it would keep appearing in the zone dropdown and the map
        // overlay with nothing left here to delete it.
        $traccarGeofenceId = $zone->traccar_geofence_id ?: $this->findMirror($zone, $auth);

        if (!$traccarGeofenceId) {
            return;
        }

        try {
            $this->http($auth)->delete("{$this->baseUrl()}/geofences/{$traccarGeofenceId}");
        } catch (\Throwable $e) {
            Log::warning('Could not remove a mirrored geofence from Traccar', ['zone' => $zone->id, 'error' => $e->getMessage()]);
        }
    }
}
