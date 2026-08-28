<?php

namespace App\Console\Commands;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use App\Mail\TraccarEventAlert;
use App\Models\AlertRecipient;
use App\Models\Client;
use App\Models\Vehicle;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

/**
 * Turns Traccar's own alerts into emails for the people listed under Settings > Alert Recipients.
 *
 * Traccar raises the events (geofence enter/exit, maintenance due, fuel drop, driver change,
 * SOS/overspeed/harsh-driving alarms) but can only email its own Traccar users, and only when the
 * server has SMTP configured — this one reports emailEnabled=false. So the events are read back
 * off /api/reports/events on a schedule and delivered through this app's mailer instead, to
 * addresses that need no Traccar account.
 *
 * Runs as the service account (no authenticated user in console context, see UsesTraccarApi),
 * which is linked to every device, so alerts are raised fleet-wide rather than per tenant.
 *
 * Re-delivery is prevented by remembering the highest event id already handled: event ids are
 * monotonic in Traccar, so this survives an overlapping time window without needing to store the
 * events themselves. The window is deliberately overlapped by OVERLAP_MINUTES because an event's
 * eventTime is the time the *position* was recorded, which can land slightly before the event is
 * queryable.
 */
class DispatchTraccarAlerts extends Command
{
    use UsesTraccarApi;

    protected $signature = 'alerts:dispatch-traccar-events
                            {--minutes=30 : How far back to look}
                            {--dry-run : List what would be sent without emailing}';

    protected $description = 'Read Traccar events and email the subscribed alert recipients';

    private const CURSOR_KEY      = 'alerts.traccar.last_event_id';
    private const OVERLAP_MINUTES = 5;

    /** Wording per event type, used for the subject line and the email heading. */
    private const TITLES = [
        'geofenceEnter'      => 'Geofence entered',
        'geofenceExit'       => 'Geofence exited',
        'driverChanged'      => 'Driver changed',
        'maintenance'        => 'Maintenance due',
        'deviceFuelDrop'     => 'Fuel drop detected',
        'deviceFuelIncrease' => 'Fuel increase detected',
        'alarm'              => 'Device alarm',
        'deviceOverspeed'    => 'Overspeed',
    ];

    /**
     * Wording per alarm sub-type, which is what "alarm" events actually are. Without this every
     * one of them would arrive titled "Device alarm", and an SOS would read the same as a harsh
     * corner in the subject line.
     */
    private const ALARM_TITLES = [
        'sos'              => 'SOS — panic button pressed',
        'overspeed'        => 'Overspeed',
        'hardAcceleration' => 'Harsh acceleration',
        'hardBraking'      => 'Harsh braking',
        'hardCornering'    => 'Harsh cornering',
        'accident'         => 'Collision detected',
        'collision'        => 'Collision detected',
        'fallDown'         => 'Rollover detected',
        'rollover'         => 'Rollover detected',
        'fatigueDriving'   => 'Fatigue driving (overtime)',
        'overtime'         => 'Fatigue driving (overtime)',
        'tired'            => 'Fatigue driving (overtime)',
        // A tracker holding its own zones reports crossings as alarms rather than as the
        // geofenceEnter / geofenceExit events Traccar computes for zones drawn here. Without these
        // two they fall through to the generic "Device alarm", which tells the recipient nothing
        // about why they were emailed. Named as device-reported because that is what they are —
        // the vehicle's own account of a zone this server never evaluated.
        'geofenceEnter'    => 'Geofence entered (reported by device)',
        'geofenceExit'     => 'Geofence exited (reported by device)',
    ];

