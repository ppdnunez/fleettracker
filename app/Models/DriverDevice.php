<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Driver <-> vehicle assignment, joined by IMEI rather than a vehicle id so an assignment
 * survives a vehicle profile being recreated. A vehicle can hold several drivers at once
 * (shift-based driving), and a driver can be assigned to several vehicles.
 */
class DriverDevice extends Model
{
    protected $table = 'driver_device';

    protected $fillable = ['driver_id', 'imei'];

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }
}
