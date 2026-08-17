<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/**
 * Temperature / humidity and tyre (TPMS) readings.
 *
 * Traccar has no sensor endpoint: every reading is an attribute on a position, so all of this is
 * read off /positions and /reports/events.
 *
 * The awkward part is that sensor modules do not ride on every packet — the device sends them on
 * their own message types while ordinary GPS updates carry none — so the *latest* position very
 * often has no temp1 or tyre1Pressure at all. Asking Traccar to copy attributes forward
 * (processing.copyAttributes) would paper over that, at the cost of making an hour-old reading
 * indistinguishable from one taken a second ago.
 *
 * For a cold chain and for tyre safety that trade is the wrong way round: "18°C, ninety minutes
 * ago" is a different fact from "18°C, now", and only one of them is a compliance record. So this
 * walks a window of history backwards instead, keeping each reading's own timestamp and reporting
 * how old it is. The UI can then show a stale reading as stale rather than as current.
 */
class SensorController extends Controller
{
    use UsesTraccarApi;

    /** How far back to look for the newest actual reading, when the caller does not say. */
    private const DEFAULT_LOOKBACK_HOURS = 6;

    /** Beyond this a reading is old enough that presenting it as "current" would be misleading. */
    private const STALE_AFTER_MINUTES = 30;

    private const TEMPERATURE_KEYS = ['temp1', 'temp2', 'temp3', 'temp4'];
    private const HUMIDITY_KEYS    = ['humidity', 'humidity2', 'humidity3', 'humidity4'];

    /** Alarm kinds raised by these sensors, as they arrive in attributes.alarm. */
    public const SENSOR_ALARMS = [
        'temperature'         => 'Temperature out of range',
        'humidity'            => 'Humidity out of range',
        'tyreHighPressure'    => 'Tyre over-pressure',
        'tyreLowPressure'     => 'Tyre under-pressure',
        'tyreHighTemperature' => 'Tyre over-temperature',
        'tyreRapidDeflation'  => 'Rapid deflation',
        'tyreSlowDeflation'   => 'Slow deflation',
        'tyreInflation'       => 'Inflation',
        'tyreLowBattery'      => 'Tyre sensor battery low',
        'tyreFault'           => 'Tyre sensor fault',
    ];

    /**
     * Newest actual reading per sensor, per device, each with the time it was really taken.
     *
     * One /positions call per device (they are issued as a pool, not in series) over the lookback
     * window, walked newest-first, taking the first position that genuinely carries each key.
     */
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

        if (empty($devices)) {
            return response()->json(['lookbackHours' => $hours, 'devices' => []]);
        }

        $params = [
            'from' => Carbon::now()->subHours($hours)->utc()->toISOString(),
            'to'   => Carbon::now()->utc()->toISOString(),
        ];

        $responses = Http::pool(fn ($pool) => array_map(
            fn ($d) => $pool->as((string) $d['id'])
                ->withBasicAuth(...$this->traccarAuth())
                ->withHeaders(['Accept' => 'application/json'])
                ->get("{$this->traccarBaseUrl()}/positions", $params + ['deviceId' => $d['id']]),
            $devices
        ));

        $rows = [];

        foreach ($devices as $device) {
            $response = $responses[(string) $device['id']] ?? null;

            // One device's history failing should not blank the rest of the fleet's readings.
            $positions = ($response && $response->successful()) ? ($response->json() ?? []) : [];

            // Newest first: the first position carrying a key holds that key's current value.
            usort($positions, fn ($a, $b) => strcmp($b['fixTime'] ?? '', $a['fixTime'] ?? ''));

            $reading = $this->latestReadings($positions);

            $rows[] = [
                'deviceId'      => $device['id'],
                'deviceName'    => $device['name'] ?? null,
                'imei'          => $device['uniqueId'] ?? null,
                'status'        => $device['status'] ?? null,
                'temperatures'  => $reading['temperatures'],
                'humidity'      => $reading['humidity'],
                'tyres'         => $reading['tyres'],
                'tyreAlarms'    => $reading['tyreAlarms'],
                // True when nothing in the whole window carried a sensor reading — which is a
                // different statement from "the sensor read zero".
                'hasSensors'    => $reading['temperatures'] || $reading['humidity'] || $reading['tyres'],
                'positionCount' => count($positions),
            ];
        }

