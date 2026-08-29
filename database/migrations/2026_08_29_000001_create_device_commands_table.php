<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every command this app has sent to a device, and whatever the device eventually said back.
 *
 * Traccar keeps no such record. Its POST /commands/send answers only whether the command was
 * accepted (200 written to a live connection, 202 queued for an offline device) and then forgets
 * it; the device's own reply arrives minutes later, out of band, as a commandResult event with no
 * link back to the command that provoked it. Correlating the two is what this table is for — it
 * holds the send, the acceptance, and the reply as one row, which is the only place an operator
 * can see whether "STATUS#" actually did anything.
 *
 * A row therefore outlives the request that created it: `status` starts as pending or queued and
 * is settled later by DeviceCommandController::result(), which polls the event report.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_commands', function (Blueprint $table) {
            $table->id();
            // Tenant ownership, set from the session by the BelongsToClient trait — never from the
            // request body. Nullable because a platform administrator has no company of their own.
            $table->foreignId('client_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            $table->string('imei', 100);
            // Traccar's numeric id at the time of sending. Kept alongside the IMEI because the
            // event report is queried by id, and re-resolving it later would cost a round trip per
            // poll — and would fail outright if the device were meanwhile deleted.
            $table->unsignedBigInteger('traccar_device_id')->nullable();
            $table->string('device_name')->nullable();

            // 'custom' (free ASCII in `content`) or one of Traccar's typed commands, which the
            // protocol encoder turns into the same ASCII on the way out.
            $table->string('type', 64)->default('custom');
            $table->text('content')->nullable();
            $table->json('parameters')->nullable();

            $table->string('channel', 8)->default('gprs');   // auto | gprs | sms
            $table->boolean('is_manual')->default(true);     // typed by hand vs picked from a preset

            // sync  — Traccar answered 200: handed to a live connection, so a reply is expected
            // async — Traccar answered 202: queued for an offline device, delivery time unknown
            $table->string('mode', 8)->nullable();
            $table->string('status', 16)->default('pending'); // pending|success|failed|timeout|queued
            $table->unsignedSmallInteger('http_status')->nullable();

            $table->text('response')->nullable(); // the device's own words, off attributes.result
            $table->text('error')->nullable();    // Traccar's rejection reason, or ours

            // How long to keep waiting. Varies by command: a parameter query answers in seconds,
            // WHERE# may sit waiting on a GPS fix, and RESET# never answers at all.
            $table->unsignedSmallInteger('timeout_seconds')->default(30);
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('responded_at')->nullable();

            $table->timestamps();

            $table->index(['imei', 'created_at']);
            // Drives both the pending-poll sweep and the Offline Commands tab.
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_commands');
    }
};
