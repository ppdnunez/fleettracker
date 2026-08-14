<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * FleetTrack's record of what each device has been asked to enrol for a driver.
 *
 * The face database itself lives on the JC171 device — there is no server-side copy of the
 * biometric template. This table tracks the command we sent, the photo we hold (either captured
 * in-browser or uploaded back by the device), and how far the enrolment got.
 */
class DriverFace extends Model
{
    protected $fillable = [
        'driver_id',
        'imei',
        'cmd_no',
        'status',
        'photo_path',
        'error',
        'requested_at',
        'enrolled_at',
    ];

    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'enrolled_at'  => 'datetime',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    /**
     * Public URL for the stored photo. Photos captured in the browser are written straight into
     * public/img/uploads so the device can fetch them back over plain HTTP with no storage
     * symlink involved; anything else came from the 'public' disk.
     */
    public function photoUrl(): ?string
    {
        if (!$this->photo_path) {
            return null;
        }

        return str_starts_with($this->photo_path, 'img/uploads/')
            ? '/' . $this->photo_path
            : '/storage/' . ltrim($this->photo_path, '/');
    }
}
