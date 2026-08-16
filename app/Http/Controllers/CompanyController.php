<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\User;
use App\Services\TraccarProvisioner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Platform administration of companies (tenants). Every route here is behind `platform.admin`.
 *
 * Creating a company provisions its Traccar side too — group, user, and the group permission —
 * so a company exists in both systems after one form, and the Traccar user this app stores
 * credentials for is guaranteed to be the one whose group holds that company's devices.
 */
class CompanyController extends Controller
{
    public function __construct(private readonly TraccarProvisioner $traccar)
    {
    }

    public function index(): JsonResponse
    {
        $companies = Client::withCount('users')
            ->orderBy('name')
            ->get(['id', 'name', 'traccar_group_id', 'traccar_email', 'status', 'created_at']);

        return response()->json($companies);
    }

    /**
     * Creates the company in Traccar and locally, plus an optional first login for it.
     *
     * Traccar is provisioned before the local transaction commits so that a Traccar failure
     * leaves nothing behind here; if the local half then fails, the Traccar objects just created
     * are discarded again. The two systems are not transactional together, so the order is chosen
     * to make the recoverable direction the likely one.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'             => 'required|string|max:255|unique:clients,name',
            'traccar_email'    => 'required|email|max:255|unique:clients,traccar_email',
            'traccar_password' => 'required|string|min:6|max:255',
            'status'           => ['nullable', Rule::in(['active', 'suspended'])],

            // Optional first login for the company. Without one the company exists but nobody can
            // sign in as it, which is a legitimate state while credentials are being handed over.
            'admin_name'     => 'required_with:admin_email|nullable|string|max:255',
            'admin_email'    => 'nullable|email|max:255|unique:users,email',
            'admin_password' => 'required_with:admin_email|nullable|string|min:8|max:255',
        ]);

        if ($this->traccar->userExists($data['traccar_email'])) {
            throw ValidationException::withMessages([
                'traccar_email' => ['Traccar already has a user with this email. Pick another, or remove it in Traccar first.'],
            ]);
        }

        $groupId = null;
        $userId  = null;

        try {
            $groupId = $this->traccar->createGroup($data['name']);
            $userId  = $this->traccar->createUser($data['name'], $data['traccar_email'], $data['traccar_password']);
            $this->traccar->grantGroupAccess($userId, $groupId);

            $company = DB::transaction(function () use ($data, $groupId) {
                $company = Client::create([
                    'name'             => $data['name'],
                    'traccar_group_id' => $groupId,
                    'traccar_email'    => $data['traccar_email'],
                    'traccar_password' => $data['traccar_password'],
                    'status'           => $data['status'] ?? 'active',
                ]);

                if (!empty($data['admin_email'])) {
                    User::create([
                        'name'      => $data['admin_name'],
                        'email'     => $data['admin_email'],
                        'password'  => $data['admin_password'],
                        'role'      => 'client_admin',
                        'client_id' => $company->id,
                    ]);
                }

                return $company;
            });
        } catch (\Throwable $e) {
            $this->traccar->discard($userId, $groupId);

            throw $e;
        }

        return response()->json($company->loadCount('users'), 201);
    }

    /**
     * Renames or suspends a company, and optionally rotates its Traccar password.
     *
     * The password lives in two places that must not drift: Traccar (the real one) and this app's
     * encrypted copy (what it authenticates with). Traccar is changed first, because a failure
     * there leaves both sides on the old password, while the reverse would lock the tenant out.
     */
    public function update(Request $request, Client $company): JsonResponse
    {
        $data = $request->validate([
            'name'             => ['required', 'string', 'max:255', Rule::unique('clients', 'name')->ignore($company->id)],
            'status'           => ['required', Rule::in(['active', 'suspended'])],
            'traccar_password' => 'nullable|string|min:6|max:255',
        ]);

        if (!empty($data['traccar_password'])) {
            $traccarUserId = $this->traccar->findUserId($company->traccar_email);

            if ($traccarUserId === null) {
                throw ValidationException::withMessages([
                    'traccar_password' => ["Traccar has no user with the email {$company->traccar_email}, so the password cannot be rotated."],
                ]);
            }

            $this->traccar->updateUserPassword($traccarUserId, $data['traccar_password']);
            $company->traccar_password = $data['traccar_password'];
        }

        $company->fill(['name' => $data['name'], 'status' => $data['status']])->save();

        return response()->json($company->loadCount('users'));
    }

