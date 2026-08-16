<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;

/**
 * Tenant-scopes a table that has no owner of its own but hangs off a driver.
 *
 * Face enrolments and driver–vehicle assignments are keyed by driver_id and IMEI. Giving them
 * their own client_id would duplicate ownership and let it drift out of step with the driver, so
 * ownership is derived instead: the row is visible exactly when its driver is. Driver already
 * carries BelongsToClient, so `whereHas('driver')` inherits that filtering — no company id is
 * mentioned here at all, and the two can never disagree.
 *
 * Unscoped for console commands and platform administrators, matching BelongsToClient. Note the
 * public face webhooks in routes/web.php run with no authenticated user and so are unaffected —
 * the device posting its results must still be able to settle any row.
 */
trait BelongsToClientThroughDriver
{
    public static function bootBelongsToClientThroughDriver(): void
    {
        static::addGlobalScope('client', function (Builder $query) {
            $user = Auth::user();

            if (!$user || $user->isPlatformAdmin()) {
                return;
            }

            $query->whereHas('driver');
        });
    }
}
