<?php

namespace App\Http\Controllers\Concerns;

use App\Exceptions\TenantTraccarUnavailable;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;

/**
 * Resolves which Traccar identity the current request speaks as.
 *
 * This is the whole of the multi-tenant boundary. A tenant's requests are made with that
 * tenant's own Traccar user, so Traccar's permission model decides what comes back — the app
 * never receives another tenant's devices and therefore cannot leak them by mis-filtering.
 * Platform administrators fall back to the service account in config and see everything.
 *
 * Credentials are resolved per request (not in the constructor) because the authenticated user
 * is not available while a controller is being constructed.
 */
trait UsesTraccarApi
{
    private ?array $resolvedTraccarAuth = null;

    protected function traccarBaseUrl(): string
    {
        return rtrim(config('services.traccar.url'), '/') . '/api';
    }

    /**
     * @return array{0: string, 1: string} [email, password] for Http::withBasicAuth(...)
     */
    protected function traccarAuth(): array
    {
        if ($this->resolvedTraccarAuth !== null) {
            return $this->resolvedTraccarAuth;
        }

        $user = Auth::user();

        // Platform administrator (or an unauthenticated console/scheduled context): use the
        // service account, which is linked to every device.
        if (!$user || $user->isPlatformAdmin()) {
            return $this->resolvedTraccarAuth = [
                config('services.traccar.email'),
                config('services.traccar.password'),
            ];
        }

        $client = $user->client;

        if (!$client) {
            throw new TenantTraccarUnavailable(
                'Your account is not linked to a client. Ask an administrator to assign one.'
            );
        }

        if (!$client->isActive()) {
            throw new TenantTraccarUnavailable('This client account is suspended.');
        }

        if (!$client->hasTraccarCredentials()) {
            throw new TenantTraccarUnavailable(
                'No Traccar credentials are configured for this client.'
            );
        }

        return $this->resolvedTraccarAuth = [
            $client->traccar_email,
            $client->traccar_password,
        ];
    }

    /** Traccar's numeric device id for an IMEI (its uniqueId), or null if this caller can't see it. */
    protected function traccarDeviceIdForImei(string $imei): ?int
    {
        $response = Http::withBasicAuth(...$this->traccarAuth())
            ->timeout(10)
            ->get("{$this->traccarBaseUrl()}/devices", ['uniqueId' => $imei]);

        if (!$response->successful()) {
            return null;
        }

        return $response->json()[0]['id'] ?? null;
    }

    /**
     * Sends a raw device command (e.g. "EVENTSET,FACE,SHOT,1234,Potter#") through Traccar.
     *
     * The JC171 face commands are plain text the device parses itself, so they go out as
     * Traccar's `custom` command type with the string in attributes.data. Traccar answers 200
     * when it handed the command to a live connection and 202 when it queued it for an offline
     * device — both mean "accepted", neither means the device has acted on it yet. The real
     * outcome ("SHOT OK!" / "SHOT FAIL!") comes back out-of-band on the face webhooks.
     *
     * Because the command is sent as the caller's own Traccar identity, a tenant can only
     * command devices Traccar already grants them — the multi-tenant boundary holds here too.
     *
     * @return array{ok: bool, status: int, queued: bool, body: mixed, message: ?string}
     */
    protected function sendTraccarCommand(string $imei, string $data): array
    {
        $deviceId = $this->traccarDeviceIdForImei($imei);

        if ($deviceId === null) {
            return [
                'ok'      => false,
                'status'  => 404,
                'queued'  => false,
                'body'    => null,
                'message' => "No device with IMEI {$imei} is visible to this account.",
            ];
        }

        try {
            $response = Http::withBasicAuth(...$this->traccarAuth())
                ->timeout(20)
                ->post("{$this->traccarBaseUrl()}/commands/send", [
                    'deviceId'   => $deviceId,
                    'type'       => 'custom',
                    'attributes' => ['data' => $data],
                ]);
        } catch (\Throwable $e) {
            return [
                'ok'      => false,
                'status'  => 0,
                'queued'  => false,
                'body'    => null,
                'message' => 'Could not reach Traccar: ' . $e->getMessage(),
            ];
        }

        return [
            'ok'      => $response->successful(),
            'status'  => $response->status(),
            'queued'  => $response->status() === 202,
            'body'    => $response->json() ?? $response->body(),
            'message' => $response->successful()
                ? ($response->status() === 202 ? 'Queued — device is offline.' : 'Sent to device.')
                : ('Traccar rejected the command (HTTP ' . $response->status() . ').'),
            'command' => $data,
        ];
    }
}
