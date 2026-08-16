<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClient;
use Illuminate\Database\Eloquent\Model;

// Maps the existing `vehicle_maintenances` table (created by the production migration
// 2026_07_13_000000_create_vehicle_maintenances_table, which is not part of this repo's
// migration set). A vehicle is identified by its IMEI, which is also the Traccar device
// uniqueId, so records survive Traccar device re-imports.
//
// Owned by the company that created it — see BelongsToClient.
class VehicleMaintenance extends Model
{
    use BelongsToClient;

    public const DEFAULT_NOTIFY_DAYS = 14;
    public const DEFAULT_NOTIFY_KM   = 500;

    protected $fillable = [
        'imei',
        'maintenance_type',
        'description',
        'status',
        'due_date',
        'due_odometer_km',
        'notify_days_before',
        'notify_km_before',
        'completed_date',
        'completed_odometer_km',
        'cost',
        'vendor',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'due_date'                 => 'date',
            'completed_date'           => 'date',
            'notified_due_date'        => 'date',
            'due_odometer_km'          => 'decimal:2',
            'completed_odometer_km'    => 'decimal:2',
            'notified_due_odometer_km' => 'decimal:2',
            'cost'                     => 'decimal:2',
        ];
    }

    /**
     * The status an operator actually sees. Scheduled records escalate to "Due Soon" or
     * "Overdue" on their own as the due date approaches or the vehicle's odometer climbs;
     * Completed and Cancelled are terminal and never escalate.
     *
     * $currentOdometerKm is the live reading from the vehicle's Traccar position. It is null
     * when the device has no position or no odometer attribute, in which case only the date
     * side of the schedule is evaluated.
     */
    public function effectiveStatus(?float $currentOdometerKm = null): string
    {
        if ($this->status !== 'Scheduled') {
            return $this->status;
        }

        $notifyDays = $this->notify_days_before ?? self::DEFAULT_NOTIFY_DAYS;
        $notifyKm   = $this->notify_km_before   ?? self::DEFAULT_NOTIFY_KM;

        if ($this->due_date) {
            $daysLeft = now()->startOfDay()->diffInDays($this->due_date->startOfDay(), false);
            if ($daysLeft < 0)            return 'Overdue';
            if ($daysLeft <= $notifyDays) return 'Due Soon';
        }

        if ($this->due_odometer_km !== null && $currentOdometerKm !== null) {
            $kmLeft = (float) $this->due_odometer_km - $currentOdometerKm;
            if ($kmLeft <= 0)         return 'Overdue';
            if ($kmLeft <= $notifyKm) return 'Due Soon';
        }

        return 'Scheduled';
    }
}
