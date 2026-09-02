/**
 * Which module each page belongs to.
 *
 * The names match App\Support\ModuleAccess exactly — that class is the authority, and the profile
 * returned by /api/user carries the list of modules the signed-in role may reach. Everything here
 * does is decide which page a given module name unlocks, so the sidebar and the page router agree
 * on the answer.
 *
 * A page absent from these maps is reachable by anyone signed in. That is the right default for
 * the ones the nav does not offer directly — Notification, Calendars, Groups and the rest are
 * hidden helpers reached from inside another page, and gating them separately would only produce
 * a dead end halfway through a task the API is going to permit anyway.
 */

export const PAGE_MODULES = {
    Companies:                'settings.companies',
    'Device Management':      'settings.deviceManagement',
    'Sim Data Management':    'settings.simData',
    Geofence:                 'settings.geofence',
    'Alert Recipients':       'settings.alertRecipients',
    'Fuel Thresholds':        'settings.fuelThresholds',
    'Media Gallery':          'settings.mediaGallery',
    'Face Logs':              'settings.faceLogs',
    Command:                  'settings.command',
    Report:                   'reports',
};

export const FLEET_PAGE_MODULES = {
    Dashboard:          'fleet.dashboard',
    Driver:             'fleet.driver',
    Vehicle:            'fleet.vehicle',
    VehicleTrack:       'fleet.vehicleTrack',
    VehicleMaintenance: 'fleet.vehicleMaintenance',
    FuelManagement:     'fleet.fuelManagement',
};

/** A `can(module)` predicate for a profile. No module named means no restriction. */
export function moduleChecker(user) {
    const modules = user?.modules ?? [];

    return (module) => !module || modules.includes(module);
}

/**
 * Where to send this login when the page it is on is not one it may open.
 *
 * Ordered by how useful a landing page is rather than by how much access it implies: someone who
 * can see the fleet wants the fleet, and a read-only login that can only reach reports should
 * land on reports rather than on an empty shell.
 */
export function firstAllowedPage(user) {
    const can = moduleChecker(user);

    if (can('fleet.dashboard') || can('fleet.vehicleTrack')) return 'Fleet';
    if (can('reports'))                                      return 'Report';

    const settings = Object.entries(PAGE_MODULES).find(([, m]) => can(m));

    return settings ? settings[0] : null;
}

/** The fleet sub-page to open for a login that cannot open the one it asked for. */
export function firstAllowedFleetPage(user) {
    const can = moduleChecker(user);

    return Object.keys(FLEET_PAGE_MODULES).find(key => can(FLEET_PAGE_MODULES[key])) ?? null;
}
