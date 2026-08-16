<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClient;
use Illuminate\Database\Eloquent\Model;

/**
 * Turprotrack's own vehicle registry (Fleet -> Vehicle). Binds a local vehicle profile to a
 * Traccar device by IMEI (the device's uniqueId) — the local row is what makes an IMEI "linked"
 * to a vehicle, and any Traccar device without one is offered in the Add Vehicle picker.
 *
 * Configuration (relay opt-in, fuel figures, sticker/insurance expiry) lives on VehicleSetting,
 * keyed by the same IMEI. This model owns only the vehicle's identity fields.
 *
 * Owned by the company that created it — see BelongsToClient. `client_id` is intentionally not
 * fillable: it is set from the session, never from the request.
 */
class Vehicle extends Model
{
    use BelongsToClient;

    protected $fillable = [
        'imei',
        'name',
        'plate_number',
        'manufacturer',
        'model',
        'year',
        'color',
        'status',
    ];
}
