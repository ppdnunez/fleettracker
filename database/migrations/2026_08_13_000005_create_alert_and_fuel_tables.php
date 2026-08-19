<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Alert delivery, media uploads pulled back from devices, and the local fuel analysis tables.
 *
 * The fuel_* tables hold this app's own derived events, which is a different thing from the fuel
 * events Traccar raises. Traccar compares two adjacent positions; these record the results of
 * window-based analysis (refuelling, idle burn, abnormal loss) that adjacent-position comparison
 * cannot see. Both feed the Fuel module, which is why the reports name their source.
 *
 * `alert_recipients.client_id` is absent here — 2026_08_15_000002 adds it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('alert_recipients')) {
            Schema::create('alert_recipients', function (Blueprint $table) {
                $table->id();
                $table->string('email')->unique();
                $table->string('name')->nullable();
                // Which alert families this address subscribes to; see AlertRecipient::CATEGORIES.
                $table->json('categories');
                $table->boolean('active')->default(true);
                $table->timestamps();
            });
        }

        // Stills and clips requested from a device after an alarm — the request is recorded first
        // and the device answers later, so status carries the whole exchange.
        if (!Schema::hasTable('alert_file_uploads')) {
            Schema::create('alert_file_uploads', function (Blueprint $table) {
                $table->id();
                $table->string('imei');
                $table->integer('alert_type')->nullable();
                $table->string('alert_code')->nullable();
                $table->dateTime('alert_time')->nullable();
                $table->json('file_names');
                $table->double('longitude')->nullable();
                $table->double('latitude')->nullable();
                $table->enum('status', ['requested', 'uploaded', 'failed'])->default('requested');
                $table->text('error')->nullable();
                $table->json('uploaded_file_list')->nullable();
                $table->string('uploaded_file_path')->nullable();
                $table->unsignedBigInteger('uploaded_file_size')->nullable();
                $table->string('upload_result')->nullable();
                $table->string('cmd_no')->nullable();
                $table->dateTime('requested_at')->nullable();
                $table->dateTime('uploaded_at')->nullable();
                $table->timestamps();

                $table->index(['imei', 'status']);
            });
        }

        // Raw commands sent to devices, kept so an operator can see what was sent and what came
        // back — including the queued ones a device has not yet collected.
        if (!Schema::hasTable('device_commands')) {
            Schema::create('device_commands', function (Blueprint $table) {
                $table->id();
                $table->string('batch_id')->nullable();
                $table->string('imei');
                $table->text('content');
                $table->string('message_format')->default('text');
                $table->boolean('is_manual')->default(true);
                $table->string('mode')->default('async');
                $table->string('status')->default('pending');
                $table->json('response')->nullable();
                $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index('batch_id');
                $table->index('imei');
            });
        }

        // Traccar calendars have no owner field, so tenancy for them is tracked here.
        if (!Schema::hasTable('traccar_calendar_owners')) {
            Schema::create('traccar_calendar_owners', function (Blueprint $table) {
                $table->id();
                $table->unsignedInteger('traccar_calendar_id')->unique();
                $table->foreignId('client_id')->nullable()->constrained('clients')->cascadeOnDelete();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('fuel_prices')) {
            Schema::create('fuel_prices', function (Blueprint $table) {
                $table->id();
                $table->string('fuel_type');
                $table->decimal('price_per_liter', 8, 2);
                // Dated rather than overwritten, so a past month costs what it cost then.
                $table->date('effective_date');
                $table->timestamps();

                $table->index(['fuel_type', 'effective_date']);
            });
        }

        if (!Schema::hasTable('fuel_alerts')) {
            Schema::create('fuel_alerts', function (Blueprint $table) {
                $table->id();
                $table->string('imei');
                $table->string('code');
                $table->string('type');
                $table->string('trigger_type');
                $table->string('severity');
                $table->string('description')->nullable();
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->timestamp('occurred_at')->useCurrent()->useCurrentOnUpdate();
                $table->timestamps();

                $table->index(['imei', 'occurred_at']);
            });
        }

        if (!Schema::hasTable('fuel_refuel_events')) {
            Schema::create('fuel_refuel_events', function (Blueprint $table) {
                $table->id();
                $table->string('imei');
                $table->decimal('from_percent', 5, 2);
                $table->decimal('to_percent', 5, 2);
                $table->decimal('change_percent', 5, 2);
                $table->dateTime('detected_at');
                $table->timestamps();

                $table->index(['imei', 'detected_at']);
            });
        }

        if (!Schema::hasTable('fuel_idle_events')) {
            Schema::create('fuel_idle_events', function (Blueprint $table) {
                $table->id();
                $table->string('imei');
                $table->dateTime('start_time');
                $table->dateTime('end_time');
                $table->decimal('fuel_used', 10, 2)->nullable();
                $table->timestamps();

                $table->index(['imei', 'start_time']);
            });
        }

        // Fuel lost against distance covered: the check that catches a slow siphon, which no
        // comparison of two adjacent positions can see.
        if (!Schema::hasTable('fuel_abnormal_loss_events')) {
            Schema::create('fuel_abnormal_loss_events', function (Blueprint $table) {
                $table->id();
                $table->string('imei');
                $table->decimal('from_percent', 5, 2);
                $table->decimal('to_percent', 5, 2);
                $table->decimal('change_percent', 5, 2);
                $table->decimal('from_odometer_km', 10, 2)->nullable();
                $table->decimal('to_odometer_km', 10, 2)->nullable();
                $table->decimal('distance_km', 10, 2)->nullable();
                $table->dateTime('detected_at');
                $table->timestamps();

                $table->index(['imei', 'detected_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('fuel_abnormal_loss_events');
        Schema::dropIfExists('fuel_idle_events');
        Schema::dropIfExists('fuel_refuel_events');
        Schema::dropIfExists('fuel_alerts');
        Schema::dropIfExists('fuel_prices');
        Schema::dropIfExists('traccar_calendar_owners');
        Schema::dropIfExists('device_commands');
        Schema::dropIfExists('alert_file_uploads');
        Schema::dropIfExists('alert_recipients');
    }
};
