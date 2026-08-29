<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClient;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One command sent to one device, from the POST that dispatched it to the reply that settled it.
 *
 * See the migration for why this exists at all. The lifecycle is:
 *
 *   pending  Traccar took it (HTTP 200) and wrote it to a live connection. A reply is expected,
 *            and result() polls for one until timeout_seconds elapses.
 *   queued   Traccar took it (HTTP 202) but the device is offline, so it will be delivered on
 *            reconnect. No clock runs — "when the vehicle next powers up" is not a deadline.
 *   success  A commandResult event came back; `response` is the device's own text.
 *   timeout  Nothing came back before the deadline. The command may still have been executed —
 *            several of them (RESET#, FACTORY#) never answer by design.
 *   failed   Traccar refused it outright, or could not be reached; `error` says which.
 */
class DeviceCommand extends Model
{
    use BelongsToClient;

    protected $fillable = [
        'user_id',
        'imei',
        'traccar_device_id',
        'device_name',
        'type',
        'content',
        'parameters',
        'channel',
        'is_manual',
        'mode',
        'status',
        'http_status',
        'response',
        'error',
        'timeout_seconds',
        'sent_at',
        'responded_at',
    ];

    protected function casts(): array
    {
        return [
            'parameters'   => 'array',
            'is_manual'    => 'boolean',
            'sent_at'      => 'datetime',
            'responded_at' => 'datetime',
        ];
    }

    /**
     * How long to wait for a reply, by command.
     *
     * The defaults come from what the command actually has to do before it can answer, not from a
     * single number that suits none of them: a parameter query is a lookup, WHERE# may be waiting
     * on a GPS fix, and the two reset commands reboot the device instead of replying.
     */
    private const TIMEOUTS = [
        'WHERE'   => 120,  // may block on a cold GPS fix
        'RESET'   => 0,    // reboots; the connection drops before anything is sent back
        'FACTORY' => 0,    // same, and the device re-registers afterwards
    ];

    /**
     * The keyword Traccar's VL863P encoder produces for each typed command, for the ones whose
     * wait differs from the default. A typed "Reboot Device" reaches the vehicle as RESET# and
     * goes just as quiet as the text form, so it has to be recognised as the same thing.
     */
    private const TYPE_KEYWORDS = [
        'positionSingle' => 'WHERE',
        'rebootDevice'   => 'RESET',
        'factoryReset'   => 'FACTORY',
    ];

    public const DEFAULT_TIMEOUT = 30;

    /** The keyword before the first comma — "SPEED,ON,0,80,10#" is a SPEED command. */
    public static function keyword(?string $content): string
    {
        return strtoupper(trim(strtok((string) $content, ",#") ?: ''));
    }

    /**
     * Seconds to wait for this command's reply; 0 means it does not answer, so do not wait.
     *
     * Typed commands carry no content of their own — the encoder writes the ASCII — so the type
     * is what identifies them.
     */
    public static function timeoutFor(?string $content, string $type = 'custom'): int
    {
        $keyword = $type === 'custom'
            ? self::keyword($content)
            : (self::TYPE_KEYWORDS[$type] ?? '');

        return self::TIMEOUTS[$keyword] ?? self::DEFAULT_TIMEOUT;
    }

    /** True once the outcome is known and polling should stop. */
    public function isSettled(): bool
    {
        return in_array($this->status, ['success', 'failed', 'timeout'], true);
    }

    /**
     * Whether the wait has run out. Only `pending` rows have a deadline — a queued command is
     * waiting on the vehicle, which is not something a stopwatch can decide.
     */
    public function hasExpired(): bool
    {
        if ($this->status !== 'pending' || !$this->sent_at) {
            return false;
        }

        return $this->sent_at->copy()->addSeconds($this->timeout_seconds)->isPast();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
