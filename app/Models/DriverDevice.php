<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClientThroughDriver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Driver <-> vehicle assignment, joined by IMEI rather than a vehicle id so an assignment
 * survives a vehicle profile being recreated. A vehicle can hold several drivers at once
 * (shift-based driving), and a driver can be assigned to several vehicles.
 *
 * Visible to whoever can see the driver it belongs to — see BelongsToClientThroughDriver. This is
 * what stops one company's sync() call from clearing another's assignments for the same IMEI.
 */
class DriverDevice extends Model
{
    use BelongsToClientThroughDriver;

    protected $table = 'driver_device';

    protected $fillable = ['driver_id', 'imei'];

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }
}
