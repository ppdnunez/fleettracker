<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/**
 * Fuel level, refuel/theft events, and the thresholds that drive them.
 *
 * Like every other sensor in Traccar, fuel arrives as position attributes — `fuelLevel` in percent,
 * `fuel` in litres, plus per-probe detail (fuel1Value/Range/Error/Battery) and multi-tank variants.
 * Readings do not ride on every packet, so the latest position frequently carries none; this reads
 * them the same way the temperature/TPMS module does, walking history back for the newest genuine
 * value and keeping the time it was taken.
 *
 * Fuel differs from the other sensors in two ways, and both are handled here:
 *
 *  - Traccar raises deviceFuelDrop / deviceFuelIncrease itself, from thresholds resolved
 *    device → group → server. Those thresholds are *attributes*, not config-file keys, which is
 *    why this exposes a settings screen rather than documentation.
 *  - Its detector compares only adjacent positions, so a slow siphon never trips it: 40 litres
 *    drawn over fifteen minutes is never 40 litres between two consecutive fixes. theftScan()
 *    is the window check that covers that gap, and it only accuses a vehicle that was stationary
 *    with the engine off throughout — otherwise it would flag ordinary consumption as theft.
 */
class FuelController extends Controller
{
    use UsesTraccarApi;

    private const DEFAULT_LOOKBACK_HOURS = 6;
    private const STALE_AFTER_MINUTES    = 30;

    /** Alarms the probe raises itself, independent of any threshold configured here. */
    public const FUEL_ALARMS = [
        'fuelLeak' => 'Fuel leak / siphon (reported by sensor)',
        'refuel'   => 'Refuel (reported by sensor)',
    ];

    /** Events Traccar derives from the thresholds below. */
    public const FUEL_EVENTS = [
        'deviceFuelDrop'     => 'Fuel drop',
        'deviceFuelIncrease' => 'Fuel increase',
    ];

    /** The attributes this module reads or writes on server / group / device objects. */
    public const THRESHOLD_KEYS = ['fuelDropThreshold', 'fuelIncreaseThreshold', 'fuelCapacity'];

    /* ─────────────────────────── readings ─────────────────────────── */

    /** Newest genuine fuel reading per device, with the time it was actually taken. */
    public function current(Request $request)
    {
        $request->validate([
            'deviceId' => 'nullable|integer',
            'hours'    => 'nullable|integer|min:1|max:72',
        ]);

        $hours   = (int) ($request->hours ?: self::DEFAULT_LOOKBACK_HOURS);
        $devices = $this->visibleDevices($request->deviceId);

        if ($devices instanceof \Illuminate\Http\JsonResponse) {
            return $devices;
        }

        $positionsByDevice = $this->positionsForDevices(
            $devices,
            Carbon::now()->subHours($hours),
            Carbon::now()
        );

        $rows = [];

        foreach ($devices as $device) {
            $positions = $positionsByDevice[$device['id']] ?? [];

            // Newest first: the first position carrying a key holds that key's current value.
            usort($positions, fn ($a, $b) => strcmp($b['fixTime'] ?? '', $a['fixTime'] ?? ''));

            $reading  = $this->latestFuelReading($positions);
            $capacity = $this->resolvedAttribute($device, 'fuelCapacity');

            // Percent is what most probes report; litres is what the event detector needs. When a
            // capacity is configured the two are shown side by side rather than one standing in
            // for the other.
            $litres = $reading['litres']['value']
                ?? ($capacity && isset($reading['level']['value']) ? round($reading['level']['value'] * $capacity / 100, 1) : null);

            $rows[] = [
                'deviceId'      => $device['id'],
                'deviceName'    => $device['name'] ?? null,
                'imei'          => $device['uniqueId'] ?? null,
                'level'         => $reading['level'],
                'litres'        => $reading['litres'],
                'derivedLitres' => $reading['litres'] === null ? $litres : null,
                'tanks'         => $reading['tanks'],
                'probes'        => $reading['probes'],
                'sensorType'    => $reading['sensorType'],
                'fuelCapacity'  => $capacity,
                'hasFuel'       => $reading['level'] !== null || $reading['litres'] !== null || $reading['tanks'],
                'positionCount' => count($positions),
            ];
        }

        return response()->json(['lookbackHours' => $hours, 'devices' => $rows]);
    }

