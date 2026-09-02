import { useState } from 'react';
import Logo from './Logo.jsx';
import { REPORT_GROUPS, groupForSection } from './reportSections.js';

/* ── palette (shares the cockpit dashboard's dark operations tokens) ── */
const S = {
    bg:         '#141414',
    border:     '#2c2c2c',
    hairline:   '#222222',
    text:       '#f5f0e8',
    secondary:  '#9a8a75',
    muted:      '#5a4e42',
    accent:     '#f59e0b',
    accentDeep: '#d97706',
    // The amber glow flattened onto the rail, and a neutral hover a shade above it.
    activeTint: '#2e2110',
    hoverBg:    '#1e1e1e',
    activeBg:   '#222222',
    danger:     '#ef4444',
};

/* ── SVG icons ─────────────────────────────────────────────── */
const HamSVG = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="2" y1="4"  x2="16" y2="4"/>
        <line x1="2" y1="9"  x2="16" y2="9"/>
        <line x1="2" y1="14" x2="16" y2="14"/>
    </svg>
);
const DashSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="1" y="1" width="6" height="6" rx="1.5"/>
        <rect x="10" y="1" width="6" height="6" rx="1.5"/>
        <rect x="1" y="10" width="6" height="6" rx="1.5"/>
        <rect x="10" y="10" width="6" height="6" rx="1.5"/>
    </svg>
);
const ReportSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="2" y="1" width="13" height="15" rx="2"/>
        <line x1="5" y1="6"  x2="12" y2="6"/>
        <line x1="5" y1="9"  x2="12" y2="9"/>
        <line x1="5" y1="12" x2="9"  y2="12"/>
    </svg>
);
const DeviceSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="1.5" y="2" width="14" height="10" rx="2"/>
        <line x1="5" y1="12" x2="5"  y2="15"/>
        <line x1="12" y1="12" x2="12" y2="15"/>
        <line x1="3" y1="15" x2="14" y2="15"/>
    </svg>
);
const FleetSVG = () => (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <rect x="1" y="5" width="5" height="10" rx="1"/>
        <rect x="7" y="3" width="5" height="12" rx="1"/>
        <rect x="13" y="1" width="3" height="14" rx="1"/>
    </svg>
);
/* Fleet sub-module icons */
const PersonSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="7.5" cy="4.6" r="2.9"/>
        <path d="M1.8 13.6c0-2.8 2.4-4.6 5.7-4.6s5.7 1.8 5.7 4.6"/>
    </svg>
);
const CarSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.6 9.6V7.4l1.5-3.3a1.3 1.3 0 0 1 1.2-.8h6.4a1.3 1.3 0 0 1 1.2.8l1.5 3.3v2.2"/>
        <path d="M1.6 9.6h11.8v2H1.6z"/>
        <circle cx="4.2" cy="11.6" r="1.1"/>
        <circle cx="10.8" cy="11.6" r="1.1"/>
    </svg>
);
const PinSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M7.5 1.4c-2.6 0-4.7 2.1-4.7 4.7 0 3.3 4.7 7.5 4.7 7.5s4.7-4.2 4.7-7.5c0-2.6-2.1-4.7-4.7-4.7Z"/>
        <circle cx="7.5" cy="6.1" r="1.8"/>
    </svg>
);
const WrenchSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.2 1.7a3.9 3.9 0 0 0-4.4 5.1L1.7 10.9a1.4 1.4 0 0 0 2 2l4.1-4.1a3.9 3.9 0 0 0 5.1-4.4l-2.2 2.2-1.9-.5-.5-1.9Z"/>
    </svg>
);
const FuelSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.3 13.4V2.8a1.3 1.3 0 0 1 1.3-1.3h3.7a1.3 1.3 0 0 1 1.3 1.3v10.6"/>
        <line x1="1.4" y1="13.4" x2="9.9" y2="13.4"/>
        <line x1="3.9" y1="5.3" x2="7" y2="5.3"/>
        <path d="M9.2 4.4l2.1 2.1v4.6a1.2 1.2 0 0 0 2.3 0V5.9l-1.9-1.9"/>
    </svg>
);
const CheckInSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="2.6" width="12" height="9.8" rx="1.5"/>
        <line x1="1.5" y1="5.7" x2="13.5" y2="5.7"/>
        <polyline points="5.2,9.1 6.7,10.5 9.8,7.5"/>
    </svg>
);
/* Settings group + its two new sub-modules */
const SimSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M2.6 1.9h6.1l3.7 3.6v7.6H2.6z"/>
        <rect x="5" y="7.4" width="5" height="3.6" rx="0.8"/>
    </svg>
);
const CompanySVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.6" y="4.4" width="7" height="9" rx="1"/>
        <path d="M8.6 7.4h4.8v6h-4.8"/>
        <line x1="3.8" y1="7" x2="6.4" y2="7"/>
        <line x1="3.8" y1="9.6" x2="6.4" y2="9.6"/>
    </svg>
);
const MailSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.4" y="3" width="12.2" height="9" rx="1.6"/>
        <polyline points="1.9,4 7.5,8.2 13.1,4"/>
    </svg>
);
/* Terminal prompt: the Command module is where a raw device command is typed. */
const TerminalSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.4" y="2.2" width="12.2" height="10.6" rx="1.6"/>
        <polyline points="4.2,6 6.3,7.9 4.2,9.8"/>
        <line x1="8" y1="9.9" x2="10.8" y2="9.9"/>
    </svg>
);
const LogoutSVG = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>
        <polyline points="11,5 14,8 11,11"/>
        <line x1="6" y1="8" x2="14" y2="8"/>
    </svg>
);

