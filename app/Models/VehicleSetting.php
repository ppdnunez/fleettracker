<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Per-vehicle configuration, keyed by IMEI rather than vehicle id so a device can carry settings
 * before (or without) a vehicle profile existing.
 *
 * Safety-sticker and insurance expiry live here rather than on Driver: they belong to the
 * vehicle, not to whichever driver happens to be assigned this week.
 */
class VehicleSetting extends Model
{
    public const DEFAULT_RELAY_CHANNEL = 10;

    protected $fillable = [
        'imei',
        'relay_disconnect_enabled',
        'relay_disconnect_on_face_fail',
        'relay_channel',
        'fuel_rate_l_per_100km',
        'fuel_tank_capacity_liters',
        'vehicle_type',
        'fuel_type',
        'safety_sticker_expiry',
        'sticker_notify_days_before',
        'sticker_notified_at',
        'insurance_expiry',
        'insurance_notify_days_before',
        'insurance_notified_at',
        'sim_number',
        'sim_data_expiry',
        'sim_notify_days_before',
        'sim_notified_at',
    ];

    protected function casts(): array
    {
        return [
            'relay_disconnect_enabled'      => 'boolean',
            'relay_disconnect_on_face_fail' => 'boolean',
            'safety_sticker_expiry'         => 'date',
            'sticker_notified_at'           => 'date',
            'insurance_expiry'              => 'date',
            'insurance_notified_at'         => 'date',
            'sim_data_expiry'               => 'date',
            'sim_notified_at'               => 'date',
        ];
    }
}
