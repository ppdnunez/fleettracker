<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/**
 * Engine data read off the vehicle's OBD-II / CAN bus.
 *
 * Like every other sensor family, this has no endpoint of its own in Traccar: each figure is an
 * attribute on a position, so all of it comes from /positions. And like the temperature and tyre
 * modules, OBD frames do not ride on every packet — an ordinary GPS update carries none of them —
 * so the newest position is usually not the newest engine reading. History is therefore walked
 * backwards for the first position that genuinely carries each key, and every value is returned
 * with the time it was actually taken. A reading from forty minutes ago is shown as forty minutes
 * old rather than as "now".
 *
 * Two pairs of values look interchangeable and are not:
 *
 *   - obdOdometer is the vehicle's own dash reading. totalDistance is Traccar's GPS-accumulated
 *     distance since the device was registered. They will never agree, and averaging or
 *     substituting one for the other silently invents mileage. Both are returned, labelled.
 *   - obdSpeed is km/h from the engine; the position's own `speed` is knots from GPS. They are
 *     returned in the same unit so they can be compared, because a persistent disagreement is a
 *     real diagnostic — a mis-scaled sensor, or a wheel-speed reading that no longer matches.
 */
class ObdController extends Controller
{
    use UsesTraccarApi;

    private const DEFAULT_LOOKBACK_HOURS = 6;

    /** Beyond this, presenting a reading as current would be misleading. */
    private const STALE_AFTER_MINUTES = 30;

    /**
     * Keys only the OBD stream produces. Presence of any one of them makes a frame an OBD frame.
     *
     * This list is doing more than labelling units: it is the evidence test. Everything read from
     * a frame — including the shared keys below — depends on the frame first proving itself here.
     */
    public const METRICS = [
        'rpm'             => ['label' => 'Engine speed',    'unit' => 'rpm'],
        'obdSpeed'        => ['label' => 'OBD speed',       'unit' => 'km/h'],
        'coolantTemp'     => ['label' => 'Coolant',         'unit' => '°C'],
        'engineLoad'      => ['label' => 'Engine load',     'unit' => '%'],
        'throttle'        => ['label' => 'Throttle',        'unit' => '%'],
        'fuelConsumption' => ['label' => 'Consumption',     'unit' => 'L/h'],
        'fuelUsed'        => ['label' => 'Fuel used',       'unit' => 'L'],
        'obdOdometer'     => ['label' => 'Dash odometer',   'unit' => 'm'],
    ];

    /**
     * Keys the OBD stream writes that something else already writes too.
     *
     * These are read *only* from frames that have already proven themselves OBD frames by carrying
     * a key from METRICS. Both are live in this deployment today with no OBD anywhere: `power`
     * appears on 571 positions from the tracker's own supply line, and `fuelLevel` on 940 from the
     * BLE probe (fuelSensorType 0). Reading either as engine data would attribute the tracker's
     * battery voltage to the vehicle's ECU, and the probe's tank reading to the OBD stream.
     *
     * fuelLevel in particular is the documented collision: the probe (0x0002/0x0076) and the OBD
     * stream (0xFEFC) write the same key, and on a vehicle with both, whichever module the device
     * sends last wins. The provenance gate is why that is survivable — a value here is known to
     * have arrived on an OBD frame, and `fuelLevelAmbiguous` says when the other source is also
     * present so the UI can show which reading is which.
     */
    private const SHARED_KEYS = [
        'power'     => ['label' => 'OBD supply', 'unit' => 'V'],
        'fuelLevel' => ['label' => 'Tank level', 'unit' => '%'],
    ];

    /*
     * Deliberately absent: `hours`. Traccar's engine-hours counter is accumulated by the tracker
     * from ignition state, not read from the bus, and every device in a fleet sends it. Counting it
     * here made all three test devices report hasObd = true when none decodes OBD at all — the
     * exact false positive this module exists to avoid. Engine hours belong to the device reports.
     */

    /** Values that identify the vehicle rather than measure it — from the 0x0016 handshake. */
    private const IDENTITY_KEYS = ['vin', 'vehicleModel'];

    /** The dongle's own state, reported alongside the readings. */
    private const OBD_STATUS = [
        0x5A => 'Normal',
        0xA5 => 'Firmware upgrading',
        0xAA => 'Sleeping',
    ];

