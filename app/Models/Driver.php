<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Safety-sticker expiry deliberately does NOT live here: it is a property of the vehicle, not
 * the person, and lives on vehicle_settings (safety_sticker_expiry / sticker_notify_days_before
 * / sticker_notified_at). This model tracks only the driver's own credentials.
 */
class Driver extends Model
{
    protected $fillable = [
        'badge_no',
        'name',
        'phone',
        'license_no',
        'rfid_card_no',
        'ibutton_no',
        'register_place',
        'register_date',
        'license_expiry',
        'notify_days_before',
        'status',
        'traccar_driver_id',
        'traccar_unique_id',
        'license_notified_at',
    ];

    protected function casts(): array
    {
        return [
            'register_date'       => 'date',
            'license_expiry'      => 'date',
            'license_notified_at' => 'date',
        ];
    }

    /** Vehicles this driver is assigned to, as driver_device rows. */
    public function links(): HasMany
    {
        return $this->hasMany(DriverDevice::class);
    }

    /** Per-device face-enrolment state. */
    public function faces(): HasMany
    {
        return $this->hasMany(DriverFace::class);
    }
}
