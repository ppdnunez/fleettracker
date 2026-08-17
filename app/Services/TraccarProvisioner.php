<?php

namespace App\Services;

use App\Exceptions\TraccarProvisioningFailed;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * Builds the Traccar side of a tenant: a group to hold that company's devices, a Traccar user for
 * the company to authenticate as, and the permission that links the two.
 *
 * Granting the user access to the *group* rather than to individual devices is the whole point.
 * Traccar then extends that access to every device subsequently placed in the group, so adding a
 * vehicle never means editing permissions, and no device can be missed.
 *
 * This class always authenticates with the service account from config, never with
 * UsesTraccarApi::traccarAuth(). Two reasons: these endpoints require Traccar administrator
 * rights, and resolving per-caller credentials here would let a tenant reach admin-only Traccar
 * endpoints through this class. Reaching it at all is restricted to platform administrators by
 * the `platform.admin` middleware on the routes.
 *
 * Failures throw RuntimeException carrying Traccar's own message, so the caller can roll back its
 * local transaction and show the operator something actionable.
 */
class TraccarProvisioner
{
    private function request(): PendingRequest
    {
        return Http::withBasicAuth(
            config('services.traccar.email'),
            config('services.traccar.password'),
        )->withHeaders(['Content-Type' => 'application/json'])->timeout(20);
    }

    private function baseUrl(): string
    {
        return rtrim(config('services.traccar.url'), '/') . '/api';
    }

    /**
     * Traccar answers errors with a plain-text stack trace rather than JSON, and its first line
     * is the only part worth showing an operator.
     */
    private function fail(string $action, \Illuminate\Http\Client\Response $response): never
    {
        $firstLine = trim(strtok($response->body(), "\n") ?: '');

        throw new TraccarProvisioningFailed(
            "Traccar refused to {$action} (HTTP {$response->status()})."
            . ($firstLine !== '' ? " {$firstLine}" : '')
        );
    }

    /** Whether a group id still exists in Traccar — it may have been deleted there since. */
    public function groupExists(int $groupId): bool
    {
        $response = $this->request()->get("{$this->baseUrl()}/groups");

        if (!$response->successful()) {
            $this->fail('list its groups', $response);
        }

        foreach ($response->json() ?: [] as $group) {
            if ((int) ($group['id'] ?? 0) === $groupId) {
                return true;
            }
        }

        return false;
    }

    /**
     * Traccar's numeric user id for an email, or null when no such user exists.
     *
     * Traccar has no lookup-by-email endpoint, so this scans /users — an administrator-only
     * listing, which is why it runs on the service account.
     */
    public function findUserId(string $email): ?int
    {
        $response = $this->request()->get("{$this->baseUrl()}/users");

        if (!$response->successful()) {
            $this->fail('list its users', $response);
        }

        foreach ($response->json() ?: [] as $user) {
            if (strcasecmp($user['email'] ?? '', $email) === 0) {
                return (int) $user['id'];
            }
        }

        return null;
    }

    /** True when Traccar already has a user with this email — checked before creating anything. */
    public function userExists(string $email): bool
    {
        return $this->findUserId($email) !== null;
    }

    /** @return int the new group's Traccar id */
    public function createGroup(string $name): int
    {
        $response = $this->request()->post("{$this->baseUrl()}/groups", [
            'name'       => $name,
            'attributes' => (object) [],
        ]);

        if (!$response->successful()) {
            $this->fail("create the group \"{$name}\"", $response);
        }

        return (int) $response->json()['id'];
    }

    /**
     * Creates a non-administrator Traccar user. Non-administrator is deliberate: the account must
     * see only what it is granted, and an administrator would see the whole installation.
     *
     * @return int the new user's Traccar id
     */
    public function createUser(string $name, string $email, string $password): int
    {
        $response = $this->request()->post("{$this->baseUrl()}/users", [
            'name'          => $name,
            'email'         => $email,
            'password'      => $password,
            'administrator' => false,
            // Traccar defaults a new user's deviceLimit to 0, which means "may not add devices" —
            // not "no limit". Without this the company's own logins can read their devices but
            // every registration fails with SecurityException: Write access denied, which reaches
            // the browser as a bare 400. -1 is Traccar's unlimited.
            'deviceLimit'   => -1,
            'attributes'    => (object) [],
        ]);

        if (!$response->successful()) {
            $this->fail("create the user \"{$email}\"", $response);
        }

        return (int) $response->json()['id'];
    }