        return response()->json(['lookbackHours' => $hours, 'devices' => $rows]);
    }

    /**
     * Every reading in a window, oldest first — the series behind a chart or an export.
     *
     * Uses /reports/route, which takes several deviceIds at once, and keeps only the positions that
     * actually carry a sensor value. Positions without one are ordinary GPS packets and would only
     * pad the series with blanks.
     */
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

        $devicesById = collect($devices)->keyBy('id');

        $params = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
        ];

        // /reports/route returns nothing for some of these devices, so history is read the same way
        // current() reads it — per device off /positions, which does return the sensor attributes.
        $responses = Http::pool(fn ($pool) => array_map(
            fn ($d) => $pool->as((string) $d['id'])
                ->withBasicAuth(...$this->traccarAuth())
                ->withHeaders(['Accept' => 'application/json'])
                ->get("{$this->traccarBaseUrl()}/positions", $params + ['deviceId' => $d['id']]),
            $devices
        ));

        $rows = [];

        foreach ($devices as $device) {
            $response = $responses[(string) $device['id']] ?? null;

            if (!$response || !$response->successful()) {
                continue;
            }

            foreach ($response->json() ?? [] as $position) {
                $attributes = $position['attributes'] ?? [];

                $temperatures = $this->pick($attributes, self::TEMPERATURE_KEYS);
                $humidity     = $this->pick($attributes, self::HUMIDITY_KEYS);
                $tyres        = $this->tyres($attributes);

                if (!$temperatures && !$humidity && !$tyres) {
                    continue;
                }

                $rows[] = [
                    'deviceId'     => $device['id'],
                    'deviceName'   => $device['name'] ?? null,
                    'imei'         => $device['uniqueId'] ?? null,
                    'recordedAt'   => $position['fixTime'] ?? null,
                    'temperatures' => $temperatures,
                    'humidity'     => $humidity,
                    'tyres'        => $tyres,
                    'alarm'        => $attributes['alarm'] ?? null,
                    'latitude'     => $position['latitude'] ?? null,
                    'longitude'    => $position['longitude'] ?? null,
                ];
            }
        }

        usort($rows, fn ($a, $b) => strcmp($a['recordedAt'] ?? '', $b['recordedAt'] ?? ''));

        return response()->json($rows);
    }

    /** Sensor alarms in a window, newest first — the incidents behind the readings. */
    public function alarms(Request $request)
    {
        $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after:from',
            'deviceId' => 'nullable|integer',
        ]);

        $query = [
            'from' => Carbon::parse($request->from)->utc()->toISOString(),
            'to'   => Carbon::parse($request->to)->utc()->toISOString(),
            'type' => 'alarm',
        ];

        if ($request->filled('deviceId')) {
            $query['deviceId'] = $request->deviceId;
        }

        $response = Http::withBasicAuth(...$this->traccarAuth())
            ->withHeaders(['Accept' => 'application/json'])
            ->get("{$this->traccarBaseUrl()}/reports/events", $query);

        if (!$response->successful()) {
            return response()->json(['message' => 'Failed to load sensor alarms.'], $response->status());
        }

        $devices     = Http::withBasicAuth(...$this->traccarAuth())->get("{$this->traccarBaseUrl()}/devices")->json() ?? [];
        $devicesById = collect($devices)->keyBy('id');

        $rows = [];

        foreach ($response->json() ?? [] as $event) {
            $alarm = $event['attributes']['alarm'] ?? null;

            // Only this module's alarms: the same feed carries SOS and harsh driving, which belong
            // to the driver-behaviour reports rather than here.
            if ($alarm === null || !isset(self::SENSOR_ALARMS[$alarm])) {
                continue;
            }

            $device = $devicesById->get($event['deviceId'] ?? null);

            $rows[] = [
                'id'         => $event['id'] ?? null,
                'deviceId'   => $event['deviceId'] ?? null,
                'deviceName' => $device['name'] ?? null,
                'imei'       => $device['uniqueId'] ?? null,
                'alarm'      => $alarm,
                'label'      => self::SENSOR_ALARMS[$alarm],
                'kind'       => str_starts_with($alarm, 'tyre') ? 'tyre' : 'climate',
                'occurredAt' => $event['eventTime'] ?? null,
                'positionId' => $event['positionId'] ?? null,
            ];
        }

        usort($rows, fn ($a, $b) => strcmp($b['occurredAt'] ?? '', $a['occurredAt'] ?? ''));

        return response()->json($rows);
    }

    /**
     * Devices this caller can see, optionally narrowed to one.
     *
     * @return array|\Illuminate\Http\JsonResponse
     */
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

    /** Walks newest-first positions, keeping the first real value found for each sensor. */
    private function latestReadings(array $positions): array
    {
        $temperatures = [];
        $humidity     = [];
        $tyres        = [];
        $tyreAlarms   = [];

        foreach ($positions as $position) {
            $attributes = $position['attributes'] ?? [];
            $at         = $position['fixTime'] ?? null;

            foreach (self::TEMPERATURE_KEYS as $key) {
                if (!isset($temperatures[$key]) && isset($attributes[$key])) {
                    $temperatures[$key] = $this->stamp((float) $attributes[$key], $at) + ['key' => $key];
                }
            }

            foreach (self::HUMIDITY_KEYS as $key) {
                if (!isset($humidity[$key]) && isset($attributes[$key])) {
                    $humidity[$key] = $this->stamp((float) $attributes[$key], $at) + ['key' => $key];
                }
            }

            foreach ($this->tyres($attributes) as $tyre) {
                // Keyed on the sensor's own index, so a wheel that reported ten minutes ago is not
                // overwritten by an older packet from a different wheel.
                if (!isset($tyres[$tyre['index']])) {
                    $tyres[$tyre['index']] = $tyre + $this->stamp(null, $at);
                }
            }

            if (!$tyreAlarms && !empty($attributes['tyreAlarmPositions'])) {
                $tyreAlarms = array_values(array_filter(array_map('trim', explode(',', $attributes['tyreAlarmPositions']))));
            }
        }

        // Sorted by the sensor's own axle/position, not by the order the device happened to report
        // them — the index is a transport detail, the axle is where the wheel actually is.
        $tyres = array_values($tyres);
        usort($tyres, fn ($a, $b) => [$a['axle'] ?? 99, $a['position'] ?? 99] <=> [$b['axle'] ?? 99, $b['position'] ?? 99]);

        return [
            'temperatures' => array_values($temperatures),
            'humidity'     => array_values($humidity),
            'tyres'        => $tyres,
            'tyreAlarms'   => $tyreAlarms,
        ];
    }

    /** value + when it was really read + how stale that makes it. */
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

    /** @return list<array{key: string, value: float, ...}> the given keys that are actually present */
    private function pick(array $attributes, array $keys): array
    {
        $found = [];

        foreach ($keys as $key) {
            if (isset($attributes[$key])) {
                $found[] = ['key' => $key, 'value' => (float) $attributes[$key]];
            }
        }

        return $found;
    }

    /**
     * Tyre sensors present on one position.
     *
     * Numbering runs tyre1…tyreN in whatever order the device reports them, so the index is not a
     * wheel position — tyre{i}Axle and tyre{i}Index are. Both are carried through so the UI can map
     * a reading onto a vehicle diagram rather than guessing from the array order.
     */
    private function tyres(array $attributes): array
    {
        $indices = [];

        foreach (array_keys($attributes) as $key) {
            if (preg_match('/^tyre(\d+)[A-Z]/', $key, $m)) {
                $indices[(int) $m[1]] = true;
            }
        }

        $tyres = [];

        foreach (array_keys($indices) as $i) {
            $pressure = $attributes["tyre{$i}Pressure"] ?? null;
            $temp     = $attributes["tyre{$i}Temp"] ?? null;

            // A sensor id or an axle on its own is configuration, not a reading.
            if ($pressure === null && $temp === null) {
                continue;
            }

            $tyres[] = [
                'index'       => $i,
                'axle'        => $attributes["tyre{$i}Axle"] ?? null,
                'position'    => $attributes["tyre{$i}Index"] ?? null,
                'sensorId'    => $attributes["tyre{$i}SensorId"] ?? null,
                'pressureBar' => $pressure !== null ? (float) $pressure : null,
                'temperature' => $temp !== null ? (float) $temp : null,
                'moving'      => $attributes["tyre{$i}Moving"] ?? null,
            ];
        }

        return $tyres;
    }
}
