<?php

namespace App\Console\Commands;

use App\Models\Geofence;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Removes Traccar geofences whose work-zone no longer exists here.
 *
 * The counterpart to geofences:sync, which only ever pushes this side onto Traccar. Nothing pulls
 * the other way, so a mirror Traccar kept but this app forgot is invisible to every other command —
 * and it is not harmless: it keeps appearing in the zone dropdown and on the map overlay, where it
 * looks like a live zone that simply never fires.
 *
 * Those orphans came from a create whose response timed out. Traccar commits the POST and answers
 * afterwards, so a timeout on the way back left a real geofence there and a null traccar_geofence_id
 * here — and forget() then had no id to delete by. TraccarGeofenceSync no longer strands them
 * (it claims an existing mirror by tag, and forget() falls back to the same lookup), but anything
 * stranded before that fix is still sitting in Traccar with nothing left here to remove it.
 *
 * Identification is by the description TraccarGeofenceSync writes — "Turprotrack work zone #N".
 * A geofence without that tag was created in Traccar directly, by someone who did not go through
 * this app at all, and is never touched: this prunes what this app abandoned, not what it did not
 * create.
 */
class PruneOrphanedGeofences extends Command
{
    protected $signature = 'geofences:prune {--force : Delete without confirming}';

    protected $description = 'Delete Traccar geofences whose local work-zone no longer exists';

    public function handle(): int
    {
        $base = rtrim(config('services.traccar.url'), '/') . '/api';
        $auth = [config('services.traccar.email'), config('services.traccar.password')];

        $http = fn () => Http::withBasicAuth(...$auth)
            ->withHeaders(['Accept' => 'application/json'])
            ->timeout(30);

        // Orphans belong to whichever company created them, and the service account is only linked
        // to the mirrors it was explicitly shared on — so its own listing would hide the very
        // geofences this command exists to find.
        //
        // The obvious answer, ?all=true, is unusably slow on a loaded server: it has been measured
        // here at over 90 seconds where the same query filtered by user answers in 0.2. So the
        // users are enumerated and asked about one at a time instead, which returns the same set
        // for anything this app created — every mirror is owned by the user that created it.
        try {
            $users = $http()->get("{$base}/users")->json() ?? [];

            $geofences = [];

            foreach ($users as $user) {
                if (!isset($user['id'])) {
                    continue;
                }

                foreach ($http()->get("{$base}/geofences", ['userId' => $user['id']])->json() ?? [] as $geofence) {
                    // Keyed by id: a geofence shared with more than one user comes back once per
                    // user, and must not be considered — or deleted — twice.
                    $geofences[(int) ($geofence['id'] ?? 0)] = $geofence;
                }
            }
        } catch (\Throwable $e) {
            $this->error('Could not reach Traccar: ' . $e->getMessage());

            return self::FAILURE;
        }

        // Without global scopes: this runs from the console with no signed-in company, and a zone
        // belonging to any company still counts as a live owner of its mirror.
        $localIds = Geofence::withoutGlobalScopes()->pluck('id')->all();

        $orphans = [];
        $rows    = [];

        foreach ($geofences as $geofence) {
            $id   = (int) ($geofence['id'] ?? 0);
            $name = $geofence['name'] ?? '(unnamed)';

            if (!preg_match('/^Turprotrack work zone #(\d+)$/', $geofence['description'] ?? '', $matches)) {
                $rows[] = [$id, $name, '—', 'not created by this app, left alone'];
                continue;
            }

            $zoneId = (int) $matches[1];

            if (in_array($zoneId, $localIds, true)) {
                $rows[] = [$id, $name, "#{$zoneId}", 'in use'];
                continue;
            }

            $rows[] = [$id, $name, "#{$zoneId}", 'ORPHAN — zone deleted here'];
            $orphans[] = ['id' => $id, 'name' => $name, 'zone' => $zoneId];
        }

        $this->table(['Traccar id', 'Name', 'Work zone', 'Status'], $rows);

        if (empty($orphans)) {
            $this->info('Nothing to prune — every mirror still has a work-zone behind it.');

            return self::SUCCESS;
        }

        $this->warn(count($orphans) . ' orphaned mirror(s) found.');

        if (!$this->option('force') && !$this->confirm('Delete them from Traccar?', false)) {
            $this->line('Nothing deleted.');

            return self::SUCCESS;
        }

        $failed = 0;

        foreach ($orphans as $orphan) {
            try {
                $status = $http()->delete("{$base}/geofences/{$orphan['id']}")->status();
            } catch (\Throwable $e) {
                $this->error("  {$orphan['name']} (id {$orphan['id']}): {$e->getMessage()}");
                $failed++;
                continue;
            }

            // Traccar answers 204 on a delete it honoured. A 404 means it is already gone, which
            // is the outcome this command wants either way.
            if (in_array($status, [200, 204, 404], true)) {
                $this->line("  deleted {$orphan['name']} (id {$orphan['id']}, was work zone #{$orphan['zone']})");
            } else {
                $this->error("  {$orphan['name']} (id {$orphan['id']}): Traccar answered HTTP {$status}");
                $failed++;
            }
        }

        if ($failed > 0) {
            $this->error("{$failed} could not be deleted.");

            return self::FAILURE;
        }

        $this->info('Pruned. The zone dropdown and map overlay will no longer list them.');

        return self::SUCCESS;
    }
}
