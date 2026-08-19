<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Gives this app's own tables an owning company, so a tenant sees only what its company created.
 *
 * Traccar-backed data (devices, positions, events) was already isolated by Traccar's permission
 * model. These five tables are local, so nothing was isolating them: every company saw every
 * row. App\Models\Concerns\BelongsToClient is what enforces it once the column exists.
 *
 * Nullable rather than required: a null owner means "platform-level", which is what pre-tenancy
 * rows and anything created by a platform administrator are. Only platform admins see those.
 *
 * ON DELETE SET NULL is deliberate — removing a company must not silently destroy its maintenance
 * history or work zones. They become platform-level rows and stay inspectable.
 */
return new class extends Migration
{
    private const TABLES = [
        'geofences',
        'drivers',
        'vehicles',
        'vehicle_maintenances',
        'alert_recipients',
    ];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->foreignId('client_id')
                    ->nullable()
                    ->after('id')
                    ->constrained('clients')
                    ->nullOnDelete();
            });
        }

        // Backfill only when the installation has exactly one company: then "everything that
        // already exists belongs to them" is unambiguous. With several companies there is no way
        // to tell which owns what, so the rows stay platform-level for an administrator to assign
        // deliberately rather than being handed to whichever company sorted first.
        $clientIds = DB::table('clients')->pluck('id');

        if ($clientIds->count() === 1) {
            foreach (self::TABLES as $table) {
                DB::table($table)->whereNull('client_id')->update(['client_id' => $clientIds->first()]);
            }
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                // An array argument means "the columns the key is on", from which Laravel derives
                // the constraint name. Passing the constraint name inside an array made it derive
                // a name from that name — geofences_geofences_client_id_foreign_foreign — and
                // every rollback failed on a key that does not exist. Only `up` was ever run, so
                // this stayed hidden until a fresh database was rolled back end to end.
                $blueprint->dropForeign(['client_id']);
                $blueprint->dropColumn('client_id');
            });
        }
    }
};