    /** Every fuel reading in a window, oldest first — the series behind a chart or an export. */
    public function history(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $devices = $this->visibleDevices($request->deviceId);

        if ($devices instanceof \Illuminate\Http\JsonResponse) {
            return $devices;
        }

        $positionsByDevice = $this->positionsForDevices(
            $devices,
            Carbon::parse($request->from),
            Carbon::parse($request->to)
        );

        $rows = [];

        foreach ($devices as $device) {
            foreach ($positionsByDevice[$device['id']] ?? [] as $position) {
                $attributes = $position['attributes'] ?? [];

                if (!isset($attributes['fuelLevel']) && !isset($attributes['fuel'])) {
                    continue;
                }

                $rows[] = [
                    'deviceId'   => $device['id'],
                    'deviceName' => $device['name'] ?? null,
                    'recordedAt' => $position['fixTime'] ?? null,
                    'level'      => isset($attributes['fuelLevel']) ? (float) $attributes['fuelLevel'] : null,
                    'litres'     => isset($attributes['fuel']) ? (float) $attributes['fuel'] : null,
                    'ignition'   => $attributes['ignition'] ?? null,
                    'motion'     => $attributes['motion'] ?? null,
                    'alarm'      => $attributes['alarm'] ?? null,
                ];
            }
        }

        usort($rows, fn ($a, $b) => strcmp($a['recordedAt'] ?? '', $b['recordedAt'] ?? ''));

        return response()->json($rows);
    }

    /* ─────────────────────────── events ─────────────────────────── */

    /**
     * Fuel drops, increases and probe alarms in one list.
     *
     * Traccar's own drop/increase events carry `before` and `after`; the probe's fuelLeak/refuel
     * alarms carry neither but are independent of any threshold, so both are shown together with
     * their source named. An operator needs to know which of the two raised it.
     */
    public function events(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $query = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];

        if ($request->filled('deviceId')) {
            $query['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->traccarAuth())
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->traccarBaseUrl()}/reports/events", $query);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load fuel events.'], $response->status());
        }

        $devicesById = collect($this->visibleDevices(null))->keyBy('id');
        $rows        = [];

        foreach ($response->json() ?? [] as $event) {
            $type  = $event['type'] ?? '';
            $alarm = $event['attributes']['alarm'] ?? null;

            $isThreshold = isset(self::FUEL_EVENTS[$type]);
            $isProbe     = $type === 'alarm' && $alarm !== null && isset(self::FUEL_ALARMS[$alarm]);

            if (!$isThreshold && !$isProbe) {
                continue;
            }

            $device = $devicesById->get($event['deviceId'] ?? null);
            $before = $event['attributes']['before'] ?? null;
            $after  = $event['attributes']['after'] ?? null;

            $rows[] = [
                'id'         => $event['id'] ?? null,
                'deviceId'   => $event['deviceId'] ?? null,
                'deviceName' => $device['name'] ?? null,
                'imei'       => $device['uniqueId'] ?? null,
                'occurredAt' => $event['eventTime'] ?? null,
                'source'     => $isThreshold ? 'threshold' : 'sensor',
                'kind'       => $isThreshold ? $type : $alarm,
                'label'      => $isThreshold ? self::FUEL_EVENTS[$type] : self::FUEL_ALARMS[$alarm],
                'before'     => $before !== null ? (float) $before : null,
                'after'      => $after !== null ? (float) $after : null,
                'change'     => ($before !== null && $after !== null) ? round((float) $after - (float) $before, 1) : null,
                'alarmType'  => $event['attributes']['fuelSensorAlarmType'] ?? null,
                'positionId' => $event['positionId'] ?? null,
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['occurredAt'] ?? '', $a['occurredAt'] ?? ''));

