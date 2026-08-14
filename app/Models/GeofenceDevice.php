<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One device's link to a work-zone, plus which crossing direction should raise an alert.
 * `is_inside` is the last known containment state, used to detect a transition rather than
 * re-alerting on every position while the vehicle sits inside the zone.
 */
class GeofenceDevice extends Model
{
    protected $table = 'geofence_device';

    protected $fillable = ['geofence_id', 'imei', 'alert_direction', 'is_inside'];

    protected function casts(): array
    {
        return ['is_inside' => 'boolean'];
    }

    public function geofence(): BelongsTo
    {
        return $this->belongsTo(Geofence::class);
    }
}
