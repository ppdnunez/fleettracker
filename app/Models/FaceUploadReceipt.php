<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per inbound call to /img/uploads/face/uploadPic — the device pushing an image or clip
 * back to us. Rejections are kept alongside successes; see the migration for why.
 */
class FaceUploadReceipt extends Model
{
    protected $fillable = [
        'imei',
        'driver_id',
        'instruction_id',
        'file_name',
        'stored_path',
        'file_size',
        'signature_valid',
        'response_code',
        'response_message',
        'ip',
        'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'signature_valid' => 'boolean',
        ];
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(Driver::class);
    }

    /** Where the stored file can actually be fetched from, or null when nothing was stored. */
    public function fileUrl(): ?string
    {
        return $this->stored_path ? asset($this->stored_path) : null;
    }
}
