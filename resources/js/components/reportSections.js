/**
 * Which reports belong to which statistics module.
 *
 * One source of truth for two consumers that must not drift apart: the sidebar renders one entry
 * per module, and ReportPage renders one tab per report inside the module being viewed. Splitting
 * this across both files is how the two lists end up disagreeing, leaving a report reachable from
 * one place and not the other.
 *
 * The strings are the keys of ReportPage's PAGES map, so they double as the tab labels. A report
 * left out of every module here is still routable (Dashboard holds `reportSection` as plain state)
 * but has no tab and no sidebar entry — which is how the fuel drill-downs and the mock State
 * Statistics summary are kept out of the nav without being unrouted.
 */
export const REPORT_GROUPS = [
    {
        label: 'Device Statistics',
        // Hidden, not deleted: 'Current fuel Value' and 'Positioning & Battery'. Their components
        // and PAGES entries are untouched, so putting a name back on this list is all it takes to
        // restore the tab. ('Temperature & Humidity' now lives under Sensor Statistics below.)
        sections: [
            'Internal Battery', 'External Battery', 'Fuel Consumption', 'Driver Behavior',
            'Travel statistics (OBD)',
        ],
    },
    {
        label: 'Motion Statistics',
        sections: [
            'Track Details', 'Replay', 'Mileage', 'Trips', 'Overspeed', 'Parking', 'Idling',
            'Ignition', 'Geo Fence',
        ],
    },
    {
        // Sensor modules, which report on their own packets rather than with every fix — hence a
        // module of their own rather than columns bolted onto the device reports.
        label: 'Sensor Statistics',
        sections: ['Temperature & Humidity', 'Tyre / TPMS'],
    },
    {
        // Fuel is the one sensor family Traccar also raises its own events for, so it gets a module
        // rather than a tab: readings, those events, and the slow-siphon check Traccar cannot do.
        label: 'Fuel Statistics',
        sections: ['Fuel Level', 'Fuel Events', 'Theft Watch'],
    },
    {
        label: 'State Statistics',
        sections: ['Offline', 'Online'],
    },
    {
        label: 'Alert Statistics',
        sections: ['Alert Details', 'Video Evidence'],
    },
];

/** The module a report sits in, or null for one deliberately kept out of the nav. */
export function groupForSection(section) {
    return REPORT_GROUPS.find(g => g.sections.includes(section)) ?? null;
}

/** Where the Report page lands when nothing more specific has been chosen. */
export const DEFAULT_REPORT_SECTION = REPORT_GROUPS[0].sections[0];