        return response()->json($rows);
    }

    /* ─────────────────────────── theft watch ─────────────────────────── */

    /**
     * Slow-siphon detector: the check Traccar's own event logic cannot do.
     *
     * Traccar compares adjacent positions, so fuel drawn gradually never trips it — 40 litres over
     * fifteen minutes is a few tenths between any two fixes. This compares the oldest and newest
     * readings across a whole window instead.
     *
     * The false-positive that matters is ordinary consumption, so a drop is only reported when the
     * vehicle was stationary with the ignition off for *every* position in the window. A vehicle
     * that moved at all is reported as `moved`, with its drop, and explicitly not flagged — the
     * figure is still worth seeing, it just isn't evidence of anything.
     */
    public function theftScan(Request $request)
    {
        $request->validate([
            'deviceId'  => 'nullable|integer',
            'minutes'   => 'nullable|integer|min:5|max:1440',
            'dropPercent' => 'nullable|numeric|min:0.5|max:100',
        ]);

        $minutes     = (int) ($request->minutes ?: 30);
        $dropPercent = (float) ($request->dropPercent ?: 3);

        $devices = $this->visibleDevices($request->deviceId);

        if ($devices instanceof \Illuminate\Http\JsonResponse) {
            return $devices;
        }

        $positionsByDevice = $this->positionsForDevices(
            $devices,
            Carbon::now()->subMinutes($minutes),
            Carbon::now()
        );

        $rows = [];

        foreach ($devices as $device) {
            $positions = $positionsByDevice[$device['id']] ?? [];
            usort($positions, fn ($a, $b) => strcmp($a['fixTime'] ?? '', $b['fixTime'] ?? ''));

            $withFuel = array_values(array_filter(
                $positions,
                fn ($p) => isset($p['attributes']['fuelLevel']) || isset($p['attributes']['fuel'])
            ));

            // One reading cannot describe a change, and none cannot describe anything.
            if (count($withFuel) < 2) {
                continue;
            }

            $first = $withFuel[0];
            $last  = $withFuel[count($withFuel) - 1];

            $readLevel = fn ($p) => $p['attributes']['fuelLevel'] ?? null;
            $readFuel  = fn ($p) => $p['attributes']['fuel'] ?? null;

            $beforeLevel = $readLevel($first);
            $afterLevel  = $readLevel($last);
            $beforeFuel  = $readFuel($first);
            $afterFuel   = $readFuel($last);

            $dropPct = ($beforeLevel !== null && $afterLevel !== null) ? round($beforeLevel - $afterLevel, 2) : null;
            $dropL   = ($beforeFuel !== null && $afterFuel !== null) ? round($beforeFuel - $afterFuel, 2) : null;

            if ($dropL === null && $dropPct !== null) {
                $capacity = $this->resolvedAttribute($device, 'fuelCapacity');
                if ($capacity) {
                    $dropL = round($dropPct * $capacity / 100, 2);
                }
            }

            if ($dropPct === null || $dropPct <= 0) {
                continue;
            }

            // Stationary for the whole window, not just at its ends: a vehicle that drove out and
            // came back would otherwise look parked.
            $moved = false;
            foreach ($positions as $p) {
                if (!empty($p['attributes']['ignition']) || !empty($p['attributes']['motion'])) {
                    $moved = true;
                    break;
                }
            }

            $rows[] = [
                'deviceId'    => $device['id'],
                'deviceName'  => $device['name'] ?? null,
                'imei'        => $device['uniqueId'] ?? null,
                'from'        => $first['fixTime'] ?? null,
                'to'          => $last['fixTime'] ?? null,
                'beforeLevel' => $beforeLevel !== null ? (float) $beforeLevel : null,
                'afterLevel'  => $afterLevel !== null ? (float) $afterLevel : null,
                'dropPercent' => $dropPct,
                'dropLitres'  => $dropL,
                'moved'       => $moved,
                // Only a stationary vehicle losing more than the threshold is called suspicious.
                'suspected'   => !$moved && $dropPct >= $dropPercent,
                'readings'    => count($withFuel),
                'latitude'    => $last['latitude'] ?? null,
                'longitude'   => $last['longitude'] ?? null,
            ];
        }

        usort($rows, fn ($a, $b) => $b['dropPercent'] <=> $a['dropPercent']);

        return response()->json([
            'windowMinutes'   => $minutes,
            'dropPercent'     => $dropPercent,
            'devices'         => $rows,
        ]);
    }

    /* ─────────────────────────── thresholds ─────────────────────────── */

    /**
     * Thresholds as configured, and as they actually resolve.
     *
     * Traccar looks a value up device → group (up the parent chain) → server, first hit wins, so
     * what a device is set to and what it is *governed by* are different questions. Both are
     * returned, with the level each effective value came from, because "no value here" reads as
     * "no threshold at all" otherwise.
     */
    public function settings()
    {
        $server = Http::withBasicAuth(...$this->traccarAuth())->get("{$this->traccarBaseUrl()}/server")->json() ?? [];
        $groups = Http::withBasicAuth(...$this->traccarAuth())->get("{$this->traccarBaseUrl()}/groups")->json() ?? [];
        $devices = $this->visibleDevices(null);

        $groupsById = collect($groups)->keyBy('id');

        $deviceRows = array_map(function ($device) use ($groupsById, $server) {
            $effective = [];

            foreach (self::THRESHOLD_KEYS as $key) {
                $effective[$key] = $this->resolveWithSource($device, $groupsById, $server, $key);
            }

            return [
                'id'         => $device['id'],
                'name'       => $device['name'] ?? null,
                'imei'       => $device['uniqueId'] ?? null,
                'groupId'    => $device['groupId'] ?? null,
                'groupName'  => $groupsById->get($device['groupId'] ?? 0)['name'] ?? null,
                'own'        => $this->pickKeys($device['attributes'] ?? []),
                'effective'  => $effective,
            ];
        }, $devices);

        return response()->json([
            'server'  => $this->pickKeys($server['attributes'] ?? []),
            'groups'  => array_map(fn ($g) => [
                'id'         => $g['id'],
                'name'       => $g['name'] ?? null,
                'groupId'    => $g['groupId'] ?? null,
                'attributes' => $this->pickKeys($g['attributes'] ?? []),
            ], $groups),
            'devices' => $deviceRows,
        ]);
    }

    /**
     * Writes thresholds at one level.
     *
     * Traccar takes full-object PUTs, not patches, so the object is read back, this module's keys
     * are merged into its attributes, and the whole thing is written again. Sending only the keys
     * being changed would silently wipe every other attribute on the device — which on a device is
     * where things like speedLimit and the report settings live.
     *
     * A null value removes the key, which is how a device is handed back to its group's value.
     */
    public function updateSettings(Request $request)
    {
        $data = $request->validate([
            'scope'                 => 'required|in:server,group,device',
            'id'                    => 'required_unless:scope,server|integer',
            'fuelDropThreshold'     => 'present|nullable|numeric|min:0',
            'fuelIncreaseThreshold' => 'present|nullable|numeric|min:0',
            'fuelCapacity'          => 'present|nullable|numeric|min:0',
        ]);

        $path = match ($data['scope']) {
            'server' => '/server',
            'group'  => "/groups/{$data['id']}",
            'device' => "/devices/{$data['id']}",
        };

        $read = Http::withBasicAuth(...$this->traccarAuth())->get("{$this->traccarBaseUrl()}{$path}");

        if (!$read->successful()) {
            return response()->json(['message' => 'Could not read the current settings from Traccar.'], $read->status());
        }

        // /server returns the object directly; /groups/{id} and /devices/{id} do too, but a tenant
        // asking for something they cannot see gets an error above rather than an empty body here.
        $object = $read->json();

        if (!is_array($object) || !isset($object['id'])) {
            return response()->json(['message' => 'Unexpected response from Traccar.'], 502);
        }

        $attributes = (array) ($object['attributes'] ?? []);

        foreach (self::THRESHOLD_KEYS as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }

            if ($data[$key] === null) {
                unset($attributes[$key]);
            } else {
                $attributes[$key] = $data[$key] + 0;
            }
        }

        $object['attributes'] = (object) $attributes;

        $write = Http::withBasicAuth(...$this->traccarAuth())
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->traccarBaseUrl()}{$path}", $object);

        if (!$write->successful()) {
            return response()->json([
                'message' => 'Traccar rejected the update (HTTP ' . $write->status() . '). ' . trim(strtok($write->body(), "\n") ?: ''),
            ], $write->status());
        }

        return response()->json(['ok' => true, 'attributes' => $this->pickKeys($attributes)]);
    }

    /* ─────────────────────────── helpers ─────────────────────────── */

    /** @return array|\Illuminate\Http\JsonResponse */
    private function visibleDevices(?int $deviceId)
    {
        $devices = Http::withBasicAuth(...$this->traccarAuth())
            ->get("{$this->traccarBaseUrl()}/devices")
            ->json() ?? [];

        if ($deviceId === null) {
            return $devices;
        }

        $devices = array_values(array_filter($devices, fn ($d) => $d['id'] == $deviceId));

        return $devices ?: response()->json(['message' => 'That device is not visible to this account.'], 404);
    }

    /** deviceId => positions, fetched as a pool rather than in series. */
    private function positionsForDevices(array $devices, Carbon $from, Carbon $to): array
    {
        if (empty($devices)) {
            return [];
        }

        $params = ['from' => $from->utc()->toISOString(), 'to' => $to->utc()->toISOString()];

        $responses = Http::pool(fn ($pool) => array_map(
            fn ($d) => $pool->as((string) $d['id'])
                ->withBasicAuth(...$this->traccarAuth())
                ->withHeaders(['Accept' => 'application/json'])
                ->get("{$this->traccarBaseUrl()}/positions", $params + ['deviceId' => $d['id']]),
            $devices
        ));

        $byDevice = [];

        foreach ($devices as $device) {
            $response = $responses[(string) $device['id']] ?? null;
            // One device failing must not cost the rest of the fleet's readings.
            $byDevice[$device['id']] = ($response && $response->successful()) ? ($response->json() ?? []) : [];
        }

        return $byDevice;
    }

    /** Walks newest-first positions, keeping the first real value found for each fuel attribute. */
    private function latestFuelReading(array $positions): array
    {
        $level = null;
        $litres = null;
        $sensorType = null;
        $tanks = [];
        $probes = [];

        foreach ($positions as $position) {
            $attributes = $position['attributes'] ?? [];
            $at         = $position['fixTime'] ?? null;

            if ($level === null && isset($attributes['fuelLevel'])) {
                $level = $this->stamp((float) $attributes['fuelLevel'], $at);
            }

            if ($litres === null && isset($attributes['fuel'])) {
                $litres = $this->stamp((float) $attributes['fuel'], $at);
            }

            if ($sensorType === null && isset($attributes['fuelSensorType'])) {
                $sensorType = $attributes['fuelSensorType'];
            }

            // Multi-tank: fuelLevel2, fuelLevel3, …
            foreach ($attributes as $key => $value) {
                if (preg_match('/^fuelLevel(\d+)$/', $key, $m) && !isset($tanks[$m[1]])) {
                    $tanks[$m[1]] = ['tank' => (int) $m[1]] + $this->stamp((float) $value, $at);
                }
            }

            // Per-probe detail: fuel1Value / Range / Error / Battery / Name / Mac / Id.
            foreach ($this->probes($attributes) as $probe) {
                if (!isset($probes[$probe['index']])) {
                    $probes[$probe['index']] = $probe + $this->stamp(null, $at);
                }
            }
        }

        ksort($tanks);
        ksort($probes);

        return [
            'level'      => $level,
            'litres'     => $litres,
            'sensorType' => $sensorType,
            'tanks'      => array_values($tanks),
            'probes'     => array_values($probes),
        ];
    }

    /** Probes present on one position, keyed by the index the device reported them under. */
    private function probes(array $attributes): array
    {
        $indices = [];

        foreach (array_keys($attributes) as $key) {
            if (preg_match('/^fuel(\d+)[A-Z]/', $key, $m)) {
                $indices[(int) $m[1]] = true;
            }
        }

        $probes = [];

        foreach (array_keys($indices) as $i) {
            $value = $attributes["fuel{$i}Value"] ?? null;

            // A name or a MAC on its own is configuration, not a reading.
            if ($value === null) {
                continue;
            }

            $range = $attributes["fuel{$i}Range"] ?? null;

            $probes[] = [
                'index'   => $i,
                'name'    => $attributes["fuel{$i}Name"] ?? null,
                'mac'     => $attributes["fuel{$i}Mac"] ?? null,
                'sensorId'=> $attributes["fuel{$i}Id"] ?? null,
                'value'   => (float) $value,
                'range'   => $range !== null ? (float) $range : null,
                // The same percentage Traccar computes for fuelLevel, kept per probe so a
                // multi-tank vehicle can be read tank by tank.
                'percent' => ($range) ? round((float) $value / (float) $range * 100, 1) : null,
                'error'   => $attributes["fuel{$i}Error"] ?? null,
                'battery' => $attributes["fuel{$i}Battery"] ?? null,
            ];
        }

        return $probes;
    }

    private function stamp(?float $value, ?string $at): array
    {
        $ageMinutes = $at ? (int) round(Carbon::parse($at)->diffInSeconds(Carbon::now()) / 60) : null;

        return [
            'value'      => $value,
            'reportedAt' => $at,
            'ageMinutes' => $ageMinutes,
            'stale'      => $ageMinutes === null || $ageMinutes > self::STALE_AFTER_MINUTES,
        ];
    }

    private function pickKeys(array $attributes): array
    {
        return array_intersect_key((array) $attributes, array_flip(self::THRESHOLD_KEYS));
    }

    /** A device's own value for a key, or null — used where the resolution chain is not needed. */
    private function resolvedAttribute(array $device, string $key): ?float
    {
        $value = $device['attributes'][$key] ?? null;

        return $value === null ? null : (float) $value;
    }

    /**
     * Traccar's own lookup order: device, then up the group parent chain, then server.
     *
     * @return array{value: float|null, source: string|null}
     */
    private function resolveWithSource(array $device, $groupsById, array $server, string $key): array
    {
        if (isset($device['attributes'][$key])) {
            return ['value' => (float) $device['attributes'][$key], 'source' => 'device'];
        }

        $groupId = $device['groupId'] ?? null;
        $seen    = [];

        while ($groupId && !isset($seen[$groupId])) {
            $seen[$groupId] = true;
            $group = $groupsById->get($groupId);

            if (!$group) {
                break;
            }

            if (isset($group['attributes'][$key])) {
                return ['value' => (float) $group['attributes'][$key], 'source' => 'group:' . ($group['name'] ?? $groupId)];
            }

            $groupId = $group['groupId'] ?? null;
        }

        if (isset($server['attributes'][$key])) {
            return ['value' => (float) $server['attributes'][$key], 'source' => 'server'];
        }

        return ['value' => null, 'source' => null];
    }
}
