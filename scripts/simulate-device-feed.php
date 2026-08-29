<?php

/**
 * Feeds one device a scripted half hour of telemetry, so every report and alert in the app has
 * something real to show without waiting for a vehicle to do it.
 *
 * Positions go in through Traccar's OsmAnd HTTP protocol (port 5055 by default), which is the only
 * ingest that speaks plain query strings — Traccar has no REST endpoint for creating a position.
 * Timestamps are backdated, so the whole scenario lands in seconds and is immediately reportable.
 *
 * Run it with no arguments to see what it would send:
 *
 *     php scripts/simulate-device-feed.php --dry-run
 *     php scripts/simulate-device-feed.php
 *
 * Options:
 *     --imei=<15 digits>   device to feed          (default 863800080020265)
 *     --osmand=<url>       ingest base URL         (default TRACCAR_URL host on :5055)
 *     --geofence=<id>      zone to drive through   (default: the first one Traccar lists)
 *     --lat= --lon=        a point inside the zone, when Traccar will not show it to this account
 *     --offset=<degrees>   how far outside the zone to park (default 0.012, about 1.3 km)
 *     --no-media           skip writing the sample photo/clip
 *     --dry-run            print the packets, send nothing
 *
 * WHY THE TIMELINE IS 30 MINUTES AND NOT 10: Theft Watch only calls a drop suspicious when the
 * vehicle was stationary for *every* position in its window, and the shortest window the UI offers
 * is 15 minutes. A ten-minute scenario that also contains driving can never produce a suspected
 * verdict. So the driving, the behaviour alarms and the geofence pass sit 19-30 minutes back, and
 * the last 18 minutes are parked — a 15-minute Theft Watch scan then sees nothing but a parked
 * vehicle losing fuel. The script itself still finishes in seconds.
 */

const DEFAULT_IMEI = '863800080020265';

$options = parseOptions($argv);
$root    = dirname(__DIR__);

$env      = readEnv($root . '/.env');
$imei     = $options['imei'] ?? DEFAULT_IMEI;
$dryRun   = isset($options['dry-run']);
$traccar  = rtrim($env['TRACCAR_URL'] ?? 'http://localhost:8082', '/');
$osmand   = rtrim($options['osmand'] ?? defaultOsmandUrl($traccar), '/');
$auth     = ($env['TRACCAR_EMAIL'] ?? '') . ':' . ($env['TRACCAR_PASSWORD'] ?? '');

echo "Traccar API : {$traccar}\n";
echo "OsmAnd feed : {$osmand}\n";
echo "Device      : {$imei}\n\n";

/* ── preflight: the device has to exist, or every packet is silently discarded ── */

$devices = traccarGet($traccar . '/api/devices', $auth);

if ($devices === null) {
    fail("Could not read {$traccar}/api/devices — check TRACCAR_URL and the credentials in .env.");
}

$device = null;
foreach ($devices as $candidate) {
    if (($candidate['uniqueId'] ?? '') === $imei) {
        $device = $candidate;
        break;
    }
}

if (!$device) {
    fail("No device in Traccar with uniqueId {$imei}. Register it first, or pass --imei=<one that exists>.");
}

echo "Matched device #{$device['id']} \"{$device['name']}\".\n";

/* ── the zone to drive through, read from Traccar so the coordinates are real ── */

$geofences = traccarGet($traccar . '/api/geofences', $auth) ?: [];
$zone      = null;

foreach ($geofences as $candidate) {
    if (!isset($options['geofence']) || (string) $candidate['id'] === (string) $options['geofence']) {
        $zone = $candidate;
        break;
    }
}

if (isset($options['lat'], $options['lon'])) {
    // Explicit coordinates win: a zone drawn by another Traccar user is still evaluated for this
    // device, but /api/geofences will not show it to the account this app authenticates as, so
    // there is nothing to read the centre out of.
    [$inLat, $inLon, $spanDeg] = [(float) $options['lat'], (float) $options['lon'], 0.01];
    echo "Zone        : using --lat/--lon\n";
} elseif ($zone) {
    [$inLat, $inLon, $spanDeg] = zoneCentre($zone['area'] ?? '');
    echo "Zone        : #{$zone['id']} \"{$zone['name']}\"\n";
} else {
    // No zone configured: the run still exercises everything else, geofence events aside.
    [$inLat, $inLon, $spanDeg] = [-9.4438, 147.1803, 0.01];
    echo "Zone        : none found — geofence enter/exit will not fire.\n";
}