    public function handle(): int
    {
        $dryRun  = (bool) $this->option('dry-run');
        $minutes = max(1, (int) $this->option('minutes')) + self::OVERLAP_MINUTES;

        $from = Carbon::now()->subMinutes($minutes);
        $to   = Carbon::now();

        try {
            $response = Http::withBasicAuth(...$this->traccarAuth())
                ->withHeaders(['Accept' => 'application/json'])
                ->timeout(30)
                ->get("{$this->traccarBaseUrl()}/reports/events", [
                    'from' => $from->utc()->toISOString(),
                    'to'   => $to->utc()->toISOString(),
                ]);
        } catch (\Throwable $e) {
            $this->error('Could not reach Traccar: ' . $e->getMessage());
            return self::FAILURE;
        }

        if (!$response->successful()) {
            $this->error("Traccar returned HTTP {$response->status()} for the events report.");
            return self::FAILURE;
        }

        $events = $response->json() ?: [];

        // Only events newer than the last one handled, and only types anyone can subscribe to.
        $cursor = (int) Cache::get(self::CURSOR_KEY, 0);

        // A cursor ahead of every id Traccar can offer means it was recorded against an events
        // table that no longer exists — Traccar rebuilt, or this app repointed at a different
        // server. Ids restart from 1 over there, so an inherited high-water mark discards every
        // event forever, silently: the run reports "no new alertable events" whether Traccar
        // raised none or raised hundreds. Start over instead.
        $newestAvailable = max(array_column($events, 'id') ?: [0]);

        if (!empty($events) && $cursor > $newestAvailable) {
            $this->warn("Stored cursor ({$cursor}) is ahead of Traccar's newest event ({$newestAvailable}); "
                . 'assuming a different or rebuilt Traccar and starting from zero.');
            $cursor = 0;
            Cache::forever(self::CURSOR_KEY, 0);
        }

        $events = array_values(array_filter(
            $events,
            fn ($e) => ($e['id'] ?? 0) > $cursor && AlertRecipient::categoryForEvent($e) !== null
        ));

        if (empty($events)) {
            $this->info('No new alertable events.');
            return self::SUCCESS;
        }

        // Sending order matters only for readability of the log; the cursor is the max id either way.
        usort($events, fn ($a, $b) => $a['id'] <=> $b['id']);

        $devices     = $this->lookup('devices');
        $devicesById = collect($devices)->keyBy('id');
        $geofencesById = collect($this->lookup('geofences'))->keyBy('id');
        $vehiclesByImei = Vehicle::get(['imei', 'name', 'plate_number', 'client_id'])->keyBy('imei');

        // Which company owns a device is decided the same way Traccar decides what a tenant can
        // see: by the group its devices sit in. The local vehicle registry is the fallback, for a
        // device that has a vehicle profile but no group.
        $clientIdByGroupId = Client::whereNotNull('traccar_group_id')
            ->pluck('id', 'traccar_group_id')
            ->all();

        $recipientsByCategory = [];
        $sent    = 0;
        $skipped = 0;

        foreach ($events as $event) {
            // Resolved from the alarm sub-type, not the event type: every driving-behaviour alert
            // and the SOS button all arrive as type "alarm".
            $category = AlertRecipient::categoryForEvent($event);

            $device      = $devicesById->get($event['deviceId'] ?? 0);
            $vehicle     = $device ? $vehiclesByImei->get($device['uniqueId'] ?? '') : null;
            $deviceName  = $vehicle?->name ?: ($device['name'] ?? "Device #{$event['deviceId']}");
            $alarm       = $event['attributes']['alarm'] ?? null;
            $title       = ($event['type'] === 'alarm' ? (self::ALARM_TITLES[$alarm] ?? null) : null)
                ?? self::TITLES[$event['type']]
                ?? $event['type'];
            $geofence    = $geofencesById->get($event['geofenceId'] ?? 0);

            $clientId = $clientIdByGroupId[$device['groupId'] ?? 0] ?? $vehicle?->client_id;

            $recipients = $recipientsByCategory[$category][$clientId ?? 0]
                ??= AlertRecipient::emailsFor($category, $clientId);

            if (empty($recipients)) {
                $skipped++;
                continue;
            }

            $line = "#{$event['id']} {$event['type']} — {$deviceName} → " . implode(', ', $recipients);

            if ($dryRun) {
                $this->line("[dry-run] {$line}");
                $sent++;
                continue;
            }

            $mail = new TraccarEventAlert(
                event:        $event,
                title:        $title,
                deviceName:   $deviceName,
                plateNumber:  $vehicle?->plate_number,
                geofenceName: $geofence['name'] ?? null,
                occurredAt:   isset($event['eventTime']) ? Carbon::parse($event['eventTime'])->toDayDateTimeString() : null,
                position:     $this->position($event['positionId'] ?? null),
            );

            foreach ($recipients as $email) {
                Mail::to($email)->send($mail);
            }

            $this->info($line);
            $sent++;
        }

        if (!$dryRun) {
            Cache::forever(self::CURSOR_KEY, max(array_column($events, 'id')));
        }

        $this->info("Done. {$sent} alert(s) handled, {$skipped} with no subscriber.");

        return self::SUCCESS;
    }

    /** GETs a Traccar collection, returning [] rather than throwing — names are decoration here. */
    private function lookup(string $path): array
    {
        try {
            $response = Http::withBasicAuth(...$this->traccarAuth())
                ->timeout(15)
                ->get("{$this->traccarBaseUrl()}/{$path}");

            return $response->successful() ? ($response->json() ?: []) : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /** The position an event was raised at, for the map link. Null when Traccar has none. */
    private function position(?int $positionId): ?array
    {
        if (!$positionId) {
            return null;
        }

        try {
            $response = Http::withBasicAuth(...$this->traccarAuth())
                ->timeout(15)
                ->get("{$this->traccarBaseUrl()}/positions", ['id' => $positionId]);

            return $response->successful() ? ($response->json()[0] ?? null) : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