    /**
     * Passthrough fields for frames the decoder could not fully interpret.
     *
     * obdRaw carries the undecoded hex of a sub-type with no documented layout, and
     * obdChecksumValid is present and false only when the XOR check failed. Both matter for
     * commissioning a new vehicle: they are the difference between "this vehicle sends nothing"
     * and "this vehicle sends something we are not reading yet".
     */
    private const DIAGNOSTIC_KEYS = ['obdMessageId', 'obdVehicleType', 'obdSubType', 'obdRaw', 'obdChecksumValid'];

    /**
     * Newest genuine value for each OBD metric, per device.
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

            $rows[] = $this->latestReading($device, $positions) + ['positionCount' => count($positions)];
        }

        return response()->json(['lookbackHours' => $hours, 'devices' => $rows]);
    }

    /**
     * Every OBD-carrying position in a window, oldest first — the series behind a chart.
     *
     * Positions with no OBD attribute at all are dropped rather than returned as blanks: they are
     * ordinary GPS packets, and padding the series with them turns a sparse feed into a chart full
     * of holes that look like engine stoppages.
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

        $positionsByDevice = $this->positionsForDevices(
            $devices,
            Carbon::parse($request->from),
            Carbon::parse($request->to)
        );

        $rows = [];

        foreach ($devices as $device) {
            foreach ($positionsByDevice[$device['id']] ?? [] as $position) {
                $attributes = $position['attributes'] ?? [];

                // Only OBD frames. A GPS packet carrying `power` or a probe frame carrying
                // `fuelLevel` would otherwise appear here as an engine reading.
                if (!$this->isObdFrame($attributes)) {
                    continue;
                }

                $values = [];

                foreach (array_keys(self::METRICS) as $key) {
                    if (isset($attributes[$key])) {
                        $values[$key] = (float) $attributes[$key];
                    }
                }

                foreach (array_keys(self::SHARED_KEYS) as $key) {
                    if (isset($attributes[$key])) {
                        $values[$key] = (float) $attributes[$key];
                    }
                }

                $rows[] = [
                    'deviceId'   => $device['id'],
                    'deviceName' => $device['name'] ?? null,
                    'imei'       => $device['uniqueId'] ?? null,
                    'recordedAt' => $position['fixTime'] ?? null,
                    'values'     => $values,
                    'dtcs'       => $this->splitDtcs($attributes['dtcs'] ?? null),
                    'ignition'   => $attributes['ignition'] ?? null,
                    'obdStatus'  => isset($attributes['obdStatus']) ? $this->describeObdStatus($attributes['obdStatus']) : null,
                    // Present and false only on a failed XOR check — the frame arrived but its
                    // contents cannot be trusted, which is not the same as no frame at all.
                    'checksumValid' => $attributes['obdChecksumValid'] ?? null,
                    'raw'           => $attributes['obdRaw'] ?? null,
                    // GPS speed alongside the engine's own, in one unit — see the class comment.
                    'gpsSpeedKmh' => isset($position['speed']) ? round((float) $position['speed'] * 1.852, 1) : null,
                    'latitude'    => $position['latitude'] ?? null,
                    'longitude'   => $position['longitude'] ?? null,
                ];
            }
        }

        usort($rows, fn ($a, $b) => strcmp($a['recordedAt'] ?? '', $b['recordedAt'] ?? ''));

        return response()->json($rows);
    }

    /**
     * Diagnostic trouble codes as faults that appear and clear, rather than as one row per packet.
     *
     * A stored code is repeated on every OBD frame for as long as it is set, so listing raw
     * occurrences would report one fault thousands of times. Positions are walked oldest-first per
     * device and each code is tracked as a span: first seen, last seen, and whether it is still
     * present in the newest frame. That is what a workshop needs — when it appeared, and whether
     * it went away on its own.
     */
    public function faults(Request $request)
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
            $positions = $positionsByDevice[$device['id']] ?? [];
            usort($positions, fn ($a, $b) => strcmp($a['fixTime'] ?? '', $b['fixTime'] ?? ''));

            $open      = [];   // code => row index, while the code is still being reported
            $lastFrame = null; // the newest frame that carried a dtcs key at all

