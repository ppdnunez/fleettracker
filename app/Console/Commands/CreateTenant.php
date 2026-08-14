<?php

namespace App\Console\Commands;

use App\Models\Client;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Registers a tenant that already exists in Traccar (group + user created there, e.g. by
 * new-tenant.ps1) and gives it an app login. Deliberately does not create anything in Traccar:
 * the app never needs standing rights to mutate Traccar accounts.
 */
class CreateTenant extends Command
{
    protected $signature = 'tenant:create
        {--client= : Client/tenant display name}
        {--traccar-email= : Traccar user for this tenant}
        {--traccar-password= : That Traccar user\'s password}
        {--group-id= : Traccar group id holding the tenant\'s devices}
        {--login-email= : App login email for the tenant}
        {--login-password= : App login password}
        {--name= : Display name for the app user}
        {--role=operator : App role within the tenant (operator or viewer)}';

    protected $description = 'Register a Traccar tenant as an app client and create its login';

    public function handle(): int
    {
        $clientName      = $this->option('client')          ?: $this->ask('Client name');
        $traccarEmail    = $this->option('traccar-email')   ?: $this->ask('Traccar email');
        $traccarPassword = $this->option('traccar-password')?: $this->secret('Traccar password');
        $groupId         = $this->option('group-id');
        $loginEmail      = $this->option('login-email')     ?: $this->ask('App login email', $traccarEmail);
        $loginPassword   = $this->option('login-password')  ?: $this->secret('App login password');
        $displayName     = $this->option('name')            ?: $clientName;
        $role            = $this->option('role');

        if (!in_array($role, ['operator', 'viewer'], true)) {
            $this->error("--role must be 'operator' or 'viewer'; a tenant login is never a platform admin.");
            return self::FAILURE;
        }

        // Verify the credentials against Traccar before storing them, and report exactly what
        // this tenant will be able to see. Catching a typo here beats a 403 at login.
        $this->line('Verifying credentials against Traccar…');
        try {
            $response = Http::withBasicAuth($traccarEmail, $traccarPassword)
                ->timeout(10)
                ->get(rtrim(config('services.traccar.url'), '/') . '/api/devices');
        } catch (\Throwable $e) {
            $this->error('Could not reach Traccar: ' . $e->getMessage());
            return self::FAILURE;
        }

        if (!$response->successful()) {
            $this->error("Traccar rejected those credentials (HTTP {$response->status()}).");
            return self::FAILURE;
        }

        $devices = $response->json() ?? [];
        $this->info(sprintf('OK — this tenant sees %d device(s): %s',
            count($devices),
            implode(', ', array_map(fn ($d) => $d['name'] ?? '?', $devices)) ?: '(none)'
        ));

        $client = Client::updateOrCreate(
            ['traccar_email' => $traccarEmail],
            [
                'name'             => $clientName,
                'traccar_group_id' => $groupId !== null ? (int) $groupId : null,
                'traccar_password' => $traccarPassword,
                'status'           => 'active',
            ]
        );

        $user = User::updateOrCreate(
            ['email' => $loginEmail],
            [
                'name'      => $displayName,
                'password'  => $loginPassword,
                'role'      => $role,
                'client_id' => $client->id,
            ]
        );

        $this->info("Client #{$client->id} '{$client->name}' -> app login {$user->email} (role: {$user->role})");
        return self::SUCCESS;
    }
}
