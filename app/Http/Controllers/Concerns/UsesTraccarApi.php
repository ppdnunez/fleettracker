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


    /**
     * A cache key scoped to the Traccar identity this request speaks as.
     *
     * Keyed on that identity and never on the app user: two operators in one company see the same
     * devices and should share a cached copy, while two tenants must never share one — the whole
     * multi-tenant boundary is which Traccar account asked. Hashed because the identity is an
     * email address, and cache keys end up in the cache table and in error output.
     */
    protected function traccarCacheKey(string $name): string
    {
        return 'traccar:' . $name . ':' . sha1($this->traccarAuth()[0]);
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
     * $viaSms switches Traccar to its text channel, which delivers the same string as an SMS to
     * the device's stored phone number instead of down a live GPRS connection. That is the only
     * way to reach a device that is asleep or out of data, and it is what the iButton and
     * driving-behaviour panels use — those settings normally have to be applied to a parked
     * vehicle. It needs two things Traccar will complain about if missing: a phone number on the
     * device, and an SMS gateway configured on the Traccar server.
     *
     * @return array{ok: bool, status: int, queued: bool, body: mixed, message: ?string}
     */
    protected function sendTraccarCommand(string $imei, string $data, bool $viaSms = false): array
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
                ->post("{$this->traccarBaseUrl()}/commands/send", array_filter([
                    'deviceId'    => $deviceId,
                    'type'        => 'custom',
                    'attributes'  => ['data' => $data],
                    // Only sent when true: Traccar treats the key's presence as the switch, and an
                    // explicit false on a server with no SMS gateway is still a valid GPRS send.
                    'textChannel' => $viaSms ?: null,
                ], fn ($value) => $value !== null));
        } catch (\Throwable $e) {
            return [
                'ok'      => false,
                'status'  => 0,
                'queued'  => false,
                'body'    => null,
                'message' => 'Could not reach Traccar: ' . $e->getMessage(),
            ];
        }

        // Traccar answers a rejection with a plain-text stack trace; its first line carries the
        // actual reason ("Phone number is missing", "SMS is not enabled"), which is exactly what
        // an operator needs to see rather than a bare status code.
        $reason = $response->successful() ? null : trim(strtok($response->body(), "\n") ?: '');

        return [
            'ok'      => $response->successful(),
            'status'  => $response->status(),
            'queued'  => $response->status() === 202,
            // On failure this would otherwise be Traccar's entire Java stack trace — kilobytes of
            // it, shipped to the browser on every rejected command. The first line is the reason;
            // the rest is Jetty internals.
            'body'    => $response->successful() ? ($response->json() ?? $response->body()) : $reason,
            'message' => $response->successful()
                ? ($response->status() === 202
                    ? ($viaSms ? 'Queued for SMS delivery.' : 'Queued — device is offline.')
                    : ($viaSms ? 'Sent as SMS to the device.' : 'Sent to device.'))
                : ('Traccar rejected the command (HTTP ' . $response->status() . ').'
                    . ($reason !== '' ? " {$reason}" : '')),
            'command' => $data,
            'channel' => $viaSms ? 'sms' : 'gprs',
        ];
    }

    /**
     * Sends over the data connection and falls back to SMS if Traccar refuses it.
     *
     * The fallback fires only on an outright rejection — Traccar answering 4xx/5xx, or being
     * unreachable. A 202 is deliberately *not* treated as failure: it means Traccar accepted the
     * command and queued it for a device that is currently offline, and it will be delivered on
     * reconnect. Sending an SMS as well would apply the same setting twice, once now and once
     * whenever the vehicle powers up, and Traccar exposes no way to cancel the queued copy. When
     * a setting is needed on a parked device right now, that is what the explicit SMS option is
     * for — the caller decides, rather than this quietly double-sending.
     *
     * @return array the final attempt, plus `attempts` describing each one in order
     */
    protected function sendTraccarCommandWithSmsFallback(string $imei, string $data): array
    {
        $viaData = $this->sendTraccarCommand($imei, $data, viaSms: false);

        $summarise = fn (array $r) => [
            'channel' => $r['channel'] ?? null,
            'ok'      => $r['ok'],
            'status'  => $r['status'],
            'message' => $r['message'],
        ];

        // A device the caller cannot see will not become visible over SMS either, so there is
        // nothing to retry — the failure is about permissions, not about the channel.
        if ($viaData['ok'] || $viaData['status'] === 404) {
            return [...$viaData, 'attempts' => [$summarise($viaData)]];
        }

        $viaSms = $this->sendTraccarCommand($imei, $data, viaSms: true);

        return [
            ...$viaSms,
            'message'  => $viaSms['ok']
                ? "Data connection failed, sent by SMS instead. {$viaSms['message']}"
                : "Both channels failed. Data: {$viaData['message']} SMS: {$viaSms['message']}",
            'attempts' => [$summarise($viaData), $summarise($viaSms)],
        ];
    }
}
