<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Work-zones, the devices each applies to, and the crossings recorded for them.
 *
 * `area` is WKT in the same notation Traccar uses — CIRCLE (lat lon, radius) or POLYGON ((…)) —
 * so a zone drawn here can be mirrored across without translation. The per-device
 * `alert_direction` is the reason zones are authored locally at all: Traccar's geofence
 * permissions have no field for it.
 *
 * Neither `client_id` nor `traccar_geofence_id` appears here; both are added by later migrations
 * (2026_08_15_000002 and 2026_08_17_000002 respectively).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('geofences')) {
            Schema::create('geofences', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->text('area');
                $table->string('color', 20)->default('#3b82f6');
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('geofence_device')) {
            Schema::create('geofence_device', function (Blueprint $table) {
                $table->id();
                $table->foreignId('geofence_id')->constrained('geofences')->cascadeOnDelete();
                $table->string('imei');
                $table->enum('alert_direction', ['enter', 'exit', 'both'])->default('both');
                // Last known containment, so a crossing is detected as a transition rather than
                // re-alerting on every position while the vehicle sits inside the zone.
                $table->boolean('is_inside')->default(false);
                $table->timestamps();

                $table->unique(['geofence_id', 'imei']);
            });
        }

        if (!Schema::hasTable('geofence_events')) {
            Schema::create('geofence_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('geofence_id')->constrained('geofences')->cascadeOnDelete();
                $table->string('imei');
                $table->enum('type', ['enter', 'exit']);
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->timestamp('triggered_at')->useCurrent()->useCurrentOnUpdate();
                $table->timestamps();

                $table->index(['imei', 'triggered_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('geofence_events');
        Schema::dropIfExists('geofence_device');
        Schema::dropIfExists('geofences');
    }
};
