<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * How long an access token may sit unused before a later login for the same account prunes
     * it. Long enough that someone back from leave is not signed out, short enough that the
     * token table stays small.
     */
    private const TOKEN_IDLE_DAYS = 30;

    public function login(Request $request)
    {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Invalid email or password.'],
            ]);
        }

        // A suspended tenant can still hold valid app credentials; stop them at the door rather
        // than letting them in to a dashboard that will 403 on every request.
        $client = $user->client;
        if ($client && !$client->isActive()) {
            throw ValidationException::withMessages([
                'email' => ['This client account is suspended.'],
            ]);
        }

        // One token per login, and each login is one browser. Revoking the rest here signed the
        // account out everywhere else: a shared operations login is worked from several machines
        // at once, and each new sign-in kicked the others back to the login screen mid-shift.
        //
        // Wholesale deletion was doing a real job, though — Sanctum's expiration is unset, so a
        // token lives until something removes it and the table would otherwise gain a row per
        // login forever. Prune only the idle ones: a token untouched for TOKEN_IDLE_DAYS belongs
        // to a closed browser, not to a colleague working in the next room.
        $cutoff = now()->subDays(self::TOKEN_IDLE_DAYS);

        $user->tokens()
            ->where(fn ($q) => $q
                ->where('last_used_at', '<', $cutoff)
                ->orWhere(fn ($q) => $q->whereNull('last_used_at')->where('created_at', '<', $cutoff)))
            ->delete();

        $token = $user->createToken($this->tokenName($request))->plainTextToken;

        return response()->json([
            'user'  => $this->profile($user),
            'token' => $token,
        ]);
    }

    /**
     * Identity plus the tenant it belongs to. `client` is null for platform administrators,
     * which is what the UI keys off to decide whether it is showing one tenant or the fleet.
     */
    private function profile(User $user): array
    {
        $user->loadMissing('client');

        return array_merge($user->only(['id', 'name', 'email', 'role']), [
            'is_admin' => $user->isPlatformAdmin(),
            // Lets the UI show the company's own user administration without having to infer it
            // from role and client together, and mirrors what CompanyUserController enforces.
            'is_company_admin' => $user->isCompanyAdmin(),
            'client'   => $user->client ? [
                'id'     => $user->client->id,
                'name'   => $user->client->name,
                'status' => $user->client->status,
            ] : null,
        ]);
    }

    /**
     * A label for the token identifying the browser that asked for it.
     *
     * Sanctum never matches on this column, so it is free to carry something useful: with several
     * people signed in as the same account, it is the only way to tell one live session from
     * another in personal_access_tokens.
     */
    private function tokenName(Request $request): string
    {
        $agent = trim((string) $request->userAgent());

        return $agent === '' ? 'fleet-token' : mb_substr($agent, 0, 120);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request)
    {
        return response()->json($this->profile($request->user()));
    }
}
