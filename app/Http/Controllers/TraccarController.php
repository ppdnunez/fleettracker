<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

class TraccarController extends Controller
{
    private string $baseUrl;
    private array  $auth;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.traccar.url'), '/') . '/api';
        $this->auth    = [
            config('services.traccar.email'),
            config('services.traccar.password'),
        ];
    }

    public function devices()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/devices");
        return response()->json($response->json(), $response->status());
    }

    public function storeDevice(Request $request)
    {
        $data = $request->validate([
            'name'           => 'required|string|max:100',
            'uniqueId'       => 'required|string|max:100',
            'groupId'        => 'nullable|integer',
            'phone'          => 'nullable|string|max:30',
            'model'          => 'nullable|string|max:100',
            'contact'        => 'nullable|string|max:100',
            'category'       => 'nullable|string|max:50',
            'calendarId'     => 'nullable|integer',
            'expirationTime' => 'nullable|date',
            'disabled'       => 'nullable|boolean',
            'attributes'     => 'nullable|array',
        ]);

        // PHP can't distinguish an empty array from an empty object when re-encoding;
        // Traccar expects `attributes` to be a JSON object, never a JSON array.
        $data['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/devices", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateDevice(Request $request, int $id)
    {
        $data = $request->validate([
            'name'           => 'required|string|max:100',
            'groupId'        => 'nullable|integer',
            'phone'          => 'nullable|string|max:30',
            'model'          => 'nullable|string|max:100',
            'contact'        => 'nullable|string|max:100',
            'category'       => 'nullable|string|max:50',
            'calendarId'     => 'nullable|integer',
            'expirationTime' => 'nullable|date',
            'disabled'       => 'nullable|boolean',
        ]);

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/devices", ['id' => $id]);
        $device = $existing->json()[0] ?? null;
        if (!$device) {
            return response()->json(['message' => 'Device not found.'], 404);
        }

        $merged = array_merge($device, $data);
        // Same empty-array/object ambiguity as storeDevice() - Traccar expects an object here.
        $merged['attributes'] = (object) ($merged['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/devices/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function notifications()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/notifications");
        return response()->json($response->json(), $response->status());
    }

    public function drivers()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/drivers");
        return response()->json($response->json(), $response->status());
    }

    private function driverValidationRules(): array
    {
        return [
            'name'       => 'required|string|max:100',
            'uniqueId'   => 'required|string|max:100',
            'attributes' => 'nullable|array',
        ];
    }

    public function storeDriver(Request $request)
    {
        $data = $request->validate($this->driverValidationRules());
        $data['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/drivers", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateDriver(Request $request, int $id)
    {
        $data = $request->validate($this->driverValidationRules());

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/drivers/{$id}");
        $driver = $existing->json();
        if (!$driver) {
            return response()->json(['message' => 'Driver not found.'], 404);
        }

        $merged = array_merge($driver, $data);
        $merged['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/drivers/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyDriver(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/drivers/{$id}");
        return response()->json(null, $response->status());
    }

    // Traccar's tc_device_{geofence,notification,driver} link tables are keyed deviceId-first;
    // the /permissions endpoint infers the table name from JSON key order, so deviceId must
    // be the first key in the request body for these to land in the right table.
    private const CONNECTION_KEYS = [
        'geofence'     => 'geofenceId',
        'notification' => 'notificationId',
        'driver'       => 'driverId',
        'attribute'    => 'attributeId',
        'maintenance'  => 'maintenanceId',
        'command'      => 'commandId',
    ];

    public function deviceConnections(int $id)
    {
        $fetch = fn (string $path) => Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/{$path}", ['deviceId' => $id])
            ->json();

        return response()->json([
            'geofences'          => $fetch('geofences'),
            'notifications'      => $fetch('notifications'),
            'drivers'            => $fetch('drivers'),
            'computedAttributes' => $fetch('attributes/computed'),
            'maintenances'       => $fetch('maintenance'),
            'commands'           => $fetch('commands'),
        ]);
    }

    public function linkDeviceConnection(Request $request, int $id)
    {
        $data = $request->validate([
            'type' => 'required|in:geofence,notification,driver,attribute,maintenance,command',
            'id'   => 'required|integer',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/permissions", [
                'deviceId' => $id,
                self::CONNECTION_KEYS[$data['type']] => $data['id'],
            ]);
        return response()->json(null, $response->status());
    }

    public function unlinkDeviceConnection(Request $request, int $id)
    {
        $data = $request->validate([
            'type' => 'required|in:geofence,notification,driver,attribute,maintenance,command',
            'id'   => 'required|integer',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->delete("{$this->baseUrl}/permissions", [
                'deviceId' => $id,
                self::CONNECTION_KEYS[$data['type']] => $data['id'],
            ]);
        return response()->json(null, $response->status());
    }

    public function notificationTypes()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/notifications/types");
        return response()->json($response->json(), $response->status());
    }

    public function notificators()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/notifications/notificators");
        return response()->json($response->json(), $response->status());
    }

    public function testNotificationChannels(Request $request)
    {
        $data = $request->validate([
            'channels'   => 'required|array|min:1',
            'channels.*' => 'string',
        ]);

        // Traccar's blanket POST /notifications/test ignores which channels the user picked -
        // it tests every notificator configured on the whole server in one loop, and if any one
        // of them throws (e.g. mail with no SMTP configured), the whole request fails even
        // though channels earlier in the loop (e.g. web) already sent successfully. Testing
        // each selected channel individually via /notifications/test/{notificator} avoids both
        // problems: only the chosen channels are exercised, and one failing channel doesn't
        // mask the others' results.
        $results = [];
        foreach ($data['channels'] as $channel) {
            $response = Http::withBasicAuth(...$this->auth)
                ->post("{$this->baseUrl}/notifications/test/{$channel}");
            $results[] = [
                'channel' => $channel,
                'success' => $response->successful(),
                'message' => $response->successful() ? null : ($response->json('message') ?? $response->body() ?? 'Failed to send.'),
            ];
        }

        return response()->json(['results' => $results]);
    }

    public function commands()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/commands");
        return response()->json($response->json(), $response->status());
    }

    public function commandTypes()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/commands/types");
        return response()->json($response->json(), $response->status());
    }

    private function savedCommandValidationRules(): array
    {
        return [
            'description'  => 'required|string|max:128',
            'type'         => 'required|string|max:128',
            'textChannel'  => 'nullable|boolean',
            'noQueue'      => 'nullable|boolean',
        ];
    }

    private function savedCommandPayload(array $data): array
    {
        $noQueue = $data['noQueue'] ?? false;
        unset($data['noQueue']);
        $data['deviceId'] = 0;
        $data['attributes'] = $noQueue ? ['noQueue' => true] : [];
        $data['attributes'] = (object) $data['attributes'];
        return $data;
    }

    public function storeSavedCommand(Request $request)
    {
        $data = $request->validate($this->savedCommandValidationRules());
        $payload = $this->savedCommandPayload($data);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/commands", $payload);
        return response()->json($response->json(), $response->status());
    }

    public function updateSavedCommand(Request $request, int $id)
    {
        $data = $request->validate($this->savedCommandValidationRules());
        $payload = $this->savedCommandPayload($data);

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/commands/{$id}");
        $command = $existing->json();
        if (!$command) {
            return response()->json(['message' => 'Saved command not found.'], 404);
        }

        $merged = array_merge($command, $payload);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/commands/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroySavedCommand(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/commands/{$id}");
        return response()->json(null, $response->status());
    }

    public function computedAttributes()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/attributes/computed");
        return response()->json($response->json(), $response->status());
    }

    private function attributeValidationRules(): array
    {
        return [
            'description' => 'required|string|max:128',
            'attribute'   => 'required|string|max:128',
            'expression'  => 'required|string',
            'type'        => 'required|in:number,string,boolean',
            'priority'    => 'nullable|integer',
        ];
    }

    public function storeComputedAttribute(Request $request)
    {
        $data = $request->validate($this->attributeValidationRules());

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/attributes/computed", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateComputedAttribute(Request $request, int $id)
    {
        $data = $request->validate($this->attributeValidationRules());

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/attributes/computed/{$id}");
        $attribute = $existing->json();
        if (!$attribute) {
            return response()->json(['message' => 'Computed attribute not found.'], 404);
        }

        $merged = array_merge($attribute, $data);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/attributes/computed/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyComputedAttribute(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/attributes/computed/{$id}");
        return response()->json(null, $response->status());
    }

    public function testComputedAttribute(Request $request)
    {
        $data = $request->validate([
            'deviceId'    => 'required|integer',
            'description' => 'required|string|max:128',
            'attribute'   => 'required|string|max:128',
            'expression'  => 'required|string',
            'type'        => 'required|in:number,string,boolean',
            'priority'    => 'nullable|integer',
        ]);
        $deviceId = $data['deviceId'];
        unset($data['deviceId']);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/attributes/computed/test?deviceId={$deviceId}", $data);

        if (!$response->successful()) {
            return response()->json(['message' => $response->body() ?: 'Test failed.'], $response->status());
        }
        return response()->json(['result' => $response->body()]);
    }

    public function maintenances()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/maintenance");
        return response()->json($response->json(), $response->status());
    }

    private function maintenanceValidationRules(): array
    {
        return [
            'name'   => 'required|string|max:128',
            'type'   => 'required|string|max:128',
            'start'  => 'required|numeric',
            'period' => 'required|numeric',
        ];
    }

    public function storeMaintenance(Request $request)
    {
        $data = $request->validate($this->maintenanceValidationRules());

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/maintenance", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateMaintenance(Request $request, int $id)
    {
        $data = $request->validate($this->maintenanceValidationRules());

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/maintenance/{$id}");
        $maintenance = $existing->json();
        if (!$maintenance) {
            return response()->json(['message' => 'Maintenance not found.'], 404);
        }

        $merged = array_merge($maintenance, $data);
        $merged['attributes'] = (object) ($merged['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/maintenance/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyMaintenance(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/maintenance/{$id}");
        return response()->json(null, $response->status());
    }

    public function notification(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/notifications/{$id}");
        return response()->json($response->json(), $response->status());
    }

    private function notificationValidationRules(): array
    {
        return [
            'type'         => 'required|string|max:50',
            'always'       => 'nullable|boolean',
            'calendarId'   => 'nullable|integer',
            'commandId'    => 'nullable|integer',
            'notificators' => 'nullable|string|max:255',
            'description'  => 'nullable|string|max:255',
        ];
    }

    public function storeNotification(Request $request)
    {
        $data = $request->validate($this->notificationValidationRules());

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/notifications", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateNotification(Request $request, int $id)
    {
        $data = $request->validate($this->notificationValidationRules());

        // Unlike geofences, a path-based GET-by-id works fine for notifications, so we can
        // safely fetch-and-merge here. Traccar's PUT writes every column from the submitted
        // entity (it doesn't skip ones you omit), so a partial payload would null out the rest.
        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/notifications/{$id}");
        $notification = $existing->json();
        if (!$notification) {
            return response()->json(['message' => 'Notification not found.'], 404);
        }

        $merged = array_merge($notification, $data);
        $merged['attributes'] = (object) ($merged['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/notifications/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyNotification(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/notifications/{$id}");
        return response()->json(null, $response->status());
    }

    // Traccar's Device resource has no `notificationId` filter, and the generic /permissions
    // GET is unreliable here (it infers the link table name from JSON key order, which doesn't
    // match the real deviceId-first tables for most pairs). So instead we derive the reverse
    // relation by asking each device for its own notifications (a filter that does work).
    public function notificationDevices(int $id)
    {
        $devices = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/devices")->json() ?? [];
        if (empty($devices)) {
            return response()->json([]);
        }

        $responses = Http::pool(fn ($pool) => array_map(
            fn ($d) => $pool->as($d['id'])->withBasicAuth(...$this->auth)
                ->get("{$this->baseUrl}/notifications", ['deviceId' => $d['id']]),
            $devices
        ));

        $linked = array_values(array_filter($devices, function ($d) use ($responses, $id) {
            $notifs = $responses[$d['id']]->json() ?? [];
            return in_array($id, array_column($notifs, 'id'));
        }));

        return response()->json($linked);
    }

    public function groups()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/groups");
        return response()->json($response->json(), $response->status());
    }

    public function storeGroup(Request $request)
    {
        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'groupId'    => 'nullable|integer',
            'attributes' => 'nullable|array',
        ]);
        $data['groupId']    = $data['groupId'] ?? 0;
        $data['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/groups", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateGroup(Request $request, int $id)
    {
        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'groupId'    => 'nullable|integer',
            'attributes' => 'nullable|array',
        ]);

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/groups/{$id}");
        $group = $existing->json();
        if (!$group) {
            return response()->json(['message' => 'Group not found.'], 404);
        }

        $merged = array_merge($group, $data);
        $merged['groupId']    = $data['groupId'] ?? 0;
        $merged['attributes'] = (object) ($data['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/groups/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyGroup(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/groups/{$id}");
        return response()->json(null, $response->status());
    }

    // Mirrors deviceConnections()/linkDeviceConnection()/unlinkDeviceConnection() but scoped to a
    // group instead of a device - groups have no "Devices" field of their own (a device points
    // at its group via deviceId.groupId, not the other way around), so only the 6 shared
    // connection types apply. tc_group_{geofence,notification,...} link tables are groupId-first,
    // same ordering requirement as the device-keyed tables.
    public function groupConnections(int $id)
    {
        $fetch = fn (string $path) => Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/{$path}", ['groupId' => $id])
            ->json();

        return response()->json([
            'geofences'          => $fetch('geofences'),
            'notifications'      => $fetch('notifications'),
            'drivers'            => $fetch('drivers'),
            'computedAttributes' => $fetch('attributes/computed'),
            'maintenances'       => $fetch('maintenance'),
            'commands'           => $fetch('commands'),
        ]);
    }

    public function linkGroupConnection(Request $request, int $id)
    {
        $data = $request->validate([
            'type' => 'required|in:geofence,notification,driver,attribute,maintenance,command',
            'id'   => 'required|integer',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/permissions", [
                'groupId' => $id,
                self::CONNECTION_KEYS[$data['type']] => $data['id'],
            ]);
        return response()->json(null, $response->status());
    }

    public function unlinkGroupConnection(Request $request, int $id)
    {
        $data = $request->validate([
            'type' => 'required|in:geofence,notification,driver,attribute,maintenance,command',
            'id'   => 'required|integer',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->delete("{$this->baseUrl}/permissions", [
                'groupId' => $id,
                self::CONNECTION_KEYS[$data['type']] => $data['id'],
            ]);
        return response()->json(null, $response->status());
    }

    public function calendars()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/calendars");
        return response()->json($response->json(), $response->status());
    }

    public function storeCalendar(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'data' => 'required|string',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/calendars", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateCalendar(Request $request, int $id)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'data' => 'required|string',
        ]);

        $existing = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/calendars/{$id}");
        $calendar = $existing->json();
        if (!$calendar) {
            return response()->json(['message' => 'Calendar not found.'], 404);
        }

        $merged = array_merge($calendar, $data);
        $merged['attributes'] = (object) ($merged['attributes'] ?? []);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/calendars/{$id}", $merged);
        return response()->json($response->json(), $response->status());
    }

    public function destroyCalendar(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/calendars/{$id}");
        return response()->json(null, $response->status());
    }

    public function latestPositions()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/positions");
        return response()->json($response->json(), $response->status());
    }

    // Mints a short-lived Traccar bearer token for the browser to open Traccar's own websocket
    // (ws://.../api/socket?token=...) directly. This endpoint itself sits behind auth:sanctum
    // like every other /api/traccar/* route, so only an authenticated FleetTrack user can reach
    // it; the Traccar admin password is never sent to or seen by the browser, only this scoped,
    // time-limited, revocable token (Traccar defaults it to ~7 days, irrelevant here since the
    // frontend re-mints a fresh one on every (re)connect).
    public function wsToken()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->asForm()
            ->post("{$this->baseUrl}/session/token");

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to mint websocket token.'], $response->status());
        }

        $wsUrl = preg_replace('#^http#', 'ws', rtrim(config('services.traccar.url'), '/')) . '/api/socket';

        return response()->json([
            'token' => trim($response->body()),
            'url'   => $wsUrl,
        ]);
    }

    public function position(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/positions", ['deviceId' => $id]);
        return response()->json($response->json(), $response->status());
    }

    // Alert Details report: Traccar's GET /reports/events gives bare {deviceId, type, eventTime,
    // positionId, attributes} rows, so this joins in device/group (for Account) and the referenced
    // position (for speed/coordinates/address) to produce the flat rows the table renders.
    public function alertEvents(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
            'type'     => 'nullable|string',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }
        if ($request->filled('type')) {
            $params['type'] = $request->type;
        }

        $eventsResponse = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/events", $params);

        if (!$eventsResponse->successful()) {
            return response()->json(['message' => 'Failed to load alert events.'], $eventsResponse->status());
        }
        $events = $eventsResponse->json() ?? [];

        $devices    = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/devices")->json() ?? [];
        $devicesById = collect($devices)->keyBy('id');
        $groups      = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/groups")->json() ?? [];
        $groupsById  = collect($groups)->keyBy('id');

        $positionIds = array_values(array_unique(array_filter(array_column($events, 'positionId'))));
        $positionsById = [];
        if (!empty($positionIds)) {
            $posResponses = Http::pool(fn ($pool) => array_map(
                fn ($pid) => $pool->as($pid)->withBasicAuth(...$this->auth)->get("{$this->baseUrl}/positions", ['id' => $pid]),
                $positionIds
            ));
            foreach ($positionIds as $pid) {
                $pos = $posResponses[$pid]->json()[0] ?? null;
                if ($pos) {
                    $positionsById[$pid] = $pos;
                }
            }
        }

        $rows = array_map(function ($e) use ($devicesById, $groupsById, $positionsById) {
            $device = $devicesById->get($e['deviceId'] ?? null);
            $group  = $device ? $groupsById->get($device['groupId'] ?? 0) : null;
            $pos    = $positionsById[$e['positionId'] ?? null] ?? null;

            return [
                'id'           => $e['id'],
                'deviceId'     => $e['deviceId'] ?? null,
                'deviceName'   => $device['name'] ?? null,
                'imei'         => $device['uniqueId'] ?? null,
                'model'        => $device['model'] ?? null,
                'account'      => $group['name'] ?? null,
                'type'         => $e['type'],
                'data'         => $e['attributes']['alarm'] ?? null,
                'eventTime'    => $e['eventTime'],
                'positionTime' => $pos['fixTime'] ?? null,
                'speed'        => isset($pos['speed']) ? round($pos['speed'] * 1.852, 1) : null,
                'latitude'     => $pos['latitude'] ?? null,
                'longitude'    => $pos['longitude'] ?? null,
                'address'      => $pos['address'] ?? null,
            ];
        }, $events);

        usort($rows, fn ($a, $b) => strcmp($b['eventTime'], $a['eventTime']));

        return response()->json(array_values($rows));
    }

    // Internal Battery report: Traccar's GET /reports/route returns raw position history, with
    // attributes.batteryLevel present whenever the protocol reports it. Consecutive readings at the
    // same battery percentage are collapsed into one row spanning first-to-last reading at that
    // level (rather than printing every single ping), with Normal/Low/Critical derived from the level.
    public function internalBatteryReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load battery report.'], $response->status());
        }
        $positions = $response->json() ?? [];

        $devices     = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/devices")->json() ?? [];
        $devicesById = collect($devices)->keyBy('id');

        $statusOf = function ($level) {
            if ($level < 20) return 'Critical';
            if ($level < 50) return 'Low';
            return 'Normal';
        };

        $byDevice = [];
        foreach ($positions as $p) {
            if (!array_key_exists('batteryLevel', $p['attributes'] ?? [])) {
                continue;
            }
            $byDevice[$p['deviceId']][] = $p;
        }

        $rows = [];
        foreach ($byDevice as $deviceId => $points) {
            usort($points, fn ($a, $b) => strcmp($a['fixTime'], $b['fixTime']));
            $device  = $devicesById->get($deviceId);
            $segment = null;
            foreach ($points as $p) {
                $level  = $p['attributes']['batteryLevel'];
                $status = $statusOf($level);
                if ($segment && $segment['level'] === $level) {
                    $segment['endTime'] = $p['fixTime'];
                } else {
                    if ($segment) {
                        $rows[] = $segment;
                    }
                    $segment = [
                        'deviceId'   => $deviceId,
                        'deviceName' => $device['name'] ?? null,
                        'imei'       => $device['uniqueId'] ?? null,
                        'level'      => $level,
                        'status'     => $status,
                        'startTime'  => $p['fixTime'],
                        'endTime'    => $p['fixTime'],
                    ];
                }
            }
            if ($segment) {
                $rows[] = $segment;
            }
        }

        foreach ($rows as &$r) {
            $r['durationMinutes'] = round((strtotime($r['endTime']) - strtotime($r['startTime'])) / 60, 1);
            unset($r['endTime']);
        }
        unset($r);

        usort($rows, fn ($a, $b) => strcmp($b['startTime'], $a['startTime']));

        return response()->json(array_values($rows));
    }

    // External Battery report: same /reports/route history as the Internal Battery report, but
    // reads attributes.power (Traccar's KEY_POWER — the vehicle/external power-supply voltage seen
    // on the device's power input pin) falling back to attributes.battery, instead of batteryLevel
    // (the device's own internal backup battery percentage). One row per reading; devices/protocols
    // that never report this attribute simply contribute no rows.
    public function externalBatteryReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load external battery report.'], $response->status());
        }
        $positions = $response->json() ?? [];

        $devices     = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/devices")->json() ?? [];
        $devicesById = collect($devices)->keyBy('id');

        $rows = [];
        foreach ($positions as $p) {
            $attrs   = $p['attributes'] ?? [];
            $voltage = $attrs['power'] ?? $attrs['battery'] ?? null;
            if ($voltage === null) {
                continue;
            }
            $device = $devicesById->get($p['deviceId']);
            $rows[] = [
                'deviceId'   => $p['deviceId'],
                'deviceName' => $device['name'] ?? null,
                'imei'       => $device['uniqueId'] ?? null,
                'voltage'    => round($voltage, 2),
                'status'     => $voltage < 12.0 ? 'Low' : 'Normal',
                'recordTime' => $p['fixTime'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['recordTime'], $a['recordTime']));

        return response()->json(array_values($rows));
    }

    // Fuel Consumption report: Traccar's own /reports/summary "spentFuel" only populates when a
    // device is configured with its built-in fuel-consumption coefficient, which none of our
    // devices have — so this computes it ourselves from /reports/route history, three ways:
    //   none   - no sensor at all: distance x the device's configured average rate
    //            (attributes.fuelEfficiency, L/100km, defaults to 9.0 if unset)
    //   sensor - basic fuel-level sensor: sum of drops in attributes.fuel (refuels excluded),
    //            converted from % to liters via attributes.fuelCapacity when the readings look like a percentage
    //   obd    - OBD-II/CAN bus: attributes.fuelUsed (cumulative liters, last-first) falling back to
    //            integrating attributes.fuelConsumption (instantaneous L/h) over elapsed time
    // Devices with no data for the chosen method are simply omitted rather than shown as a misleading 0.
    public function fuelConsumptionReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
            'method'   => 'required|in:none,sensor,obd',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load fuel consumption report.'], $response->status());
        }
        $positions = $response->json() ?? [];

        $devices     = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/devices")->json() ?? [];
        $devicesById = collect($devices)->keyBy('id');

        $byDevice = [];
        foreach ($positions as $p) {
            $byDevice[$p['deviceId']][] = $p;
        }

        $method = $request->method;
        $rows   = [];

        foreach ($byDevice as $deviceId => $points) {
            usort($points, fn ($a, $b) => strcmp($a['fixTime'], $b['fixTime']));
            $device = $devicesById->get($deviceId);
            $first  = $points[0];
            $last   = end($points);

            $distanceKm = max(0, (($last['attributes']['totalDistance'] ?? 0) - ($first['attributes']['totalDistance'] ?? 0)) / 1000);
            $fuelUsed   = null;

            if ($method === 'none') {
                $rate     = ($device['attributes'] ?? [])['fuelEfficiency'] ?? 9.0;
                $fuelUsed = round($distanceKm / 100 * $rate, 2);
            } elseif ($method === 'sensor') {
                $hasFuel  = false;
                $capacity = ($device['attributes'] ?? [])['fuelCapacity'] ?? null;
                $drop = 0;
                $maxLevel = 0;
                $prevLevel = null;
                foreach ($points as $p) {
                    if (!array_key_exists('fuel', $p['attributes'] ?? [])) {
                        continue;
                    }
                    $hasFuel = true;
                    $level   = $p['attributes']['fuel'];
                    $maxLevel = max($maxLevel, $level);
                    if ($prevLevel !== null && $level < $prevLevel) {
                        $drop += $prevLevel - $level;
                    }
                    $prevLevel = $level;
                }
                if ($hasFuel) {
                    $fuelUsed = ($capacity && $maxLevel <= 100) ? round($drop * $capacity / 100, 2) : round($drop, 2);
                }
            } else { // obd
                $usedReadings = array_values(array_filter($points, fn ($p) => array_key_exists('fuelUsed', $p['attributes'] ?? [])));
                if (!empty($usedReadings)) {
                    $fuelUsed = round(end($usedReadings)['attributes']['fuelUsed'] - $usedReadings[0]['attributes']['fuelUsed'], 2);
                } else {
                    $rateReadings = array_values(array_filter($points, fn ($p) => array_key_exists('fuelConsumption', $p['attributes'] ?? [])));
                    if (count($rateReadings) > 1) {
                        $total = 0;
                        for ($i = 1; $i < count($rateReadings); $i++) {
                            $hours  = (strtotime($rateReadings[$i]['fixTime']) - strtotime($rateReadings[$i - 1]['fixTime'])) / 3600;
                            $total += $rateReadings[$i - 1]['attributes']['fuelConsumption'] * $hours;
                        }
                        $fuelUsed = round($total, 2);
                    }
                }
            }

            if ($fuelUsed === null) {
                continue;
            }

            $rows[] = [
                'deviceId'       => $deviceId,
                'deviceName'     => $device['name'] ?? null,
                'imei'           => $device['uniqueId'] ?? null,
                'method'         => $method,
                'startTime'      => $first['fixTime'],
                'endTime'        => $last['fixTime'],
                'distanceKm'     => round($distanceKm, 1),
                'fuelUsed'       => $fuelUsed,
                'avgConsumption' => $distanceKm > 0 ? round($fuelUsed / $distanceKm * 100, 2) : null,
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['startTime'], $a['startTime']));

        return response()->json(array_values($rows));
    }

    // Current Fuel Value report: a live snapshot from GET /api/positions (Traccar's latest-position-
    // per-device endpoint), reading each position's attributes.fuel sensor reading. Liters/percent are
    // cross-derived using the device's attributes.fuelCapacity when set; otherwise whichever the raw
    // value looks like (<=100 assumed %, >100 assumed liters) is reported and the other side is left
    // blank rather than guessed. Devices with no fuel sensor data simply show blank, not zero.
    public function currentFuel(Request $request)
    {
        $request->validate([
            'deviceId' => 'nullable|integer',
        ]);

        $positions = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/positions")->json() ?? [];
        $positionsByDeviceId = collect($positions)->keyBy('deviceId');

        $devices = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/devices")->json() ?? [];
        if ($request->filled('deviceId')) {
            $devices = array_values(array_filter($devices, fn ($d) => $d['id'] == $request->deviceId));
        }

        $rows = [];
        foreach ($devices as $device) {
            $pos      = $positionsByDeviceId->get($device['id']);
            $attrs    = $pos['attributes'] ?? [];
            $capacity = ($device['attributes'] ?? [])['fuelCapacity'] ?? null;

            $liters = null;
            $percent = null;
            if (array_key_exists('fuel', $attrs)) {
                $fuel = $attrs['fuel'];
                if ($capacity) {
                    if ($fuel <= 100) {
                        $percent = $fuel;
                        $liters  = round($fuel / 100 * $capacity, 1);
                    } else {
                        $liters  = $fuel;
                        $percent = round($fuel / $capacity * 100, 1);
                    }
                } elseif ($fuel <= 100) {
                    $percent = $fuel;
                } else {
                    $liters = $fuel;
                }
            }

            $rows[] = [
                'deviceId'    => $device['id'],
                'deviceName'  => $device['name'],
                'imei'        => $device['uniqueId'],
                'liters'      => $liters,
                'percent'     => $percent,
                'lastUpdated' => $pos['fixTime'] ?? $device['lastUpdate'] ?? null,
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($a['deviceName'] ?? '', $b['deviceName'] ?? ''));

        return response()->json(array_values($rows));
    }

    // Temperature & Humidity report: built from /reports/route, reading attributes.temp1 (Traccar's
    // first external temperature-probe channel) and attributes.humidity per reading. One row per
    // position that reports either value — readings without either are skipped.
    public function temperatureHumidityReport(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];
        if ($request->filled('deviceId')) {
            $params['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", $params);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load temperature & humidity report.'], $response->status());
        }
        $positions = $response->json() ?? [];

        $devices     = Http::withBasicAuth(...$this->auth)->get("{$this->baseUrl}/devices")->json() ?? [];
        $devicesById = collect($devices)->keyBy('id');

        $rows = [];
        foreach ($positions as $p) {
            $attrs    = $p['attributes'] ?? [];
            $temp     = $attrs['temp1'] ?? null;
            $humidity = $attrs['humidity'] ?? null;
            if ($temp === null && $humidity === null) {
                continue;
            }
            $device = $devicesById->get($p['deviceId']);
            $rows[] = [
                'deviceId'    => $p['deviceId'],
                'deviceName'  => $device['name'] ?? null,
                'imei'        => $device['uniqueId'] ?? null,
                'temperature' => $temp,
                'humidity'    => $humidity,
                'recordTime'  => $p['fixTime'],
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['recordTime'], $a['recordTime']));

        return response()->json(array_values($rows));
    }

    public function routeHistory(Request $request, int $id)
    {
        $request->validate([
            'from' => 'required|date',
            'to'   => 'required|date|after:from',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/route", [
                'deviceId' => $id,
                'from'     => Carbon::parse($request->from)->utc()->toISOString(),
                'to'       => Carbon::parse($request->to)->utc()->toISOString(),
            ]);
        return response()->json($response->json(), $response->status());
    }

    public function trips(Request $request, int $id)
    {
        $request->validate([
            'from' => 'required|date',
            'to'   => 'required|date|after:from',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->baseUrl}/reports/trips", [
                'deviceId' => $id,
                'from'     => Carbon::parse($request->from)->utc()->toISOString(),
                'to'       => Carbon::parse($request->to)->utc()->toISOString(),
            ]);
        return response()->json($response->json(), $response->status());
    }

    public function exportTrips(Request $request, int $id)
    {
        $request->validate([
            'from' => 'required|date',
            'to'   => 'required|date|after:from',
        ]);

        $xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Accept' => $xlsxType])
            ->get("{$this->baseUrl}/reports/trips", [
                'deviceId' => $id,
                'from'     => Carbon::parse($request->from)->utc()->toISOString(),
                'to'       => Carbon::parse($request->to)->utc()->toISOString(),
            ]);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to export trips report.'], $response->status());
        }

        return response($response->body(), 200)
            ->header('Content-Type', $xlsxType)
            ->header('Content-Disposition', 'attachment; filename="trips.xlsx"');
    }

    public function geofences()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/geofences");
        return response()->json($response->json(), $response->status());
    }

    public function storeGeofence(Request $request)
    {
        $data = $request->validate([
            'name'        => 'required|string|max:100',
            'area'        => 'required|string',
            'description' => 'nullable|string|max:255',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post("{$this->baseUrl}/geofences", $data);
        return response()->json($response->json(), $response->status());
    }

    public function updateGeofence(Request $request, int $id)
    {
        $data = $request->validate([
            'name'        => 'required|string|max:100',
            'area'        => 'required|string',
            'description' => 'nullable|string|max:255',
        ]);

        // Traccar's geofences endpoint doesn't filter GET by `id` (unlike devices), so there's
        // no safe way to fetch-and-merge the existing record here. It does, however, key the
        // update off the `id` in the body (not the URL), and accepts a partial payload fine.
        $data['id'] = $id;

        $response = Http::withBasicAuth(...$this->auth)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl}/geofences/{$id}", $data);
        return response()->json($response->json(), $response->status());
    }

    public function destroyGeofence(int $id)
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->delete("{$this->baseUrl}/geofences/{$id}");
        return response()->json(null, $response->status());
    }
}