    /**
     * Makes sure an existing Traccar user is allowed to add devices.
     *
     * A user provisioned before createUser() set deviceLimit has it at 0, which Traccar reads as
     * "may add none" — reading devices works, registering one fails with SecurityException. This
     * is the repair for those, and it is a no-op on a user that is already unlimited.
     *
     * Traccar takes full-object PUTs, so the user is read back and rewritten whole. `attributes`
     * has to be cast: it comes back as an empty JSON array, and Traccar refuses to deserialise an
     * array into its AttributeMap — the same trap as devices and groups.
     *
     * @return bool true when a change was made
     */
    public function allowDeviceCreation(string $email): bool
    {
        $userId = $this->findUserId($email);

        if ($userId === null) {
            return false;
        }

        $read = $this->request()->get("{$this->baseUrl()}/users/{$userId}");

        if (!$read->successful()) {
            $this->fail('read its user', $read);
        }

        $user = $read->json();

        if ((int) ($user['deviceLimit'] ?? 0) === -1) {
            return false;
        }

        $user['deviceLimit'] = -1;
        $user['attributes']  = (object) ($user['attributes'] ?? []);

        $write = $this->request()
            ->withHeaders(['Content-Type' => 'application/json'])
            ->put("{$this->baseUrl()}/users/{$userId}", $user);

        if (!$write->successful()) {
            $this->fail('grant the user permission to add devices', $write);
        }

        return true;
    }

    /** Links a Traccar user to a group, which is what makes that group's devices visible to it. */
    public function grantGroupAccess(int $userId, int $groupId): void
    {
        $response = $this->request()->post("{$this->baseUrl()}/permissions", [
            'userId'  => $userId,
            'groupId' => $groupId,
        ]);

        if (!$response->successful()) {
            $this->fail('link the user to the group', $response);
        }
    }

    /**
     * Changes a Traccar user's password. Traccar expects the whole user object on PUT, so the
     * current one is read back first and only the password replaced — sending a partial body
     * would blank out the user's name, permissions flags and attributes.
     */
    public function updateUserPassword(int $userId, string $password): void
    {
        $existing = $this->request()->get("{$this->baseUrl()}/users/{$userId}");

        if (!$existing->successful()) {
            $this->fail('read the user back', $existing);
        }

        $user = $existing->json();
        $user['password'] = $password;

        $response = $this->request()->put("{$this->baseUrl()}/users/{$userId}", $user);

        if (!$response->successful()) {
            $this->fail('update the password', $response);
        }
    }

    /**
     * Undoes a partially provisioned tenant. Best-effort by design: it runs while another failure
     * is already being reported, so a second error here must not replace the first one.
     */
    public function discard(?int $userId, ?int $groupId): void
    {
        try {
            if ($userId !== null) {
                $this->request()->delete("{$this->baseUrl()}/users/{$userId}");
            }
            if ($groupId !== null) {
                $this->request()->delete("{$this->baseUrl()}/groups/{$groupId}");
            }
        } catch (\Throwable) {
            // Leaves an orphaned group or user in Traccar, which is harmless and visible there.
        }
    }

    /**
     * Proves a tenant's stored credentials still work, by making the same call the app makes on
     * every request. Returns the devices that account can see — which is exactly what the
     * company's users will see in Turprotrack, so it doubles as the isolation check.
     *
     * @return array{ok: bool, devices: array, error: ?string}
     */
    public function verify(string $email, string $password): array
    {
        try {
            $response = Http::withBasicAuth($email, $password)
                ->timeout(15)
                ->get("{$this->baseUrl()}/devices");
        } catch (\Throwable) {
            return ['ok' => false, 'devices' => [], 'error' => 'Could not reach Traccar.'];
        }

        if ($response->status() === 401) {
            return ['ok' => false, 'devices' => [], 'error' => 'Traccar rejected these credentials.'];
        }

        if (!$response->successful()) {
            return ['ok' => false, 'devices' => [], 'error' => "Traccar returned HTTP {$response->status()}."];
        }

        return ['ok' => true, 'devices' => $response->json() ?: [], 'error' => null];
    }
}
