<?php

namespace App\Http\Middleware;

use App\Support\ModuleAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses a request whose module the caller's role does not include.
 *
 * Applied as `module:settings.geofence`, or with several names when one endpoint legitimately
 * serves more than one page — the caller needs any one of them.
 *
 * A second rule rides along: a read-only role is refused any request that is not a read, in every
 * module it can reach. Expressing that here rather than route by route means a viewer cannot be
 * given write access by a future route that simply forgets to think about it.
 */
class EnsureModuleAccess
{
    /** Methods that only ever read. Everything else is treated as a change. */
    private const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

    public function handle(Request $request, Closure $next, string ...$modules): Response
    {
        $user = $request->user();

        $permitted = $modules === []
            || array_filter($modules, fn (string $m) => ModuleAccess::allows($user, $m)) !== [];

        if (!$permitted) {
            abort(403, 'Your role does not have access to this module.');
        }

        if (!in_array($request->method(), self::READ_METHODS, true) && !ModuleAccess::canWrite($user)) {
            abort(403, 'Your role is read-only.');
        }

        return $next($request);
    }
}
