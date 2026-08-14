<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per inbound device call to /img/uploads/face/upload or
 * /img/uploads/face/dowloadCallback — including the ones we rejected. Rejected requests are the
 * ones worth keeping: a bad signature or a missing field is how a misconfigured device shows up.
 */
class FaceImportLog extends Model
{
    protected $fillable = [
        'endpoint',
        'imei',
        'instruction_id',
        'timestamp',
        'signature_valid',
        'original_file_name',
        'stored_file_name',
        'stored_path',
        'file_content',
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
}
