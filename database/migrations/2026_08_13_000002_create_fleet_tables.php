<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Vehicles, their settings and their maintenance schedule.
 *
 * Vehicles are keyed to devices by IMEI rather than by a foreign key: the device record lives in
 * Traccar, not here, and IMEI is the identifier both systems share. That is why `imei` appears as
 * a plain indexed string on this and most tables below rather than as a relation.
 *
 * `client_id` is absent from vehicles and vehicle_maintenances on purpose —
 * 2026_08_15_000002_add_client_id_to_tenant_owned_tables adds it to both. See the note in
 * create_clients_table for why every create here is guarded.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('vehicles')) {
            Schema::create('vehicles', function (Blueprint $table) {
                $table->id();
                $table->string('imei')->unique();
                $table->string('name');
                $table->string('plate_number')->nullable();
                $table->string('manufacturer')->nullable();
                $table->string('model')->nullable();
                $table->unsignedSmallInteger('year')->nullable();
                $table->string('color')->nullable();
                $table->enum('status', ['Active', 'Inactive'])->default('Active');
                $table->timestamps();
            });
        }

        // Per-vehicle configuration that has no home in Traccar: relay behaviour, tank size, and
        // the expiry dates the notification commands watch.
        if (!Schema::hasTable('vehicle_settings')) {
            Schema::create('vehicle_settings', function (Blueprint $table) {
                $table->id();
                $table->string('imei')->unique();
                $table->boolean('relay_disconnect_enabled')->default(false);
                $table->boolean('relay_disconnect_on_face_fail')->default(false);
                $table->unsignedTinyInteger('relay_channel')->default(10);
                $table->decimal('fuel_rate_l_per_100km', 6, 2)->nullable();
                $table->decimal('fuel_tank_capacity_liters', 7, 2)->nullable();
                $table->string('vehicle_type')->nullable();
                $table->string('fuel_type')->nullable();
                $table->date('safety_sticker_expiry')->nullable();
                $table->unsignedSmallInteger('sticker_notify_days_before')->nullable();
                // The *_notified_at dates stop a daily notifier re-sending the same warning.
                $table->date('sticker_notified_at')->nullable();
                $table->date('insurance_expiry')->nullable();
                $table->unsignedSmallInteger('insurance_notify_days_before')->nullable();
                $table->date('insurance_notified_at')->nullable();
                $table->string('sim_number')->nullable();
                $table->date('sim_data_expiry')->nullable();
                $table->unsignedInteger('sim_notify_days_before')->nullable();
                $table->date('sim_notified_at')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('vehicle_maintenances')) {
            Schema::create('vehicle_maintenances', function (Blueprint $table) {
                $table->id();
                $table->string('imei');
                $table->string('maintenance_type');
                $table->text('description')->nullable();
                $table->enum('status', ['Scheduled', 'Completed', 'Cancelled'])->default('Scheduled');
                // Due by date or by odometer, either or both — a service is whichever comes first.
                $table->date('due_date')->nullable();
                $table->decimal('due_odometer_km', 10, 2)->nullable();
                $table->unsignedSmallInteger('notify_days_before')->nullable();
                $table->unsignedInteger('notify_km_before')->nullable();
                $table->date('completed_date')->nullable();
                $table->decimal('completed_odometer_km', 10, 2)->nullable();
                $table->decimal('cost', 10, 2)->nullable();
                $table->string('vendor')->nullable();
                $table->text('notes')->nullable();
                $table->date('notified_due_date')->nullable();
                $table->decimal('notified_due_odometer_km', 10, 2)->nullable();
                $table->timestamps();

                $table->index(['imei', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_maintenances');
        Schema::dropIfExists('vehicle_settings');
        Schema::dropIfExists('vehicles');
    }
};
