<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a login to the company it belongs to.
 *
 * This column carries the entire multi-tenant boundary: User::isPlatformAdmin() gates on it being
 * null, UsesTraccarApi picks the Traccar identity from it, and every BelongsToClient scope filters
 * on it. It existed in the development database but in no migration, so a fresh install built a
 * users table without it and every tenant-aware query failed at runtime rather than at migrate
 * time — a much worse way to find out.
 *
 * Kept separate from create_users_table because that migration predates clients existing, and the
 * foreign key needs the clients table already in place.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('users', 'client_id')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            // Nullable and nullOnDelete: a null client_id *is* the platform administrator, and
            // deleting a company must not silently promote its users into one. CompanyController
            // deletes a company's logins explicitly for that reason.
            $table->foreignId('client_id')->nullable()->after('role')->constrained('clients')->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('users', 'client_id')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['client_id']);
            $table->dropColumn('client_id');
        });
    }
};
