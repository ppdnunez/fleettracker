<?php

namespace App\Support;

use App\Models\User;

/**
 * Which modules each role may reach.
 *
 * One table, read by two consumers: the middleware that refuses a request, and the profile the
 * frontend builds its navigation from. Keeping both on the same source is the whole point — a
 * sidebar offering a page the API will refuse is worse than not offering it at all, and a sidebar
 * hiding a page the API allows quietly removes function nobody knows they have.
 *
 * The list handed to the browser is for navigation only. It is not the control: the modules with
 * an entry in routes/api.php are refused server-side as well, because a hidden nav entry stops
 * nobody who can open developer tools.
 *
 * Roles, and what each is for:
 *
 *   admin / super_admin  Platform administrators. No client_id, so they see every tenant.
 *   client_admin         A company's own administrator: everything inside its own tenancy.
 *   operator             Day-to-day fleet work. Full fleet and reports, plus the settings that
 *                        are part of running a fleet rather than configuring the platform.
 *   viewer               Read-only. Reports, plus the two fleet views that answer "where is it".
 */
final class ModuleAccess
{
    /* ── Fleet ─────────────────────────────────────────────────── */
    public const FLEET_DASHBOARD           = 'fleet.dashboard';
    public const FLEET_DRIVER              = 'fleet.driver';
    public const FLEET_VEHICLE             = 'fleet.vehicle';
    public const FLEET_VEHICLE_TRACK       = 'fleet.vehicleTrack';
    public const FLEET_VEHICLE_MAINTENANCE = 'fleet.vehicleMaintenance';
    public const FLEET_FUEL_MANAGEMENT     = 'fleet.fuelManagement';

    /* ── Reports ───────────────────────────────────────────────── */
    public const REPORTS = 'reports';

    /* ── Settings ──────────────────────────────────────────────── */
    public const COMPANIES         = 'settings.companies';
    public const DEVICE_MANAGEMENT = 'settings.deviceManagement';
    public const SIM_DATA          = 'settings.simData';
    public const GEOFENCE          = 'settings.geofence';
    public const ALERT_RECIPIENTS  = 'settings.alertRecipients';
    public const FUEL_THRESHOLDS   = 'settings.fuelThresholds';
    public const MEDIA_GALLERY     = 'settings.mediaGallery';
    public const FACE_LOGS         = 'settings.faceLogs';
    public const COMMAND           = 'settings.command';

    /** Every module there is, in the order the navigation presents them. */
    public const ALL = [
        self::FLEET_DASHBOARD,
        self::FLEET_DRIVER,
        self::FLEET_VEHICLE,
        self::FLEET_VEHICLE_TRACK,
        self::FLEET_VEHICLE_MAINTENANCE,
        self::FLEET_FUEL_MANAGEMENT,
        self::REPORTS,
        self::COMPANIES,
        self::DEVICE_MANAGEMENT,
        self::SIM_DATA,
        self::GEOFENCE,
        self::ALERT_RECIPIENTS,
        self::FUEL_THRESHOLDS,
        self::MEDIA_GALLERY,
        self::FACE_LOGS,
        self::COMMAND,
    ];

    /**
     * Everything a fleet is operated with, as opposed to everything the platform is configured
     * with. An operator runs vehicles; they do not register devices or issue raw device commands.
     */
    private const OPERATOR_MODULES = [
        self::FLEET_DASHBOARD,
        self::FLEET_DRIVER,
        self::FLEET_VEHICLE,
        self::FLEET_VEHICLE_TRACK,
        self::FLEET_VEHICLE_MAINTENANCE,
        self::FLEET_FUEL_MANAGEMENT,
        self::REPORTS,
        self::SIM_DATA,
        self::GEOFENCE,
        self::ALERT_RECIPIENTS,
        self::FUEL_THRESHOLDS,
        self::MEDIA_GALLERY,
    ];

    /**
     * Read-only. Reports, and the two fleet views that answer "where is my vehicle" — which is
     * what a viewer login is normally handed out for.
     */
    private const VIEWER_MODULES = [
        self::FLEET_DASHBOARD,
        self::FLEET_VEHICLE_TRACK,
        self::REPORTS,
    ];

    /**
     * Roles that may only look.
     *
     * Separate from the module list because the two questions are different: a viewer reaches
     * Vehicle Track and must be able to load positions, but must not be able to rename the
     * vehicle they are looking at. Module access answers "which pages"; this answers "may they
     * change anything at all".
     */
    private const READ_ONLY_ROLES = ['viewer'];

    /** @return list<string> the modules this user may reach */
    public static function forUser(?User $user): array
    {
        if (!$user) {
            return [];
        }

        // Platform administrators run the installation and a company's own administrator runs its
        // tenancy; neither is restricted by module. What separates them is how much of the fleet
        // they see, which client_id decides, not this table.
        if ($user->isPlatformAdmin() || $user->isCompanyAdmin()) {
            return self::ALL;
        }

        return match ($user->role) {
            'operator' => self::OPERATOR_MODULES,
            'viewer'   => self::VIEWER_MODULES,
            // An unrecognised role gets nothing rather than everything. A role that is a typo, or
            // one added to the database before this table knows about it, must not fall through
            // into full access.
            default    => [],
        };
    }

    public static function allows(?User $user, string $module): bool
    {
        return in_array($module, self::forUser($user), true);
    }

    /** Whether this user may change anything at all, in any module they can reach. */
    public static function canWrite(?User $user): bool
    {
        return $user !== null && !in_array($user->role, self::READ_ONLY_ROLES, true);
    }
}
