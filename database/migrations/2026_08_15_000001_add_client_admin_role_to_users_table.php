<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds the tenant-side administrator role.
 *
 * A `client_admin` is always attached to a client and manages only that client's own logins. It
 * is deliberately not a platform administrator: User::isPlatformAdmin() still gates on client_id
 * being null, so a client_admin authenticates to Traccar as its own tenant like any other member
 * of that company and sees exactly the same devices.
 *
 * Raw ALTER because `role` is a MySQL enum, which Schema::table() cannot widen in place.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE `users` MODIFY `role`
             ENUM('super_admin','admin','client_admin','operator','viewer')
             NOT NULL DEFAULT 'operator'"
        );
    }

    public function down(): void
    {
        // Existing tenant administrators would violate the narrowed enum, so demote them first.
        DB::table('users')->where('role', 'client_admin')->update(['role' => 'operator']);

        DB::statement(
            "ALTER TABLE `users` MODIFY `role`
             ENUM('super_admin','admin','operator','viewer')
             NOT NULL DEFAULT 'operator'"
        );
    }
};