/* Picture frame with a play mark: the gallery holds both stills and clips. */
const MediaSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="1.3" y="2.6" width="12.4" height="9.8" rx="1.6"/>
        <path d="M1.3 10.1l3.3-3 2.5 2.2 2.4-2.6 4.2 3.8"/>
        <circle cx="5.2" cy="5.9" r="1.05"/>
    </svg>
);

const AlertSVG = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2.2 14.4 13H1.6L8 2.2Z"/>
        <line x1="8" y1="6.6" x2="8" y2="9.4"/>
        <circle cx="8" cy="11.2" r="0.7" fill="currentColor" stroke="none"/>
    </svg>
);

/* Thermometer — the module covers temperature, humidity and tyre pressure, and a probe reads as
   "measurement" more immediately than a tyre would. */
const SensorSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6 8.9V3.1a1.6 1.6 0 0 1 3.2 0v5.8a3 3 0 1 1-3.2 0Z"/>
        <line x1="7.6" y1="5.4" x2="7.6" y2="9.6"/>
        <circle cx="7.6" cy="11.2" r="1.3" fill="currentColor" stroke="none"/>
    </svg>
);

/* Engine block with a valve stem — the module is about the vehicle's own engine data, so the
   engine itself reads more directly than a plug or a gauge would. */
const EngineSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 6.6h1.6V5h3.2v1.6h2.1l1.9-1.5v5.4l-1.9-1.5H6.8V10H3.6V8.4H2Z"/>
        <line x1="4.6" y1="3.1" x2="6.6" y2="3.1"/>
        <line x1="5.6" y1="3.1" x2="5.6" y2="5"/>
        <line x1="12.8" y1="6.2" x2="12.8" y2="8.8"/>
    </svg>
);

/* ── nav tree structure ─────────────────────────────────────── */
/* The reports themselves live in reportSections.js, shared with ReportPage, which renders one tab
   per report. Only the icon is a sidebar concern, so only the icon is chosen here. */
const REPORT_ICONS = {
    'Device Statistics': <DeviceSVG />,
    'Motion Statistics': <CarSVG />,
    'Sensor Statistics': <SensorSVG />,
    'OBD Statistics':    <EngineSVG />,
    'Fuel Statistics':   <FuelSVG />,
    'State Statistics':  <DashSVG />,
    'Alert Statistics':  <AlertSVG />,
};

/* ── helpers ─────────────────────────────────────────────────── */
const EXPANDED_W = 220;
const COLLAPSED_W = 62;

/**
 * A section heading — FLEET, SETTINGS, REPORT.
 *
 * A label, not a control. These used to be collapsible buttons, which meant the thing you
 * wanted was usually one click behind a chevron; with three short sections there is nothing to
 * collapse *for*. Hidden entirely when the rail is collapsed to icons, where a 62px column has
 * no room for a word and the groups are legible from the icons alone.
 */
function NavGroupLabel({ children, sidebarOpen }) {
    if (!sidebarOpen) return <div style={{ height: 10 }} />;

    return (
        <div style={{
            padding: '14px 10px 6px',
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: S.muted,
        }}>{children}</div>
    );
}

/**
 * One navigable entry.
 *
 * Selected state is three things at once — amber text, an amber left rule, and a warm tint
 * behind it. The tint alone was rejected before as looking like a pressed button; with the
 * rule and the coloured type it reads as position instead, which is what the reference does.
 */
