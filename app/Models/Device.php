<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Device extends Model
{
    use HasFactory;

    protected $fillable = [
        'name', 'identifier', 'tracker',
        'phone', 'model', 'status', 'signal', 'lat', 'lng',
    ];

    protected $casts = [
        'signal' => 'integer',
        'lat'    => 'float',
        'lng'    => 'float',
    ];
}
