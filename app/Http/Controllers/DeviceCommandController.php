<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use App\Models\DeviceCommand;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;

/**
 * The Command module: send a device a command, and read what it says back.
 *
 * Traccar's own API is one-way. POST /commands/send reports whether the command was *accepted*
 * — 200 when it was written to a live connection, 202 when it was queued for a device that is
 * offline — and nothing more. The device's answer arrives later on a completely separate path:
 * the VL863P replies with an 0x21 frame, the protocol decoder puts its text on a position as
 * `result`, and Traccar's CommandResultEventHandler raises a `commandResult` event carrying that
 * text. Nothing links that event back to the command that caused it.
 *
 * So the correlation is made here. Sending writes a device_commands row; result() polls the event
 * report for a commandResult raised on that device after that row was sent, and settles the row
 * with the device's words. That is the whole of the module's reason to exist, and it is why the
 * outcome is a stored status rather than an HTTP response code.
 *
 * Polling rather than the websocket is deliberate. The events are written to Traccar's database
 * before they are broadcast, so a poll cannot miss one — whereas a socket that drops mid-wait
 * loses the push silently and would report a failure on a command that actually succeeded. It
 * also works on this deployment today, where the browser's Traccar websocket needs a wss:// proxy
 * that is not yet in place (see config/services.php, TRACCAR_WS_URL).
 */
class DeviceCommandController extends Controller
{
    use UsesTraccarApi;

    /**
     * Only one command may be outstanding per device at a time.
     *
     * There is nothing in the reply to say which command it answers — a commandResult event
     * carries the device's text and no correlation id — so two overlapping commands to one device
     * cannot be told apart, and whichever result lands first would be attributed to both. The
     * device is the constraint here, not this app: it answers one command at a time.
     */
    private const ONE_AT_A_TIME = 'This device is still waiting on an earlier command. '
        . 'Wait for that one to finish or time out, then send this one.';