    /**
     * Removes the company from this app only. The Traccar group, user, devices and their whole
     * position history are deliberately left alone: they are the customer's operational record,
     * and an app-side delete is not the place to destroy it. Clean it up in Traccar if you mean to.
     *
     * The company's logins are deleted explicitly rather than left to the users.client_id foreign
     * key, whose ON DELETE SET NULL would strand them with a null client_id — and a stranded user
     * holding an 'admin' role would satisfy isPlatformAdmin() and gain the entire fleet.
     */
    public function destroy(Client $company): JsonResponse
    {
        $deletedUsers = DB::transaction(function () use ($company) {
            $count = $company->users()->count();
            $company->users()->delete();
            $company->delete();

            return $count;
        });

        return response()->json([
            'message' => "Company removed from Turprotrack along with {$deletedUsers} login(s). Its Traccar group, user and devices were left untouched.",
        ]);
    }

    /**
     * The devices this company can actually see, fetched as the company itself.
     *
     * This is the isolation check made visible: it is the very same call the tenant's own session
     * makes, so whatever it returns is precisely what that company's users see on their dashboard.
     */
    public function devices(Client $company): JsonResponse
    {
        if (!$company->hasTraccarCredentials()) {
            return response()->json([
                'ok'      => false,
                'devices' => [],
                'error'   => 'No Traccar credentials are stored for this company.',
            ]);
        }

        $result = $this->traccar->verify($company->traccar_email, $company->traccar_password);

        // Traccar answers 401 both for a wrong password and for an account that no longer exists,
        // and the difference decides what the operator should do: rotate the password, or
        // re-create the user. Asking the service account which of the two it is costs one call and
        // is only made when something is already wrong.
        if (!$result['ok']) {
            try {
                if ($this->traccar->findUserId($company->traccar_email) === null) {
                    $result['error'] = "Traccar has no user \"{$company->traccar_email}\" any more — "
                        . 'it was deleted or renamed there, so nobody in this company can sign in.';
                    $result['missing_user'] = true;
                }
            } catch (\Throwable) {
                // Leaves the original error in place; the service account has its own problem.
            }
        }

        return response()->json($result);
    }

    /**
     * Re-creates the Traccar side of a company whose user was deleted in Traccar.
     *
     * Deleting a company here never touches Traccar, but the reverse can and does happen: someone
     * tidies up in Traccar and the company is left holding credentials for an account that no
     * longer exists. Without this the only way back is to delete and re-create the company, which
     * would throw away its logins for no reason.
     *
     * The group is re-created only if it is also gone; when it survives (with the company's
     * devices still in it) the existing one is re-used, so device assignments are preserved.
     */
    public function repair(Request $request, Client $company): JsonResponse
    {
        $data = $request->validate([
            'traccar_password' => 'required|string|min:6|max:255',
        ]);

        if ($this->traccar->userExists($company->traccar_email)) {
            throw ValidationException::withMessages([
                'traccar_password' => ['That Traccar user already exists. Use Edit to rotate its password instead.'],
            ]);
        }

        $groupId    = $company->traccar_group_id;
        $freshGroup = null;

        if ($groupId === null || !$this->traccar->groupExists($groupId)) {
            $groupId = $freshGroup = $this->traccar->createGroup($company->name);
        }

        $userId = null;

        try {
            $userId = $this->traccar->createUser($company->name, $company->traccar_email, $data['traccar_password']);
            $this->traccar->grantGroupAccess($userId, $groupId);
        } catch (\Throwable $e) {
            $this->traccar->discard($userId, $freshGroup);

            throw $e;
        }

        $company->traccar_password = $data['traccar_password'];
        $company->traccar_group_id = $groupId;
        $company->save();

        return response()->json([
            'message' => $freshGroup === null
                ? "Traccar user re-created and linked to the existing group {$groupId}, so this company's devices are unchanged."
                : "Traccar user and a new group ({$groupId}) were created. The old group was gone, so add this company's devices to the new one.",
            'company' => $company->loadCount('users'),
        ]);
    }
}
