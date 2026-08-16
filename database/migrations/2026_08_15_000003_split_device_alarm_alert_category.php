<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Keeps existing subscribers whole after `device_alarm` was split up.
 *
 * That one category used to mean "SOS, overspeed and harsh driving". Those are now separate
 * categories, so anyone subscribed to `device_alarm` would quietly stop being told about a panic
 * button — the worst possible way for this change to land. Their subscription is expanded to the
 * categories it used to cover, leaving `device_alarm` in place for the alarm kinds that still
 * have no category of their own.
 *
 * Recipients created after this migration pick their categories from the new list directly.
 */
return new class extends Migration
{
    private const REPLACED_BY = ['sos', 'overspeed', 'harsh_driving', 'collision', 'fatigue_driving'];

    public function up(): void
    {
        foreach (DB::table('alert_recipients')->get(['id', 'categories']) as $recipient) {
            $categories = json_decode($recipient->categories ?? '[]', true) ?: [];

            if (!in_array('device_alarm', $categories, true)) {
                continue;
            }

            DB::table('alert_recipients')
                ->where('id', $recipient->id)
                ->update(['categories' => json_encode(
                    array_values(array_unique([...$categories, ...self::REPLACED_BY]))
                )]);
        }
    }

    public function down(): void
    {
        // Only the categories this migration could have added are removed, and only from rows that
        // still carry device_alarm — a recipient who subscribed to SOS on its own keeps it.
        foreach (DB::table('alert_recipients')->get(['id', 'categories']) as $recipient) {
            $categories = json_decode($recipient->categories ?? '[]', true) ?: [];

            if (!in_array('device_alarm', $categories, true)) {
                continue;
            }

            DB::table('alert_recipients')
                ->where('id', $recipient->id)
                ->update(['categories' => json_encode(
                    array_values(array_diff($categories, self::REPLACED_BY))
                )]);
        }
    }
};
