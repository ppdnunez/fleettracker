<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Companies (tenants).
 *
 * This and the migrations dated alongside it backfill tables that were created directly in the
 * database rather than through migrations, so a fresh clone could not build its own schema — the
 * first alter migration to reach one of them failed with "Base table or view not found".
 *
 * Every one of them is guarded with hasTable(), because the installations that hit that error are
 * exactly the ones already holding these tables, with no record of them in the migrations table.
 * The guard lets those machines record the migration and move on; a new machine creates the table.
 *
 * The columns here are the table as it stood *before* the alter migrations that follow it:
 * traccar_email and traccar_password are deliberately absent, because
 * 2026_08_14_000002_add_traccar_credentials_to_clients_table adds them and would fail on a
 * duplicate column otherwise.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('clients')) {
            return;
        }

        Schema::create('clients', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            // Traccar's own group id for this company; the group its devices belong to.
            $table->integer('traccar_group_id')->nullable();
            $table->enum('status', ['active', 'suspended'])->default('active');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};
