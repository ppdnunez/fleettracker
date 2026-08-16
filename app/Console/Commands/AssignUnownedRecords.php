<?php

namespace App\Console\Commands;

use App\Models\Client;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Hands the platform-level (client_id IS NULL) rows of the tenant-owned tables to one company.
 *
 * Two situations produce unowned rows: records that predate tenancy, and records left behind when
 * a company is deleted (the foreign key nulls them rather than destroying maintenance history).
 * Both are invisible to every tenant until assigned, which is safe but not useful, and there is no
 * way for the app to guess the owner — hence a deliberate command rather than an automatic sweep.
 *
 * Uses the query builder rather than Eloquent on purpose: it must see the very rows the
 * BelongsToClient scope hides, and must not fire model events while doing bulk ownership changes.
 */
class AssignUnownedRecords extends Command
{
    protected $signature = 'tenancy:assign-unowned
                            {client : Company id, or an exact company name}
                            {--dry-run : Show what would change without writing}';

    protected $description = 'Assign records with no owning company to one company';

    private const TABLES = [
        'geofences',
        'drivers',
        'vehicles',
        'vehicle_maintenances',
        'alert_recipients',
    ];

    public function handle(): int
    {
        $key = $this->argument('client');

        $client = is_numeric($key)
            ? Client::find((int) $key)
            : Client::where('name', $key)->first();

        if (!$client) {
            $this->error("No company matches \"{$key}\".");
            $this->line('Known companies: ' . Client::pluck('name', 'id')->map(
                fn ($name, $id) => "{$id}={$name}"
            )->implode(', '));

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $total  = 0;

        foreach (self::TABLES as $table) {
            $count = DB::table($table)->whereNull('client_id')->count();

            if ($count === 0) {
                continue;
            }

            if (!$dryRun) {
                DB::table($table)->whereNull('client_id')->update(['client_id' => $client->id]);
            }

            $this->line(($dryRun ? '[dry-run] ' : '') . "{$table}: {$count} row(s) -> {$client->name}");
            $total += $count;
        }

        $this->info($total === 0
            ? 'Nothing to assign — every record already has an owner.'
            : ($dryRun ? "{$total} row(s) would be assigned." : "Assigned {$total} row(s) to {$client->name}."));

        return self::SUCCESS;
    }
}
