<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links each work-zone to its mirror in Traccar.
 *
 * Zones are drawn and stored here, but containment is decided by Traccar: it is the thing that
 * sees every position and raises geofenceEnter/geofenceExit, which the Geo Fence report, the
 * alert dispatcher and the map overlay all read. Without this column a zone exists only in this
 * app, where nothing evaluates it — the zone looks saved and silently does nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('geofences', 'traccar_geofence_id')) {
            return;
        }

        Schema::table('geofences', function (Blueprint $table) {
            $table->unsignedInteger('traccar_geofence_id')->nullable()->after('client_id')->index();
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('geofences', 'traccar_geofence_id')) {
            return;
        }

        Schema::table('geofences', function (Blueprint $table) {
            $table->dropColumn('traccar_geofence_id');
        });
    }
};
