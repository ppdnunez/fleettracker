<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Each client (tenant) authenticates to Traccar as its own Traccar user, so Traccar's
     * server-side permission model — not application filtering — is what keeps one tenant out
     * of another's devices. The password is stored encrypted via the model's `encrypted` cast.
     */
    public function up(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->string('traccar_email')->nullable()->after('traccar_group_id');
            $table->text('traccar_password')->nullable()->after('traccar_email');
        });
    }

    public function down(): void
    {
        Schema::table('clients', function (Blueprint $table) {
            $table->dropColumn(['traccar_email', 'traccar_password']);
        });
    }
};