function NavItem({ icon, label, active, onClick, sidebarOpen }) {
    const [hover, setHover] = useState(false);

    return (
        <button onClick={onClick} title={!sidebarOpen ? label : undefined}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: sidebarOpen ? '8px 12px' : '9px 0',
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                border: 'none', cursor: 'pointer',
                borderLeft: `2px solid ${active ? S.accentDeep : 'transparent'}`,
                background: active ? S.activeTint : hover ? S.hoverBg : 'transparent',
                color: active ? S.accent : hover ? S.text : S.secondary,
                fontSize: 13.5, fontWeight: active ? 600 : 400, flexShrink: 0,
                transition: 'background 0.15s, color 0.15s',
            }}>
            {/* The icon dims with the label rather than carrying its own colour, so a row reads
                as one object. Full strength only where the eye is meant to land. */}
            {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: active ? 1 : 0.7 }}>{icon}</span>}
            {sidebarOpen && <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</span>}
        </button>
    );
}

/* ── main component ─────────────────────────────────────────── */
/* `module` names the entry in the server's ModuleAccess table. The user profile carries the
   list of modules the signed-in role may reach, so what the nav offers and what the API permits
   come from one place. An entry with no module is available to anyone signed in. */
const FLEET_ITEMS = [
    { label: 'Dashboard',           key: 'Dashboard',          icon: <DashSVG />,   module: 'fleet.dashboard' },
    { label: 'Driver',              key: 'Driver',             icon: <PersonSVG />, module: 'fleet.driver' },
    { label: 'Vehicle',             key: 'Vehicle',            icon: <CarSVG />,    module: 'fleet.vehicle' },
    { label: 'Vehicle Track',       key: 'VehicleTrack',       icon: <PinSVG />,    module: 'fleet.vehicleTrack' },
    { label: 'Vehicle Maintenance', key: 'VehicleMaintenance', icon: <WrenchSVG />, module: 'fleet.vehicleMaintenance' },
    { label: 'Fuel Management',     key: 'FuelManagement',     icon: <FuelSVG />,   module: 'fleet.fuelManagement' },
];

/* Device and platform configuration. `hidden` keeps an entry out of the nav without unrouting it:
   Dashboard.jsx still renders these pages, so anything already pointing at one (a bookmark, a deep
   link) keeps working. Drop the flag to bring an item back.

   `module` names an entry in the server's ModuleAccess table, and the entry is offered only to a
   role whose profile lists that module. It is a convenience, not the control: the API refuses the
   same calls on its own through the `module` middleware, platform.admin, and
   CompanyUserController's per-request check. Hiding a link stops nobody who can open a console. */
