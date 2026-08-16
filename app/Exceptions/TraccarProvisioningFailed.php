<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Thrown when Traccar refuses a provisioning call — creating a group or user, linking a
 * permission, rotating a password.
 *
 * Rendered as 422 rather than 500 because these are almost always something the operator can act
 * on (a duplicate email, a group that was deleted in Traccar, the server being down), and a bare
 * 500 hides Traccar's own explanation behind a generic error page once APP_DEBUG is off.
 */
class TraccarProvisioningFailed extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 422);
    }
}
