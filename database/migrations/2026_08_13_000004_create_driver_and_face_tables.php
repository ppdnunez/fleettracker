<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Driver assignments, check-ins, and the face-recognition trail.
 *
 * The face tables record a conversation with the device rather than a local state: a template is
 * requested, the device answers out-of-band on a callback, and the result arrives later. Hence
 * `cmd_no` and the pending / enrolled / failed status — the row exists before the device replies.
 *
 * `face_import_logs` logs every callback request as received, including ones that fail their
 * signature check, which is why response_code and response_message are stored rather than only
 * successes. A rejected callback with no record is indistinguishable from one that never arrived.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('driver_device')) {
            Schema::create('driver_device', function (Blueprint $table) {
                $table->id();
                $table->foreignId('driver_id')->constrained('drivers')->cascadeOnDelete();
                $table->string('imei');
                $table->timestamps();

                $table->unique(['driver_id', 'imei']);
            });
        }

        if (!Schema::hasTable('driver_checkins')) {
            Schema::create('driver_checkins', function (Blueprint $table) {
                $table->id();
                $table->string('imei');
                // The card as the device reported it, kept even when no driver matches it — an
                // unrecognised card is exactly the event worth being able to look up.
                $table->string('driver_card_id');
                $table->foreignId('driver_id')->nullable()->constrained('drivers')->nullOnDelete();
                $table->dateTime('checkin_time');
                $table->dateTime('server_time');
                $table->double('latitude')->nullable();
                $table->double('longitude')->nullable();
                $table->timestamps();

                $table->index(['imei', 'checkin_time']);
                $table->index(['driver_id', 'checkin_time']);
            });
        }

        if (!Schema::hasTable('driver_faces')) {
            Schema::create('driver_faces', function (Blueprint $table) {
                $table->id();
                $table->foreignId('driver_id')->constrained('drivers')->cascadeOnDelete();
                $table->string('imei');
                $table->string('cmd_no')->nullable();
                $table->enum('status', ['pending', 'enrolled', 'failed', 'deleted'])->default('pending');
                $table->string('photo_path')->nullable();
                $table->text('error')->nullable();
                $table->dateTime('requested_at')->nullable();
                $table->dateTime('enrolled_at')->nullable();
                $table->timestamps();

                // One enrolment per driver per device: the device stores one template per person.
                $table->unique(['driver_id', 'imei']);
            });
        }

        if (!Schema::hasTable('face_import_logs')) {
            Schema::create('face_import_logs', function (Blueprint $table) {
                $table->id();
                $table->string('endpoint');
                $table->string('imei')->nullable();
                $table->string('instruction_id')->nullable();
                $table->string('timestamp')->nullable();
                $table->boolean('signature_valid')->nullable();
                $table->string('original_file_name')->nullable();
                $table->string('stored_file_name')->nullable();
                $table->string('stored_path')->nullable();
                $table->text('file_content')->nullable();
                $table->unsignedSmallInteger('response_code');
                $table->string('response_message');
                $table->string('ip')->nullable();
                $table->string('user_agent')->nullable();
                $table->timestamps();

                $table->index(['imei', 'created_at']);
                $table->index(['endpoint', 'created_at']);
            });
        }

        /*
         * The inbound log for POST /img/uploads/face/uploadPic, which the device calls to push a
         * captured photo back to us.
         *
         * Created here rather than in 2026_08_17_000001 (which now only adds its file_size column)
         * so that one migration owns the table and can drop it again. While that later migration
         * held a conditional create and a down() that deliberately kept the table, a fresh install
         * ended up with a face_upload_receipts whose foreign key to drivers outlived every
         * rollback — and `migrate:refresh` died on "Cannot delete or update a parent row".
         */
        if (!Schema::hasTable('face_upload_receipts')) {
            Schema::create('face_upload_receipts', function (Blueprint $table) {
                $table->id();
                $table->string('imei')->nullable();
                $table->foreignId('driver_id')->nullable()->constrained()->nullOnDelete();
                $table->string('instruction_id')->nullable();
                $table->string('file_name')->nullable();
                $table->string('stored_path')->nullable();
                $table->boolean('signature_valid')->nullable();
                // Rejected requests are logged too: a wrong signature is exactly how a
                // misconfigured device shows itself.
                $table->unsignedSmallInteger('response_code');
                $table->string('response_message');
                $table->string('ip')->nullable();
                $table->string('user_agent')->nullable();
                $table->timestamps();

                $table->index(['imei', 'created_at']);
            });
        }

        if (!Schema::hasTable('face_recognition_events')) {
            Schema::create('face_recognition_events', function (Blueprint $table) {
                $table->id();
                $table->string('imei');
                $table->foreignId('driver_id')->nullable()->constrained('drivers')->nullOnDelete();
                $table->enum('result', ['succeeded', 'failed']);
                $table->json('file_names')->nullable();
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->timestamp('occurred_at')->useCurrent()->useCurrentOnUpdate();
                $table->timestamps();

                $table->index(['imei', 'occurred_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('face_recognition_events');
        Schema::dropIfExists('face_upload_receipts');
        Schema::dropIfExists('face_import_logs');
        Schema::dropIfExists('driver_faces');
        Schema::dropIfExists('driver_checkins');
        Schema::dropIfExists('driver_device');
    }
};
