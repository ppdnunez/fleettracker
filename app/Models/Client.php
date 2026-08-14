<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A tenant. `traccar_group_id` is the Traccar group holding this client's devices, and
 * `traccar_email`/`traccar_password` are the Traccar user linked to that group. The app calls
 * Traccar as that user, so Traccar enforces isolation server-side rather than the app
 * filtering results it was never supposed to receive.
 */
class Client extends Model
{
    protected $fillable = [
        'name',
        'traccar_group_id',
        'traccar_email',
        'traccar_password',
        'status',
    ];

    protected $hidden = ['traccar_password'];

    protected function casts(): array
    {
        return [
            'traccar_password' => 'encrypted',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /** Whether this tenant can actually talk to Traccar as itself. */
    public function hasTraccarCredentials(): bool
    {
        return filled($this->traccar_email) && filled($this->traccar_password);
    }
}