const SETTINGS_ITEMS = [
    { label: 'Companies & Users',   page: 'Companies',           icon: <CompanySVG />, module: 'settings.companies' },
    { label: 'Device Management',   page: 'Device Management',   icon: <DeviceSVG />,  module: 'settings.deviceManagement' },
    { label: 'Sim Data Management', page: 'Sim Data Management', icon: <SimSVG />,     module: 'settings.simData' },
    { label: 'Device Map & Video',  page: 'Dashboard',           icon: <PinSVG />,    hidden: true },
    { label: 'Geofence',            page: 'Geofence',            icon: <PinSVG />,     module: 'settings.geofence' },
    { label: 'Alert Recipients',    page: 'Alert Recipients',    icon: <MailSVG />,    module: 'settings.alertRecipients' },
    { label: 'Fuel Thresholds',     page: 'Fuel Thresholds',     icon: <FuelSVG />,    module: 'settings.fuelThresholds' },
    { label: 'Media Gallery',       page: 'Media Gallery',       icon: <MediaSVG />,   module: 'settings.mediaGallery' },
    { label: 'Face Logs',           page: 'Face Logs',           icon: <PersonSVG />,  module: 'settings.faceLogs' },
    // Send a device a command and read its reply. Distinct from Saved Commands below, which is
    // Traccar's library of command definitions and sends nothing.
    { label: 'Command',             page: 'Command',             icon: <TerminalSVG />, module: 'settings.command' },
    { label: 'Saved Commands',      page: 'Saved Commands',      icon: <ReportSVG />, hidden: true },
    { label: 'Notification',        page: 'Notification',        icon: <ReportSVG />, hidden: true },
    { label: 'Calendars',           page: 'Calendars',           icon: <CheckInSVG />,hidden: true },
    { label: 'Computed Attributes', page: 'Computed Attributes', icon: <DashSVG />,   hidden: true },
    { label: 'Maintenance',         page: 'Maintenance',         icon: <WrenchSVG />, hidden: true },
    { label: 'Groups',              page: 'Groups',              icon: <FleetSVG />,  hidden: true },
    { label: 'Drivers',             page: 'Drivers',             icon: <PersonSVG />, hidden: true },
];
export default function Sidebar({ page, setPage, onLogoutClick, open, onToggle, reportSection, setReportSection, fleetPage, setFleetPage, user }) {
    // Which modules this login may reach, straight from the profile — the server decides, and
    // the nav only reflects it. An empty list means a role the server does not recognise, which
    // is deliberately given nothing rather than everything.
    const modules = user?.modules ?? [];
    const canReach = (m) => !m || modules.includes(m);

    const visibleFleetItems    = FLEET_ITEMS.filter(i => canReach(i.module));
    const visibleSettingsItems = SETTINGS_ITEMS.filter(i => !i.hidden && canReach(i.module));
    const canSeeReports  = canReach('reports');
    // A section with nothing left in it is a heading that opens onto an empty list, so the
    // heading goes too.
    const canSeeFleet    = visibleFleetItems.length > 0;
    const canSeeSettings = visibleSettingsItems.length > 0;

    const W = open ? EXPANDED_W : COLLAPSED_W;

    const navTo = (p) => { setPage(p); };
    const reportTo = (section) => { setReportSection(section); setPage('Report'); };

    const isReportActive   = page === 'Report';
    // Which statistics module the open report belongs to, so the module stays highlighted while the
    // reader moves between its tabs.
    const activeReportGroup = isReportActive ? groupForSection(reportSection) : null;
    const isFleetActive    = page === 'Fleet';

    return (
        <aside style={{
            width: W, minWidth: W, background: S.bg, borderRight: `1px solid ${S.border}`,
            display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0, overflow: 'hidden',
            transition: `width 0.22s ease, min-width 0.22s ease`,
        }}>
            {/* Logo + hamburger */}
            <div style={{ height: 58, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${S.border}`, flexShrink: 0, paddingLeft: open ? 14 : 0, justifyContent: open ? 'flex-start' : 'center', gap: 10, overflow: 'hidden' }}>
                {/* Collapsed, the header carries the hamburger alone. The mark at 30px in a 62px
                    column sat directly above the identical-width nav icons and read as another
                    one of them; with it gone the button is unambiguously the way back.
                    Expanded, the subtitle is abbreviated — the full phrase does not fit in 220px
                    beside the mark and the collapse button. */}
                {open && <div style={{ flex: 1, minWidth: 0 }}><Logo size="sm" subtitle="Fleet · GPS · Ops" /></div>}
                <button onClick={onToggle} title="Toggle sidebar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.secondary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 6, flexShrink: 0 }}>
                    <HamSVG />
                </button>
            </div>

            {/* Nav

                Flat sections rather than collapsible groups. Everything a role can reach is on
                screen, which is the whole point of a rail this short — the previous version put
                every destination one chevron behind a heading that was itself a navigation target,
                so a click could either move you or merely reveal where you might move to.

                The Report section keeps one entry per statistics module rather than a single
                "Reports" link. Those are eight distinct destinations, and collapsing them to one
                would trade navigation for tidiness. */}
            <nav style={{ flex: 1, padding: open ? '4px 0 12px' : '8px 0 12px', overflowY: 'auto', overflowX: 'hidden' }}>
                {canSeeFleet && (
                    <>
                        <NavGroupLabel sidebarOpen={open}>Fleet</NavGroupLabel>
                        {visibleFleetItems.map(({ label, key, icon }) => (
                            <NavItem key={key} icon={icon} label={label} sidebarOpen={open}
                                active={isFleetActive && fleetPage === key}
                                onClick={() => { navTo('Fleet'); setFleetPage(key); }} />
                        ))}
                    </>
                )}

                {canSeeSettings && (
                    <>
                        <NavGroupLabel sidebarOpen={open}>Settings</NavGroupLabel>
                        {visibleSettingsItems.map(({ label, page: target, icon }) => (
                            <NavItem key={label} icon={icon} label={label} sidebarOpen={open}
                                active={page === target && !isReportActive}
                                onClick={() => navTo(target)} />
                        ))}
                    </>
                )}

                {canSeeReports && (
                    <>
                        <NavGroupLabel sidebarOpen={open}>Report</NavGroupLabel>
                        {REPORT_GROUPS.map(group => (
                            <NavItem key={group.label} icon={REPORT_ICONS[group.label]} label={group.label}
                                sidebarOpen={open}
                                active={activeReportGroup?.label === group.label}
                                // Re-clicking the module the reader is already in keeps their tab
                                // rather than throwing them back to the first one.
                                onClick={() => reportTo(
                                    activeReportGroup?.label === group.label ? reportSection : group.sections[0]
                                )} />
                        ))}
                    </>
                )}
            </nav>

            {/* Sign out */}
            <div style={{ padding: open ? '10px 8px' : '10px 6px', borderTop: `1px solid ${S.border}`, flexShrink: 0 }}>
                <button onClick={onLogoutClick} title={!open ? 'Sign Out' : undefined} style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: open ? '9px 12px' : '9px 0',
                    justifyContent: open ? 'flex-start' : 'center',
                    borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: S.danger, fontSize: 13, fontWeight: 600,
                }}>
                    <LogoutSVG />
                    {open && 'Sign Out'}
                </button>
            </div>
        </aside>
    );
}
