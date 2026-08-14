<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * FleetTrack's own vehicle registry (Fleet -> Vehicle). Binds a local vehicle profile to a
 * Traccar device by IMEI (the device's uniqueId) — the local row is what makes an IMEI "linked"
 * to a vehicle, and any Traccar device without one is offered in the Add Vehicle picker.
 *
 * Configuration (relay opt-in, fuel figures, sticker/insurance expiry) lives on VehicleSetting,
 * keyed by the same IMEI. This model owns only the vehicle's identity fields.
 */
class Vehicle extends Model
{
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
