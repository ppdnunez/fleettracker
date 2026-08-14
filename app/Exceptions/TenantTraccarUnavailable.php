<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;

/**
 * Thrown when the signed-in user cannot be mapped to a usable Traccar identity — unassigned to
 * a client, suspended, or missing credentials. Deliberately fails closed: we never silently
 * fall back to the admin service account, because that would hand a tenant the whole fleet.
 */
class TenantTraccarUnavailable extends Exception
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 403);
    }
}
