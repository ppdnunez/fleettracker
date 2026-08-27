/**
 * Titles for the Fleet sub-pages.
 *
 * Kept out of FleetPage.jsx so the header can name the current page without
 * pulling the whole Fleet bundle in: Dashboard reads this on every render, and
 * importing it from FleetPage would defeat that file being loaded on demand.
 */
export const FLEET_PAGE_TITLES = {
    Dashboard:          'Fleet Dashboard',
    Driver:             'Driver',
    Vehicle:            'Vehicle',
    VehicleTrack:       'Vehicle Track',
    VehicleMaintenance: 'Vehicle Maintenance',
    FuelManagement:     'Fuel Management',
};
