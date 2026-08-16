<?php

namespace App\Models\Concerns;

use App\Models\Client;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Makes a local table tenant-owned: rows are filtered to the signed-in user's company on every
 * query, and stamped with that company on create.
 *
 * This is the local-table counterpart to UsesTraccarApi. Traccar-sourced data is isolated by
 * Traccar's own permission model — the app literally cannot receive another tenant's devices.
 * Rows in this app's own tables have no such server behind them, so isolation has to be enforced
 * here, and it is done with a global scope rather than a `where` in each controller: a global
 * scope cannot be forgotten when someone adds a query later, and it also covers route–model
 * binding, so /api/vehicles/{id} for another company's vehicle 404s instead of resolving.
 *
 * Two callers are deliberately unscoped:
 *
 *   - Console commands and scheduled jobs, which have no authenticated user and must sweep the
 *     whole installation (expiry checks, alert dispatch).
 *   - Platform administrators, for the same reason they use the Traccar service account.
 *
 * A signed-in user who is neither — attached to no company — sees nothing at all rather than
 * everything, because failing closed is the only safe direction here.
 */
trait BelongsToClient
{
    public static function bootBelongsToClient(): void
    {
        static::addGlobalScope('client', function (Builder $query) {
            $user = Auth::user();

            if (!$user || $user->isPlatformAdmin()) {
                return;
            }

            if ($user->client_id === null) {
                // Not `where('client_id', null)`: Laravel rewrites that to `whereNull`, which
                // would hand this user every unowned row — the opposite of what is wanted.
                $query->whereRaw('1 = 0');

                return;
            }

            $query->where($query->getModel()->getTable() . '.client_id', $user->client_id);
        });

        // Ownership comes from the session, never from the request body. `client_id` is left out
        // of every $fillable precisely so a crafted payload cannot file a row under another
        // company; this is the only thing that sets it.
        static::creating(function (Model $model) {
            if ($model->client_id !== null) {
                return;
            }

            $user = Auth::user();

            if ($user && $user->client_id !== null) {
                $model->client_id = $user->client_id;
            }
        });
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }
}