// Far enough out to be clear of the zone, near enough that the hop between consecutive frames is
// a speed a vehicle could actually do. Traccar's filter.maxSpeed drops an implausible jump and
// still answers 200 to the sender, so a generous offset silently loses half the scenario:
// 0.05 degrees between one-minute fixes is 330 km/h. At the default 0.012 it is about 80 km/h.
$offset = (float) ($options['offset'] ?? max(0.012, $spanDeg * 1.5));

$outLat = $inLat + $offset;
$outLon = $inLon + $offset;

echo "Inside      : {$inLat}, {$inLon}\nOutside     : {$outLat}, {$outLon}\n\n";

/* ── the scenario ─────────────────────────────────────────────────────────────
 * Each frame is [minutes before now, latitude, longitude, attributes].
 * `alarm` is one per position — Traccar carries a single alarm per fix — so the behaviour
 * alarms are spread across consecutive minutes rather than stacked.
 */

$odometer = 128_400_000;   // metres on the clock at the start
$frames   = [];

/*
 * Dashcam evidence. Two things have to agree for a recording to be visible everywhere: the file on
 * disk (which is what Media Gallery lists, attributed by the IMEI in its name) and the position's
 * `videoFiles` attribute (which is what the Video Evidence report indexes). A camera device sets
 * both; so does this, using one set of names for both.
 */
$stamp = date('ymdHis');

$sosMedia   = ["0169_1{$stamp}01_{$imei}.jpg", "0169_1{$stamp}01_{$imei}.mp4"];
$brakeMedia = ["0169_1{$stamp}02_{$imei}.jpg", "0169_1{$stamp}02_{$imei}.mp4"];

$drive = function (int $ago, float $lat, float $lon, float $speed, float $fuel, array $extra = [])
        use (&$frames, &$odometer) {
    $odometer += (int) round($speed * 1000 / 3600 * 60);   // one minute at this speed

    $frames[] = [$ago, $lat, $lon, array_merge([
        'speed'          => $speed,
        'ignition'       => 'true',
        'motion'         => 'true',
        'fuelLevel'      => $fuel,
        'odometer'       => $odometer,
        'obdOdometer'    => $odometer,
        'rpm'            => 900 + (int) ($speed * 22),
        'engineLoad'     => min(95, 18 + (int) ($speed * 0.7)),
        'coolantTemp'    => 86,
        'throttle'       => min(90, 12 + (int) ($speed * 0.6)),
        'power'          => 13.8,
        'battery'        => 4.1,
    ], $extra)];
};

$park = function (int $ago, float $lat, float $lon, float $fuel, array $extra = [])
        use (&$frames, &$odometer) {
    $frames[] = [$ago, $lat, $lon, array_merge([
        'speed'       => 0,
        'ignition'    => 'false',
        'motion'      => 'false',
        'fuelLevel'   => $fuel,
        'odometer'    => $odometer,
        'obdOdometer' => $odometer,
        'rpm'         => 0,
        'engineLoad'  => 0,
        'coolantTemp' => 41,
        'power'       => 12.6,
        'battery'     => 4.0,
    ], $extra)];
};

// --- driving, outside the zone, with a driver on board ---
$drive(30, $outLat, $outLon, 48, 62, ['driverUniqueId' => 'DRV-1001']);
$drive(29, ($outLat + $inLat) / 2, ($outLon + $inLon) / 2, 52, 61.4);

// --- geofenceEnter ---
$drive(28, $inLat, $inLon, 44, 60.8);

// --- driver behaviour: one alarm per fix ---
$drive(27, $inLat + 0.001, $inLon + 0.001, 71, 60.1, ['alarm' => 'hardAcceleration']);
$drive(26, $inLat + 0.002, $inLon + 0.001, 18, 59.6, ['alarm' => 'hardBraking', 'videoFiles' => implode(',', $brakeMedia)]);
$drive(25, $inLat + 0.002, $inLon + 0.002, 39, 59.2, ['alarm' => 'hardCornering']);
$drive(24, $inLat + 0.003, $inLon + 0.002, 96, 58.5, ['alarm' => 'overspeed']);
$drive(23, $inLat + 0.003, $inLon + 0.003, 31, 58.0, ['alarm' => 'sos', 'videoFiles' => implode(',', $sosMedia)]);

