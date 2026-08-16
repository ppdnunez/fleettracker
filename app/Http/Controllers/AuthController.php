<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
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

        $user->tokens()->delete();
        $token = $user->createToken('fleet-token')->plainTextToken;

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