    /** GET /api/device-commands — the history table. */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'   => 'nullable|string|max:100',
            'status' => 'nullable|in:pending,queued,success,failed,timeout',
            'mine'   => 'nullable|boolean',
            'limit'  => 'nullable|integer|min:1|max:500',
        ]);

        $query = DeviceCommand::query()->latest('id');

        if (!empty($data['imei'])) {
            $query->where('imei', $data['imei']);
        }
        if (!empty($data['status'])) {
            $query->where('status', $data['status']);
        }
        // "Show ALL Commands" unticked means the operator's own sends only. Their colleagues'
        // commands are still theirs to see — this narrows a shared log, it does not guard it.
        if ($request->boolean('mine') && Auth::id()) {
            $query->where('user_id', Auth::id());
        }

        $commands = $query->limit($data['limit'] ?? 100)->get();

        // Anything whose deadline passed while nobody was looking is settled on read, so the table
        // never shows a row stuck at "pending" from last week. expire() writes through the same
        // model instances, so the collection returned below already carries the new status.
        $commands->filter->hasExpired()->each(fn (DeviceCommand $c) => $this->expire($c));

        return response()->json($commands->values());
    }

    /** POST /api/device-commands — dispatch one command and record it. */
    public function send(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei' => 'required|string|max:100',
            'type' => 'nullable|string|max:64',
            // Required for `custom`, which is the free-text form. The character set is the device
            // protocol's own — ASCII, comma separated, '#'-terminated — and is kept tight because
            // this string is handed to a vehicle.
            'content'    => ['nullable', 'string', 'max:255', 'regex:/^[A-Za-z0-9,._:+\-# ]+$/'],
            'parameters' => 'nullable|array',
            'channel'    => 'nullable|in:auto,gprs,sms',
            'is_manual'  => 'nullable|boolean',
            'no_queue'   => 'nullable|boolean',
            'timeout'    => 'nullable|integer|min:0|max:600',
        ], [
            'content.regex' => 'That command contains characters the device protocol does not use.',
        ]);

        $type    = $data['type'] ?? 'custom';
        $content = trim($data['content'] ?? '');
        $channel = $data['channel'] ?? 'gprs';

        if ($type === 'custom' && $content === '') {
            return response()->json(['message' => 'Enter a command to send.'], 422);
        }

        // The device protocol terminates every command with '#'. Forgetting it is the commonest
        // way to send something the device quietly ignores, so it is added rather than rejected —
        // Traccar's own VL863P encoder does exactly the same before putting it on the wire.
        if ($type === 'custom' && !str_ends_with($content, '#')) {
            $content .= '#';
        }

        $device = $this->findDevice($data['imei']);

        if (!$device) {
            return response()->json([
                'message' => "No device with IMEI {$data['imei']} is visible to this account.",
            ], 404);
        }

        if ($this->hasOutstandingCommand($data['imei'])) {
            return response()->json(['message' => self::ONE_AT_A_TIME], 409);
        }

        $command = DeviceCommand::create([
            'user_id'           => Auth::id(),
            'imei'              => $data['imei'],
            'traccar_device_id' => $device['id'],
            'device_name'       => $device['name'] ?? null,
            'type'              => $type,
            'content'           => $type === 'custom' ? $content : null,
            'parameters'        => $data['parameters'] ?? null,
            'channel'           => $channel,
            'is_manual'         => $data['is_manual'] ?? true,
            'status'            => 'pending',
            // A caller-supplied timeout wins; otherwise it comes from the command itself, because
            // WHERE# and STATUS# are not the same kind of wait. See DeviceCommand::timeoutFor().
            'timeout_seconds'   => $data['timeout'] ?? DeviceCommand::timeoutFor($content, $type),
            'sent_at'           => now(),
        ]);

        $result = $this->dispatch(
            deviceId:   $device['id'],
            type:       $type,
            content:    $content,
            parameters: $data['parameters'] ?? [],
            channel:    $channel,
            noQueue:    (bool) ($data['no_queue'] ?? false),
        );

        $command->fill([
            'http_status' => $result['status'],
            'channel'     => $result['channel'],
            'error'       => $result['ok'] ? null : $result['reason'],
        ]);

        if (!$result['ok']) {
            $command->status       = 'failed';
            $command->responded_at = now();
        } elseif ($result['status'] === 202) {
            // Queued for an offline device. No deadline applies — it goes out on reconnect, which
            // may be tomorrow, and calling that a timeout would be a lie.
            $command->status = 'queued';
            $command->mode   = 'async';
        } else {
            $command->mode = 'sync';

            // Commands that reboot the device answer by disappearing. Waiting on RESET# for thirty
            // seconds and then reporting a failure would be reporting the expected outcome as one.
            if ((int) $command->timeout_seconds === 0) {
                $command->status       = 'success';
                $command->response     = 'Sent. This command does not reply — the device acts on it and reconnects.';
                $command->responded_at = now();
            }
        }

        $command->save();

        return response()->json($command->fresh(), $result['ok'] ? 200 : 502);
    }

    /**
     * GET /api/device-commands/{deviceCommand} — has the device answered yet?
     *
     * Called on a timer by the page until the row settles. Cheap on purpose: one event-report
     * query over the window since the command was sent.
     */
    public function result(DeviceCommand $deviceCommand): JsonResponse
    {
        if ($deviceCommand->isSettled()) {
            return response()->json($deviceCommand);
        }

        $reply = $this->findReply($deviceCommand);

        if ($reply !== null) {
            $deviceCommand->update([
                'status'       => 'success',
                'response'     => $reply,
                'responded_at' => now(),
            ]);

            return response()->json($deviceCommand->fresh());
        }

        if ($deviceCommand->hasExpired()) {
            $this->expire($deviceCommand);
        }

        return response()->json($deviceCommand->fresh());
    }

    /** DELETE /api/device-commands/{deviceCommand} — drop one row from the log. */
    public function destroy(DeviceCommand $deviceCommand): JsonResponse
    {
        $deviceCommand->delete();

        return response()->json(['message' => 'Removed from the command history.']);
    }

    /* ── Traccar ─────────────────────────────────────────────────────────────────────────── */

    /** The device record, by IMEI, as this caller's Traccar identity can see it. */
    private function findDevice(string $imei): ?array
    {
        try {
            $response = Http::withBasicAuth(...$this->traccarAuth())
                ->timeout(15)
                ->get("{$this->traccarBaseUrl()}/devices", ['uniqueId' => $imei]);
        } catch (\Throwable) {
            return null;
        }

        return $response->successful() ? ($response->json()[0] ?? null) : null;
    }

    /** True while an earlier command to this device is still unresolved. See ONE_AT_A_TIME. */
    private function hasOutstandingCommand(string $imei): bool
    {
        $pending = DeviceCommand::where('imei', $imei)->where('status', 'pending')->get();

        // Expiring first means a stale row cannot wedge a device shut: a command whose deadline
        // has already passed is settled here and stops blocking the next one. expire() rewrites
        // the status in place, so what is still 'pending' afterwards is genuinely still waiting.
        $pending->filter->hasExpired()->each(fn (DeviceCommand $c) => $this->expire($c));

        return $pending->contains(fn (DeviceCommand $c) => $c->status === 'pending');
    }

    /**
     * POSTs to Traccar and normalises the answer.
     *
     * `auto` sends over the data connection and retries as SMS only if Traccar refuses outright.
     * A 202 is not a refusal — the command is queued and will be delivered — so no SMS follows it,
     * which would otherwise apply the same setting twice.
     *
     * @return array{ok: bool, status: int, reason: ?string, channel: string}
     */
    private function dispatch(int $deviceId, string $type, string $content, array $parameters, string $channel, bool $noQueue): array
    {
        $viaData = $this->post($deviceId, $type, $content, $parameters, viaSms: $channel === 'sms', noQueue: $noQueue);

        if ($channel !== 'auto' || $viaData['ok']) {
            return $viaData;
        }

        $viaSms = $this->post($deviceId, $type, $content, $parameters, viaSms: true, noQueue: $noQueue);

        return $viaSms['ok'] ? $viaSms : [
            ...$viaData,
            'reason' => "Data: {$viaData['reason']} SMS: {$viaSms['reason']}",
        ];
    }

    /** @return array{ok: bool, status: int, reason: ?string, channel: string} */
    private function post(int $deviceId, string $type, string $content, array $parameters, bool $viaSms, bool $noQueue): array
    {
        $attributes = $type === 'custom' ? ['data' => $content] : $parameters;

        if ($noQueue) {
            // Traccar queues a command for an offline device by default. noQueue makes it fail
            // immediately instead, which is what you want for anything time-sensitive — a
            // "where are you" answered on next week's reconnect is worse than no answer at all.
            $attributes['noQueue'] = true;
        }

        $payload = array_filter([
            'deviceId'   => $deviceId,
            'type'       => $type,
            'attributes' => (object) $attributes,
            // Only sent when true: Traccar reads the key's presence as the switch.
            'textChannel' => $viaSms ?: null,
        ], fn ($value) => $value !== null);

        try {
            $response = Http::withBasicAuth(...$this->traccarAuth())
                ->withHeaders(['Content-Type' => 'application/json'])
                ->timeout(25)
                ->post("{$this->traccarBaseUrl()}/commands/send", $payload);
        } catch (\Throwable $e) {
            return [
                'ok'      => false,
                'status'  => 0,
                'reason'  => 'Could not reach Traccar: ' . $e->getMessage(),
                'channel' => $viaSms ? 'sms' : 'gprs',
            ];
        }

        return [
            'ok'     => $response->successful(),
            'status' => $response->status(),
            // Traccar answers a rejection with a Java stack trace whose first line is the actual
            // reason ("SMS not configured", "Failed to send command"); the rest is Jetty internals.
            'reason' => $response->successful()
                ? null
                : (trim(strtok($response->body(), "\n") ?: '') ?: "Traccar returned HTTP {$response->status()}."),
            'channel' => $viaSms ? 'sms' : 'gprs',
        ];
    }

    /**
     * The device's reply to this command, or null if it has not answered yet.
     *
     * Read off the commandResult event report rather than the position feed: the report filters to
     * command replies server-side, so an ordinary position arriving in the meantime cannot be
     * mistaken for one. The window starts a couple of seconds before the send to absorb clock skew
     * between this host and Traccar, and nothing older than that is considered — otherwise a
     * previous command's answer would settle this one.
     */
    private function findReply(DeviceCommand $command): ?string
    {
        if (!$command->traccar_device_id || !$command->sent_at) {
            return null;
        }

        try {
            $response = Http::withBasicAuth(...$this->traccarAuth())
                ->withHeaders(['Accept' => 'application/json'])
                ->timeout(20)
                ->get("{$this->traccarBaseUrl()}/reports/events", [
                    'deviceId' => $command->traccar_device_id,
                    'type'     => 'commandResult',
                    'from'     => $command->sent_at->copy()->subSeconds(2)->utc()->toISOString(),
                    // A minute ahead of now, because the event is stamped with the *position's*
                    // time — which is the device's clock, and can run slightly fast.
                    'to'       => now()->addMinute()->utc()->toISOString(),
                ]);
        } catch (\Throwable) {
            return null;
        }

        if (!$response->successful()) {
            return null;
        }

        foreach ($response->json() ?: [] as $event) {
            $result = $event['attributes']['result'] ?? null;

            if (is_string($result) && trim($result) !== '') {
                return trim($result);
            }
        }

        return null;
    }

    /** Settles a command whose wait ran out, saying plainly that silence is not proof of failure. */
    private function expire(DeviceCommand $command): void
    {
        $command->update([
            'status'       => 'timeout',
            'responded_at' => now(),
            'error'        => "No reply within {$command->timeout_seconds}s. Traccar accepted the command, "
                . 'so it may still have been carried out — several commands never answer at all.',
        ]);
    }
}
