<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restricts a route to platform administrators — users with no client_id at all.
 *
 * Note this is stricter than "has an admin role": a company's own administrator carries
 * role=client_admin *and* a client_id, so it never passes here. That keeps tenant administration
 * (managing your own staff) separate from platform administration (creating companies).
 */
class EnsurePlatformAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user || !$user->isPlatformAdmin()) {
            abort(403, 'This action is restricted to platform administrators.');
        }

        return $next($request);
    }
}
