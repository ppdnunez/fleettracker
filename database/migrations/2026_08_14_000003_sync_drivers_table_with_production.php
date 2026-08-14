<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Brings this repo's `drivers` table in line with the deployed schema.
 *
 * Production moved safety-sticker tracking off the driver and onto vehicle_settings (it
 * describes the vehicle, not the person) and added ibutton_no, in migrations whose files are not
 * part of this repo. The result was a model that wrote columns the real table does not have, so
 * saving a driver failed with "Unknown column 'safety_sticker_expiry'".
 *
 * Every step is guarded, so this is a no-op against a database that already matches.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            if (!Schema::hasColumn('drivers', 'ibutton_no')) {
                $table->string('ibutton_no')->nullable()->after('rfid_card_no');
            }

            $drop = array_values(array_filter(
                ['safety_sticker_expiry', 'sticker_notified_at'],
                fn ($column) => Schema::hasColumn('drivers', $column)
            ));

            if ($drop) {
                $table->dropColumn($drop);
            }
        });
    }

    public function down(): void
    {
        Schema::table('drivers', function (Blueprint $table) {
            if (!Schema::hasColumn('drivers', 'safety_sticker_expiry')) {
                $table->date('safety_sticker_expiry')->nullable();
            }
            if (!Schema::hasColumn('drivers', 'sticker_notified_at')) {
                $table->date('sticker_notified_at')->nullable();
            }
            if (Schema::hasColumn('drivers', 'ibutton_no')) {
                $table->dropColumn('ibutton_no');
            }
        });
    }
};
