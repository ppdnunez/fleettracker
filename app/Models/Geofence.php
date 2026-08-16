<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClient;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A work-zone. `area` is WKT — CIRCLE (lat lon, radiusMetres) or POLYGON ((lat lon, …)) — the
 * same notation Traccar uses, so a zone drawn here reads identically either side.
 *
 * Owned by the company that created it — see BelongsToClient.
 */
class Geofence extends Model
{
    use BelongsToClient;

    protected $fillable = ['name', 'area', 'color'];

    /**
     * Devices (by IMEI) this zone applies to. A geofence is only ever evaluated against devices
     * linked here, mirroring Traccar's separate permissions step.
     */
    public function links(): HasMany
    {
        return $this->hasMany(GeofenceDevice::class);
    }
}