            foreach ($positions as $position) {
                $attributes = $position['attributes'] ?? [];

                // Only frames that carry the key say anything about faults. A GPS packet without it
                // is silence, not "the codes cleared".
                if (!array_key_exists('dtcs', $attributes)) {
                    continue;
                }

                $at      = $position['fixTime'] ?? null;
                $present = $this->splitDtcs($attributes['dtcs']);
                $lastFrame = $at;

                foreach ($present as $code) {
                    if (isset($open[$code])) {
                        $rows[$open[$code]]['lastSeen'] = $at;
                        $rows[$open[$code]]['frames']++;
                        continue;
                    }

                    $rows[] = [
                        'deviceId'   => $device['id'],
                        'deviceName' => $device['name'] ?? null,
                        'imei'       => $device['uniqueId'] ?? null,
                        'code'       => $code,
                        'firstSeen'  => $at,
                        'lastSeen'   => $at,
                        'frames'     => 1,
                        'active'     => true,
                        'latitude'   => $position['latitude'] ?? null,
                        'longitude'  => $position['longitude'] ?? null,
                    ] + $this->describeDtc($code);

                    $open[$code] = array_key_last($rows);
                }

                // A code missing from a frame that did report codes has been cleared.
                foreach (array_keys($open) as $code) {
                    if (!in_array($code, $present, true)) {
                        $rows[$open[$code]]['active'] = false;
                        unset($open[$code]);
                    }
                }
            }