// --- refuel: a jump big enough for deviceFuelIncrease, plus the probe's own refuel alarm ---
$drive(22, $inLat + 0.004, $inLon + 0.003, 0,  92.0, ['alarm' => 'refuel', 'driverUniqueId' => 'DRV-2002']);
$drive(21, $inLat + 0.004, $inLon + 0.004, 26, 91.2);

// --- abrupt loss: deviceFuelDrop territory, and the sensor calls it a leak ---
$drive(20, $inLat + 0.005, $inLon + 0.004, 34, 64.0, ['alarm' => 'fuelLeak']);

// --- geofenceExit, then park up for the night ---
$drive(19, $outLat, $outLon, 58, 63.6);

// --- parked from here on: nothing moves, which is what Theft Watch needs ---
$park(18, $outLat, $outLon, 63.4);
$park(17, $outLat, $outLon, 63.3, ['alarm' => 'tyreLowPressure', 'tyre2Pressure' => 1.4]);
$park(16, $outLat, $outLon, 63.2, ['alarm' => 'temperature', 'temp1' => 41.6]);
$park(15, $outLat, $outLon, 63.1);
$park(14, $outLat, $outLon, 63.0);
$park(13, $outLat, $outLon, 62.9);

// --- the siphon: ~4% a minute, gradual enough that adjacent fixes look unremarkable ---
$level = 62.9;
for ($ago = 12; $ago >= 0; $ago--) {
    $level = round($level - 4.05, 1);
    $park($ago, $outLat, $outLon, max($level, 11.4));
}

/* ── sensors ride on every fix ── */

foreach ($frames as $i => $frame) {
    $wobble = ($i % 5) * 0.3;

    $frames[$i][3] += [
        'temp1'         => round(4.2 + $wobble, 1),      // reefer box
        'temp2'         => round(23.5 + $wobble, 1),     // cabin
        'humidity'      => round(58 + $wobble * 2, 1),
        'humidity2'     => round(44 + $wobble, 1),
        'tyre1Pressure' => 8.2, 'tyre1Temp' => 38, 'tyre1Axle' => 1, 'tyre1Index' => 1, 'tyre1SensorId' => 'TPMS-A1L',
        'tyre2Pressure' => 7.9, 'tyre2Temp' => 41, 'tyre2Axle' => 1, 'tyre2Index' => 2, 'tyre2SensorId' => 'TPMS-A1R',
        'tyre3Pressure' => 8.4, 'tyre3Temp' => 36, 'tyre3Axle' => 2, 'tyre3Index' => 1, 'tyre3SensorId' => 'TPMS-A2L',
        'tyre4Pressure' => 8.1, 'tyre4Temp' => 37, 'tyre4Axle' => 2, 'tyre4Index' => 2, 'tyre4SensorId' => 'TPMS-A2R',
    ];
}

/* ── send, oldest first, so Traccar's event handlers see the changes in order ── */

usort($frames, fn ($a, $b) => $b[0] <=> $a[0]);

$now  = time();
$sent = 0;
$failed = 0;

foreach ($frames as [$ago, $lat, $lon, $attributes]) {
    $query = http_build_query([
        'id'        => $imei,
        'timestamp' => $now - $ago * 60,
        'lat'       => $lat,
        'lon'       => $lon,
        'bearing'   => 145,
        'altitude'  => 42,
        'accuracy'  => 8,
        'valid'     => 'true',
    ] + $attributes);

    $label = sprintf('t-%02dm  fuel %5s%%  %s', $ago,
        $attributes['fuelLevel'] ?? '—',
        isset($attributes['alarm']) ? "alarm={$attributes['alarm']}" : ($attributes['ignition'] === 'true' ? 'driving' : 'parked'));

    if ($dryRun) {
        echo "[dry-run] {$label}\n";
        continue;
    }

    $status = httpStatus("{$osmand}/?{$query}");

    if ($status === 200) {
        $sent++;
        echo "  sent  {$label}\n";
    } else {
        $failed++;
        echo "  FAIL  {$label}  (HTTP {$status})\n";
    }
}

if ($dryRun) {
    echo "\nDry run: " . count($frames) . " packets prepared, nothing sent.\n";
    exit(0);
}

echo "\n{$sent} packet(s) accepted, {$failed} rejected.\n";

