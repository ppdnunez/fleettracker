<?php

namespace App\Models;

use App\Models\Concerns\BelongsToClient;
use Illuminate\Database\Eloquent\Model;

/**
 * A subscriber to one or more of this app's alert emails — the list behind
 * Settings > Alert Recipients, and the single source of "who gets told" for every alert this
 * app sends. Replaces per-alert .env addresses and the older "email every registered User"
 * fallback.
 *
 * The categories fall into two families, which differ only in where the alert *originates*:
 *
 *   - Schedule-driven (driver_expiry, vehicle_expiry, vehicle_insurance_expiry, sim_expiry):
 *     this app's own daily commands compare a stored expiry date against today.
 *   - Traccar-driven (geofence, driver_checkin, vehicle_maintenance, fuel_alert): the event is
 *     raised by Traccar and read back off /api/reports/events by alerts:dispatch-traccar-events.
 *
 * Both families are delivered by Laravel's mailer. Traccar's own `mail` notificator is not used
 * to deliver them: this Traccar server reports emailEnabled=false (no SMTP configured), and even
 * with SMTP it can only email its own Traccar users, which these recipients are not.
 */
class AlertRecipient extends Model
{
    use BelongsToClient;

    /** value => label shown in the recipients UI; also the only valid values for `categories`. */
    public const CATEGORIES = [
        'geofence'                 => 'Geofence Enter/Exit',
        'driver_checkin'           => 'Driver Change / Check-in',
        'driver_expiry'            => 'Driver License Expiry',
        'vehicle_expiry'           => 'Vehicle Safety Sticker Expiry',
        'vehicle_insurance_expiry' => 'Vehicle Insurance Expiry',
        'vehicle_maintenance'      => 'Vehicle Maintenance Due',
        'sim_expiry'               => 'SIM Card Data/Load Expiry',
        'fuel_alert'               => 'Abnormal Fuel Loss / Drop',
        // The alerts configured per device under Device Management > Driving Behavior Alerts, split
        // out so the people who care about a crash are not also mailed every speeding event.
        'sos'                      => 'SOS / Panic Button',
        'overspeed'                => 'Overspeed',
        'harsh_driving'            => 'Harsh Acceleration / Braking / Cornering',
        'collision'                => 'Collision / Rollover',
        'fatigue_driving'          => 'Fatigue Driving (Overtime)',
        'device_alarm'             => 'Other Device Alarms',
    ];

    /**
     * Which Traccar event types feed which category, for alerts:dispatch-traccar-events.
     * Types not listed here raise no email — see Traccar's /api/notifications/types for the
     * full list this server supports.
     */
    public const TRACCAR_EVENT_CATEGORIES = [
        'geofenceEnter'       => 'geofence',
        'geofenceExit'        => 'geofence',
        'driverChanged'       => 'driver_checkin',
        'maintenance'         => 'vehicle_maintenance',
        'deviceFuelDrop'      => 'fuel_alert',
        'deviceFuelIncrease'  => 'fuel_alert',
        'alarm'               => 'device_alarm',
        'deviceOverspeed'     => 'overspeed',
    ];

    /**
     * Alarm sub-type => category, for the events that all arrive as type "alarm".
     *
     * Traccar carries the specific kind in attributes.alarm, so the event type alone cannot tell
     * an SOS from a harsh corner — both are "alarm". Anything not listed falls back to the generic
     * device_alarm category rather than being dropped, so a new alarm kind from a firmware update
     * still reaches someone.
     *
     * Several kinds map from more than one key because the vendor wording and Traccar's own
     * constant differ (a rollover is Traccar's `fallDown`, but some firmware reports `rollover`).
     */
    public const TRACCAR_ALARM_CATEGORIES = [
        'sos'              => 'sos',
        'overspeed'        => 'overspeed',
        'hardAcceleration' => 'harsh_driving',
        'hardBraking'      => 'harsh_driving',
        'hardCornering'    => 'harsh_driving',
        'accident'         => 'collision',
        'collision'        => 'collision',
        'fallDown'         => 'collision',
        'rollover'         => 'collision',
        'fatigueDriving'   => 'fatigue_driving',
        'overtime'         => 'fatigue_driving',
        'tired'            => 'fatigue_driving',
    ];

    /**
     * The category one Traccar event belongs to, or null when nobody can subscribe to it.
     *
     * @param array $event a row from Traccar's /api/reports/events
     */
    public static function categoryForEvent(array $event): ?string
    {
        $category = self::TRACCAR_EVENT_CATEGORIES[$event['type'] ?? ''] ?? null;

        if ($category === 'device_alarm') {
            $alarm = $event['attributes']['alarm'] ?? null;

            return self::TRACCAR_ALARM_CATEGORIES[$alarm] ?? 'device_alarm';
        }

        return $category;
    }

    protected $fillable = [
        'email',
        'name',
        'categories',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'categories' => 'array',
            'active'     => 'boolean',
        ];
    }

    /**
     * Active recipients' addresses for one category — what every alert-sending call site uses.
     *
     * $clientId is the company the alert is *about*, worked out by the caller from the device or
     * record that raised it. Passing it returns that company's own recipients plus any
     * platform-level ones (client_id null, typically the operator of the whole installation);
     * without it only platform-level recipients are returned. Never every recipient: that is what
     * used to email Company A's staff about Company B's vehicles.
     *
     * Callers are console commands, which have no authenticated user and so are not filtered by
     * BelongsToClient — the ownership rule here is applied explicitly instead.
     */
    public static function emailsFor(string $category, ?int $clientId = null): array
    {
        return static::query()
            ->where('active', true)
            ->where(fn ($q) => $q->whereNull('client_id')->when(
                $clientId !== null,
                fn ($w) => $w->orWhere('client_id', $clientId),
            ))
            ->get(['email', 'categories'])
            ->filter(fn (self $r) => in_array($category, $r->categories ?? [], true))
            ->pluck('email')
            ->unique()
            ->values()
            ->all();
    }
}
