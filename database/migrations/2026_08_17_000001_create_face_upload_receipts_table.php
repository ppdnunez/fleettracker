<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Inbound log for the device-facing image ingest endpoint, POST /img/uploads/face/uploadPic.
 *
 * This is the call the JC171 makes when it pushes a captured face photo (or a video/still it was
 * asked for) back to us, and it is a different protocol from the two face-library callbacks
 * already logged in face_import_logs: it signs filename + timestamp + secret, not
 * imei + instructionId + secret + timestamp.
 *
 * Rejected requests are recorded too, and they are the ones worth having — a wrong signature or a
 * request that never arrives is exactly how a misconfigured device or a proxy in the way (the 421
 * from the troubleshooting report) shows itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The table already exists on the production database, created outside this repo's
        // migration set — the same situation as vehicle_maintenances. Creating it is therefore
        // conditional, and the only thing this migration really adds there is file_size.
        if (!Schema::hasTable('face_upload_receipts')) {
            Schema::create('face_upload_receipts', function (Blueprint $table) {
                $table->id();
                $table->string('imei')->nullable();
                $table->foreignId('driver_id')->nullable()->constrained()->nullOnDelete();
                $table->string('instruction_id')->nullable();
                $table->string('file_name')->nullable();
                $table->string('stored_path')->nullable();
                $table->boolean('signature_valid')->nullable();
                $table->unsignedSmallInteger('response_code');
                $table->string('response_message');
                $table->string('ip')->nullable();
                $table->string('user_agent')->nullable();
                $table->timestamps();

                $table->index(['imei', 'created_at']);
            });
        }

        if (!Schema::hasColumn('face_upload_receipts', 'file_size')) {
            Schema::table('face_upload_receipts', function (Blueprint $table) {
                $table->unsignedInteger('file_size')->nullable()->after('stored_path');
            });
        }
    }

    public function down(): void
    {
        // Only what this migration added is removed: dropping a table it found already in place
        // would take the existing upload history with it.
        if (Schema::hasColumn('face_upload_receipts', 'file_size')) {
            Schema::table('face_upload_receipts', function (Blueprint $table) {
                $table->dropColumn('file_size');
            });
        }
    }
};