if ($failed && !$sent) {
    echo "\nNothing got through. Check the ingest port is open and speaks OsmAnd:\n";
    echo "  curl -s -o /dev/null -w '%{http_code}\\n' \"{$osmand}/?id={$imei}&lat=0&lon=0\"\n";
}

/* ── sample media, so the gallery and Video Evidence have rows for this device ── */

if (!isset($options['no-media'])) {
    writeMedia($root . '/public/img/uploads', array_merge($sosMedia, $brakeMedia));
}

echo "\nDone. What to look at:\n";
echo "  Fleet > Fuel Management > Events       refuel, fuel drop, leak\n";
echo "  Fleet > Fuel Management > Level        the level curve and the low reading at the end\n";
echo "  Fleet > Fuel Management > Theft Watch  set the window to 15 min\n";
echo "  Report > Motion Statistics > Geo Fence enter/exit\n";
echo "  Report > Alert Statistics > Alert Details   SOS and the harsh-driving alarms\n";
echo "  Report > Sensor Statistics             temperature, humidity, TPMS\n";
echo "  Report > Device Statistics             mileage and OBD\n";
echo "  Fleet > Media Gallery                  the sample photo and clip\n";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function parseOptions(array $argv): array
{
    $options = [];

    foreach (array_slice($argv, 1) as $argument) {
        if (!str_starts_with($argument, '--')) {
            continue;
        }
        [$key, $value] = array_pad(explode('=', substr($argument, 2), 2), 2, true);
        $options[$key] = $value;
    }

    return $options;
}

/** Minimal .env reader — this script deliberately does not boot Laravel. */
function readEnv(string $path): array
{
    $values = [];

    foreach (@file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $values[trim($key)] = trim(trim($value), "\"'");
    }

    return $values;
}

/** Traccar's OsmAnd listener, which is a separate port from the API. */
function defaultOsmandUrl(string $traccarUrl): string
{
    $host = parse_url($traccarUrl, PHP_URL_HOST) ?: 'localhost';

    return "http://{$host}:5055";
}

function traccarGet(string $url, string $auth): ?array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERPWD        => $auth,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);

    $body   = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);

    return $status === 200 ? (json_decode($body, true) ?: []) : null;
}

function httpStatus(string $url): int
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);

    curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);

    return (int) $status;
}

/**
 * A point inside the zone, and roughly how wide it is, from Traccar's WKT-ish `area` string:
 * CIRCLE (lat lon, radius) or POLYGON ((lat lon, lat lon, ...)).
 *
 * @return array{0: float, 1: float, 2: float} [lat, lon, span in degrees]
 */
function zoneCentre(string $area): array
{
    if (preg_match('/CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([\d.]+)/i', $area, $m)) {
        return [(float) $m[1], (float) $m[2], ((float) $m[3]) / 111320];
    }

    if (preg_match_all('/(-?\d+\.\d+)\s+(-?\d+\.\d+)/', $area, $m, PREG_SET_ORDER)) {
        $lats = array_map(fn ($p) => (float) $p[1], $m);
        $lons = array_map(fn ($p) => (float) $p[2], $m);

        return [
            array_sum($lats) / count($lats),
            array_sum($lons) / count($lons),
            max(max($lats) - min($lats), max($lons) - min($lons)),
        ];
    }

    return [-9.4438, 147.1803, 0.01];
}

/**
 * The gallery attributes a file to a device by any bare 15-digit run in its name
 * (MediaLibraryController::imeiFrom), so the IMEI in the filename is what makes these visible.
 */
function writeMedia(string $directory, array $names): void
{
    if (!is_dir($directory) && !@mkdir($directory, 0755, true)) {
        echo "\nCould not write to {$directory} — skipping the sample media.\n";
        return;
    }

    // A 1x1 JPEG: small, valid, and unmistakably a placeholder when opened.
    $jpeg = base64_decode(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
        . 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
        . 'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
    );

    // Enough of an MP4 container to be recognised as one; it holds no frames to play.
    $mp4 = base64_decode('AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVl');

    foreach ($names as $name) {
        $isVideo = strtolower(pathinfo($name, PATHINFO_EXTENSION)) === 'mp4';

        file_put_contents($directory . '/' . $name, $isVideo ? $mp4 : $jpeg);
        @chmod($directory . '/' . $name, 0644);
        echo "  wrote  img/uploads/{$name}\n";
    }
}

function fail(string $message): void
{
    fwrite(STDERR, "\n{$message}\n");
    exit(1);
}
