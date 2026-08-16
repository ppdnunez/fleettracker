<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The logins inside one company.
 *
 * Two kinds of caller are allowed, and the difference is the whole of the authorisation model:
 * a platform administrator may manage any company, while a company's own client_admin may manage
 * only its own. Unlike CompanyController this is not behind `platform.admin`, so every action
 * re-checks the caller against the company in the URL — see authorize().
 *
 * Nothing here touches Traccar. Every login in a company shares that company's single Traccar
 * identity (Client::$traccar_email), so adding staff grants no new device access: five logins in
 * one company all see the same devices, and none of them can see another company's.
 */
class CompanyUserController extends Controller
{
    public function index(Request $request, Client $company): JsonResponse
    {
        $this->authorizeCompany($request, $company);

        return response()->json(
            $company->users()->orderBy('name')->get(['id', 'name', 'email', 'role', 'client_id', 'created_at'])
        );
    }

    public function store(Request $request, Client $company): JsonResponse
    {
        $this->authorizeCompany($request, $company);

        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|max:255',
            'role'     => ['required', Rule::in(User::TENANT_ROLES)],
        ]);

        // client_id comes from the URL, never the payload — it is what binds this login to a
        // tenant, and accepting it from the request would let a caller file a user under another
        // company (or under none, which would read as a platform administrator).
        $user = User::create([...$data, 'client_id' => $company->id]);

        return response()->json($user->only(['id', 'name', 'email', 'role', 'client_id']), 201);
    }

    public function update(Request $request, Client $company, User $user): JsonResponse
    {
        $this->authorizeCompany($request, $company);
        $this->authorizeMember($company, $user);

        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'role'     => ['required', Rule::in(User::TENANT_ROLES)],
            'password' => 'nullable|string|min:8|max:255',
        ]);

        // Demoting yourself out of client_admin would leave you unable to undo it, and can leave a
        // company with no administrator at all.
        if ($request->user()->id === $user->id && $data['role'] !== $user->role) {
            throw ValidationException::withMessages([
                'role' => ['You cannot change your own role. Ask another administrator.'],
            ]);
        }

        if (empty($data['password'])) {
            unset($data['password']);
        }

        $user->update($data);

        return response()->json($user->only(['id', 'name', 'email', 'role', 'client_id']));
    }

    public function destroy(Request $request, Client $company, User $user): JsonResponse
    {
        $this->authorizeCompany($request, $company);
        $this->authorizeMember($company, $user);

        if ($request->user()->id === $user->id) {
            throw ValidationException::withMessages([
                'user' => ['You cannot delete your own login.'],
            ]);
        }

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'Login deleted.']);
    }

    /**
     * A platform administrator may manage any company; anyone else must be that company's own
     * client_admin. 404 rather than 403 for the wrong-company case, so this cannot be used to
     * discover which company ids exist.
     */
    private function authorizeCompany(Request $request, Client $company): void
    {
        $caller = $request->user();

        if ($caller->isPlatformAdmin()) {
            return;
        }

        if ($caller->isCompanyAdmin() && $caller->client_id === $company->id) {
            return;
        }

        abort($caller->client_id === $company->id ? 403 : 404, 'You cannot manage logins for this company.');
    }

    /**
     * Guards the nested id: /companies/1/users/9 must 404 when user 9 belongs to company 2,
     * rather than editing it because the route matched.
     */
    private function authorizeMember(Client $company, User $user): void
    {
        abort_unless($user->client_id === $company->id, 404, 'That login does not belong to this company.');
    }
}
