<?php

namespace App\Console\Commands;

use App\Models\Geofence;
use App\Services\TraccarGeofenceSync;
use Illuminate\Console\Command;

/**
 * Reconciles every work-zone with Traccar.
 *
 * Zones are mirrored as they are drawn, but the mirror is best-effort: Traccar can be down when
 * someone saves a zone, and zones drawn before mirroring existed have no counterpart at all. Both
 * leave a zone that looks configured and raises no events, so this exists to be run at any time —
 * it is idempotent, comparing the two sides and changing only what differs.
 */
class SyncGeofencesToTraccar extends Command
{
    protected $signature = 'geofences:sync {--zone=* : Only these local zone ids}';

    protected $description = 'Mirror work-zones and their device links into Traccar so it raises enter/exit events';

    public function handle(TraccarGeofenceSync $sync): int
    {
        // Without global scopes: this runs from the console with no signed-in company, and every
        // company's zones need mirroring, not just those of whoever happens to be resolvable.
        $zones = Geofence::withoutGlobalScopes()->with('links', 'client');

        if ($ids = $this->option('zone')) {
            $zones->whereIn('id', $ids);
        }

        $zones = $zones->orderBy('id')->get();

        if ($zones->isEmpty()) {
            $this->warn('No work-zones to sync.');

            return self::SUCCESS;
        }

        $rows    = [];
        $failed  = 0;
        $unlinked = 0;

        foreach ($zones as $zone) {
            $result = $sync->sync($zone);

            if (!$result['ok']) {
                $failed++;
            }
            if ($result['ok'] && $zone->links->isEmpty()) {
                $unlinked++;
            }

            $rows[] = [
                $zone->id,
                $zone->name,
                $zone->client?->name ?? 'platform',
                $result['geofenceId'] ?? '—',
                $zone->links->count(),
                $result['ok'] ? "+{$result['linked']} / -{$result['unlinked']}" : 'failed',
                $result['message'] ?? '',
            ];
        }

        $this->table(['Zone', 'Name', 'Company', 'Traccar id', 'Devices', 'Links changed', 'Note'], $rows);

        if ($unlinked > 0) {
            $this->warn("{$unlinked} zone(s) have no linked devices. Traccar only evaluates a geofence "
                . 'against devices linked to it, so those will raise no enter/exit events until a device is added.');
        }

        if ($failed > 0) {
            $this->error("{$failed} zone(s) could not be mirrored.");

            return self::FAILURE;
        }

        $this->info('All zones mirrored. Enter/exit events are raised from the next position each device sends.');

        return self::SUCCESS;
    }
}
