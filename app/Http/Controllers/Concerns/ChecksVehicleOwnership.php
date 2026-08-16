<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Vehicle;
use Illuminate\Support\Facades\Auth;

/**
 * Ownership check for the endpoints keyed by IMEI rather than by a model id.
 *
 * Most tenant-owned data is protected by the BelongsToClient global scope, which also covers
 * route–model binding. Endpoints like /vehicle-settings/{imei} and /vehicle-drivers/{imei} take a
 * bare string instead, so there is no model to scope — the check has to be explicit, and the
 * vehicle registry is what records which company an IMEI belongs to.
 */
trait ChecksVehicleOwnership
{
    /**
     * 404s when the IMEI belongs to a vehicle registered to another company.
     *
     * An IMEI nobody has registered is allowed through: configuration and driver assignment can
     * legitimately precede the vehicle profile, and Traccar's own permissions already decide which
     * devices a tenant can see at all. Platform administrators are unrestricted.
     */
    protected function assertImeiOwned(string $imei): void
    {
        if (Auth::user()?->isPlatformAdmin()) {
            return;
        }

        $registeredSomewhere = Vehicle::withoutGlobalScope('client')->where('imei', $imei)->exists();
        $registeredToCaller  = Vehicle::where('imei', $imei)->exists();

        abort_if($registeredSomewhere && !$registeredToCaller, 404, 'No vehicle with that IMEI.');
    }
}