            // Anything still open at the end of the window is still set as of the last frame.
            foreach ($open as $index) {
                $rows[$index]['active']    = true;
                $rows[$index]['lastFrame'] = $lastFrame;
            }
        }

        usort($rows, fn ($a, $b) => strcmp($b['firstSeen'] ?? '', $a['firstSeen'] ?? ''));

        return response()->json($rows);
    }

    /* ─────────────────────────── internals ─────────────────────────── */

    /**
     * @return array<int, array> deviceId => positions, fetched as a pool rather than in series
     */
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

            // One device's history failing must not blank the rest of the fleet.
            $byDevice[$device['id']] = ($response && $response->successful()) ? ($response->json() ?? []) : [];
        }

        return $byDevice;
    }

    /** Walks newest-first positions, keeping the first real value found for each key. */
    private function latestReading(array $device, array $positions): array
    {
        $metrics     = [];
        $shared      = [];
        $identity    = [];
        $diagnostics = [];
        $dtcs        = null;
        $gpsKmh      = null;
        $gpsTotal    = null;
        $status      = null;
        $compatible  = null;
        $checksumFailures = 0;
        $probeFuelLevel   = false;

        foreach ($positions as $position) {
            $attributes = $position['attributes'] ?? [];
            $at         = $position['fixTime'] ?? null;
            $isObdFrame = $this->isObdFrame($attributes);

            // The other writer of fuelLevel, so the UI can say which source a tank reading came
            // from rather than presenting the probe's number as the engine's.
            if (!$isObdFrame && isset($attributes['fuelLevel'])) {
                $probeFuelLevel = true;
            }

            if (($attributes['obdChecksumValid'] ?? null) === false) {
                $checksumFailures++;
            }

            if ($isObdFrame) {
                foreach (self::SHARED_KEYS as $key => $meta) {
                    if (!isset($shared[$key]) && isset($attributes[$key])) {
                        $shared[$key] = $this->stamp((float) $attributes[$key], $at);
                    }
                }

                foreach (self::DIAGNOSTIC_KEYS as $key) {
                    if (!array_key_exists($key, $diagnostics) && array_key_exists($key, $attributes)) {
                        $diagnostics[$key] = $attributes[$key];
                    }
                }

                if ($status === null && isset($attributes['obdStatus'])) {
                    $status = $this->describeObdStatus($attributes['obdStatus']);
                }

                if ($compatible === null && isset($attributes['obdCompatible'])) {
                    $compatible = (bool) $attributes['obdCompatible'];
                }
            }

            foreach (array_keys(self::METRICS) as $key) {
                if (!isset($metrics[$key]) && isset($attributes[$key])) {
                    $metrics[$key] = $this->stamp((float) $attributes[$key], $at);

                    // The GPS speed to compare against is the one from *this* frame, not the
                    // newest one. OBD frames are sparse and plain GPS packets are not, so taking
                    // the newest of each would put a stationary GPS reading beside a ten-minute-old
                    // engine speed and make a healthy sensor look broken.
                    if ($key === 'obdSpeed' && isset($position['speed'])) {
                        $gpsKmh = round((float) $position['speed'] * 1.852, 1);
                    }
                }
            }

            foreach (self::IDENTITY_KEYS as $key) {
                if (!isset($identity[$key]) && isset($attributes[$key])) {
                    $identity[$key] = $attributes[$key];
                }
            }

            if ($dtcs === null && isset($attributes['dtcs'])) {
                $dtcs = [
                    'codes'      => array_map(fn ($c) => $this->describeDtc($c) + ['code' => $c], $this->splitDtcs($attributes['dtcs'])),
                    'reportedAt' => $at,
                ];
            }

            // Traccar's own accumulated distance, for the odometer comparison. Unlike speed this
            // is cumulative, so the newest value is the right one whichever frame carries it.
            if ($gpsTotal === null && isset($attributes['totalDistance'])) {
                $gpsTotal = (float) $attributes['totalDistance'];
            }
        }

        $odometer = $metrics['obdOdometer']['value'] ?? null;

        return [
            'deviceId'   => $device['id'],
            'deviceName' => $device['name'] ?? null,
            'imei'       => $device['uniqueId'] ?? null,
            'status'     => $device['status'] ?? null,
            'metrics'    => $metrics,
            'shared'     => $shared,
            'vin'          => $identity['vin'] ?? null,
            'vehicleModel' => $identity['vehicleModel'] ?? null,
            'obdStatus'    => $status,
            'obdCompatible' => $compatible,
            'diagnostics'  => $diagnostics,
            // Frames that arrived but failed their XOR check, so the operator knows the difference
            // between a silent vehicle and one whose data is being discarded.
            'checksumFailures' => $checksumFailures,
            // True when the BLE probe is also writing fuelLevel: two sources, one key, and on a
            // vehicle with both the last module sent wins in Traccar.
            'fuelLevelAmbiguous' => $probeFuelLevel && isset($shared['fuelLevel']),
            'dtcs'       => $dtcs,
            // Deliberately separate fields, never merged: the dash reading and Traccar's own
            // GPS-accumulated distance measure different things and will always differ.
            'distance'   => [
                'obdOdometerKm'  => $odometer !== null ? round($odometer / 1000, 1) : null,
                'gpsTotalKm'     => $gpsTotal !== null ? round($gpsTotal / 1000, 1) : null,
            ],
            'speed'      => [
                'obdKmh' => $metrics['obdSpeed']['value'] ?? null,
                'gpsKmh' => $gpsKmh,
            ],
            // Nothing in the whole window carried an OBD attribute — a different statement from
            // "the engine reported zero", and the only honest thing to show for a device with no
            // OBD accessory fitted. Deliberately not satisfied by the shared keys: `power` and
            // `fuelLevel` arrive from the tracker and the BLE probe on vehicles with no OBD at all.
            'hasObd'     => $metrics !== [] || $dtcs !== null || $status !== null || $diagnostics !== [],
        ];
    }

    /**
     * Did this frame come from the OBD stream?
     *
     * Presence of any key only the OBD decoder writes. This is the gate every shared value passes
     * through, and it is why `power` from the tracker's supply line and `fuelLevel` from the BLE
     * probe are never mistaken for engine data — neither appears on a frame that also carries rpm,
     * a dongle status, or a diagnostic passthrough field.
     */
    private function isObdFrame(array $attributes): bool
    {
        foreach (array_keys(self::METRICS) as $key) {
            if (isset($attributes[$key])) {
                return true;
            }
        }

        foreach (['obdStatus', 'obdCompatible', 'obdMessageId', 'obdSubType', 'obdVehicleType', 'obdRaw', 'dtcs', 'vin', 'vehicleModel'] as $key) {
            if (array_key_exists($key, $attributes)) {
                return true;
            }
        }

        return false;
    }

    /**
     * The dongle's own state byte.
     *
     * Documented as hex (0x5A / 0xA5 / 0xAA), but a decoder may hand it over as an integer or as a
     * hex string, so both are accepted. An unrecognised value is reported as itself rather than
     * mapped to the nearest known state — "upgrading" is a claim worth being right about.
     */
    private function describeObdStatus(mixed $raw): array
    {
        $value = is_string($raw) ? (int) hexdec(ltrim($raw, "\\x0Xx")) : (int) $raw;

        return [
            'code'  => $value,
            'hex'   => '0x' . strtoupper(str_pad(dechex($value), 2, '0', STR_PAD_LEFT)),
            'label' => self::OBD_STATUS[$value] ?? 'Unrecognised state',
            'known' => isset(self::OBD_STATUS[$value]),
        ];
    }

    /** value + when it was really read + how stale that makes it. */
    private function stamp(float $value, ?string $at): array
    {
        $ageMinutes = $at ? (int) round(Carbon::parse($at)->diffInSeconds(Carbon::now()) / 60) : null;

        return [
            'value'      => $value,
            'reportedAt' => $at,
            'ageMinutes' => $ageMinutes,
            'stale'      => $ageMinutes === null || $ageMinutes > self::STALE_AFTER_MINUTES,
        ];
    }

    /**
     * `dtcs` is a single string of space-separated codes, and an empty string means "no faults".
     *
     * @return list<string>
     */
    private function splitDtcs(mixed $raw): array
    {
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        return array_values(array_unique(array_filter(preg_split('/[\s,]+/', strtoupper(trim($raw))))));
    }

    /**
     * What a trouble code means, as far as the code itself can say.
     *
     * The structure is standardised (SAE J2012) and can always be read: the letter gives the
     * system, the next digit says whether the meaning is generic or specific to the manufacturer,
     * and for powertrain codes the third digit gives the subsystem. The full text of a generic
     * code is a fixed list, but a manufacturer-specific one means whatever that manufacturer says
     * it means — so those are labelled as such instead of being guessed at.
     */
    private function describeDtc(string $code): array
    {
        $code = strtoupper(trim($code));

        $systems = ['P' => 'Powertrain', 'C' => 'Chassis', 'B' => 'Body', 'U' => 'Network'];

        if (!preg_match('/^([PCBU])([0-3])([0-9A-F])([0-9A-F]{2})$/', $code, $m)) {
            return ['system' => null, 'generic' => null, 'subsystem' => null, 'description' => null];
        }

        [, $letter, $type, $subsystem] = $m;

        // Digit 1: 0 and 2 are the SAE-defined lists, 1 and 3 are the manufacturer's own.
        $generic = in_array($type, ['0', '2'], true);

        $subsystems = [
            '1' => 'Fuel and air metering',
            '2' => 'Fuel and air metering (injector circuit)',
            '3' => 'Ignition system or misfire',
            '4' => 'Auxiliary emission controls',
            '5' => 'Vehicle speed control and idle control',
            '6' => 'Computer output circuit',
            '7' => 'Transmission',
            '8' => 'Transmission',
        ];

        return [
            'system'      => $systems[$letter],
            'generic'     => $generic,
            'subsystem'   => $letter === 'P' ? ($subsystems[$subsystem] ?? null) : null,
            'description' => self::COMMON_DTCS[$code] ?? null,
        ];
    }

    /**
     * The handful of codes common enough to be worth naming outright.
     *
     * Deliberately short. A full J2012 table is thousands of entries and would still miss every
     * manufacturer-specific code, so anything not here is described by its structure instead —
     * which is honest, where an approximate lookup would not be.
     */
    private const COMMON_DTCS = [
        'P0100' => 'Mass or volume air flow circuit',
        'P0128' => 'Coolant thermostat below regulating temperature',
        'P0171' => 'System too lean (bank 1)',
        'P0172' => 'System too rich (bank 1)',
        'P0174' => 'System too lean (bank 2)',
        'P0217' => 'Engine over-temperature',
        'P0300' => 'Random or multiple cylinder misfire',
        'P0301' => 'Cylinder 1 misfire',
        'P0302' => 'Cylinder 2 misfire',
        'P0303' => 'Cylinder 3 misfire',
        'P0304' => 'Cylinder 4 misfire',
        'P0401' => 'Exhaust gas recirculation flow insufficient',
        'P0420' => 'Catalyst system efficiency below threshold (bank 1)',
        'P0430' => 'Catalyst system efficiency below threshold (bank 2)',
        'P0442' => 'Evaporative emission system small leak',
        'P0455' => 'Evaporative emission system large leak',
        'P0500' => 'Vehicle speed sensor',
        'P0505' => 'Idle air control system',
        'P0562' => 'System voltage low',
        'P0563' => 'System voltage high',
        'U0100' => 'Lost communication with engine control module',
    ];

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
}
