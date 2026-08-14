import { useState } from 'react';

/* ── palette (shares the cockpit dashboard's dark operations tokens) ── */
const S = {
    bg:         '#0c1322',
    border:     '#1e2c46',
    hairline:   '#16233c',
    text:       '#eaeff9',
    secondary:  '#9daec9',
    muted:      '#5e7094',
    accent:     '#4da8ff',
    activeBg:   '#16233c',
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
const ChevSVG = ({ open }) => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}>
        <polyline points="2,3.5 5.5,7.5 9,3.5"/>
    </svg>
);
const LogoutSVG = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>
        <polyline points="11,5 14,8 11,11"/>
        <line x1="6" y1="8" x2="14" y2="8"/>
    </svg>
);

/* ── nav tree structure ─────────────────────────────────────── */
const REPORT_DEVICE = [
    'Internal Battery','External Battery','Fuel Consumption','Current fuel Value',
    'Temperature & Humidity','Driver Behavior','Positioning & Battery',
    'Travel statistics (OBD)',
];
const REPORT_MOTION = [
    'Track Details','Replay','Mileage','Trips','Overspeed','Parking','Idling','Ignition','Geo Fence',
];
const REPORT_ALERT = ['Alert Details'];

/* ── helpers ─────────────────────────────────────────────────── */
const EXPANDED_W = 220;
const COLLAPSED_W = 62;

function NavItem({ icon, label, active, onClick, depth = 0, open, sidebarOpen }) {
    const left = 8 + depth * 14;
    return (
        <button onClick={onClick} title={!sidebarOpen ? label : undefined} style={{
            display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
            padding: sidebarOpen ? `8px 8px 8px ${left}px` : '8px 0',
            justifyContent: sidebarOpen ? 'flex-start' : 'center',
            borderRadius: 8, border: 'none', cursor: 'pointer',
            borderLeft: `3px solid ${active ? S.accent : 'transparent'}`,
            background: active ? S.activeBg : 'transparent',
            color: active ? S.text : S.secondary,
            fontSize: 13, fontWeight: active ? 700 : 500, marginBottom: 1, flexShrink: 0,
            transition: 'background 0.14s, color 0.14s',
        }}>
            {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: active ? S.accent : S.muted }}>{icon}</span>}
            {sidebarOpen && <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</span>}
            {sidebarOpen && open !== undefined && <ChevSVG open={open} />}
        </button>
    );
}

function SubGroup({ label, items, openKey, activePage, onItemClick, onToggle, sidebarOpen }) {
    const isOpen = openKey;
    return (
        <>
            <button onClick={onToggle} style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
                padding: '6px 8px 6px 22px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: 'transparent', color: S.muted, fontSize: 12.5, fontWeight: 600, marginBottom: 1,
            }}>
                <span style={{ flex: 1 }}>{label}</span>
                <ChevSVG open={isOpen} />
            </button>
            {isOpen && items.map(item => (
                <NavItem key={item} label={item} depth={2} sidebarOpen={sidebarOpen}
                    active={activePage === item} onClick={() => onItemClick(item)} />
            ))}
        </>
    );
}

/* ── main component ─────────────────────────────────────────── */
const FLEET_ITEMS = [
    { label: 'Dashboard',           key: 'Dashboard',          icon: <DashSVG /> },
    { label: 'Driver',              key: 'Driver',             icon: <PersonSVG /> },
    { label: 'Vehicle',             key: 'Vehicle',            icon: <CarSVG /> },
    { label: 'Vehicle Track',       key: 'VehicleTrack',       icon: <PinSVG /> },
    { label: 'Vehicle Maintenance', key: 'VehicleMaintenance', icon: <WrenchSVG /> },
    { label: 'Fuel Management',     key: 'FuelManagement',     icon: <FuelSVG /> },
    { label: 'Check in Record',     key: 'CheckIn',            icon: <CheckInSVG /> },
];

const DEVICE_ITEMS = [
    { label: 'Device Management',  page: 'Device Management',  icon: <DeviceSVG /> },
    { label: 'Device Map & Video', page: 'Dashboard',          icon: <PinSVG /> },
    { label: 'Geofence',           page: 'Geofence',           icon: <PinSVG /> },
    { label: 'Notification',       page: 'Notification',       icon: <ReportSVG /> },
    { label: 'Calendars',          page: 'Calendars',          icon: <CheckInSVG /> },
    { label: 'Computed Attributes',page: 'Computed Attributes',icon: <DashSVG /> },
    { label: 'Maintenance',        page: 'Maintenance',        icon: <WrenchSVG /> },
    { label: 'Saved Commands',     page: 'Saved Commands',     icon: <ReportSVG /> },
    { label: 'Groups',             page: 'Groups',             icon: <FleetSVG /> },
    { label: 'Drivers',            page: 'Drivers',            icon: <PersonSVG /> },
];

export default function Sidebar({ page, setPage, onLogoutClick, open, onToggle, reportSection, setReportSection, fleetPage, setFleetPage }) {
    const [reportOpen,   setReportOpen]   = useState(false);
    const [deviceOpen,   setDeviceOpen]   = useState(false);
    const [fleetOpen,    setFleetOpen]    = useState(false);
    const [devStatOpen,  setDevStatOpen]  = useState(false);
    const [motStatOpen,  setMotStatOpen]  = useState(false);
    const [stateStatOpen,setStateStatOpen]= useState(false);
    const [alertOpen,    setAlertOpen]    = useState(false);

    const W = open ? EXPANDED_W : COLLAPSED_W;

    const navTo = (p) => { setPage(p); };
    const reportTo = (section) => { setReportSection(section); setPage('Report'); };

    const isReportActive = page === 'Report';
    const isDeviceActive = DEVICE_ITEMS.some(i => i.page === page);
    const isFleetActive  = page === 'Fleet';

    return (
        <aside style={{
            width: W, minWidth: W, background: S.bg, borderRight: `1px solid ${S.border}`,
            display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0, overflow: 'hidden',
            transition: `width 0.22s ease, min-width 0.22s ease`,
        }}>
            {/* Logo + hamburger */}
            <div style={{ height: 58, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${S.border}`, flexShrink: 0, paddingLeft: open ? 14 : 0, justifyContent: open ? 'flex-start' : 'center', gap: 10, overflow: 'hidden' }}>
                {open && (
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#14b8a6,#0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📡</div>
                )}
                {open && <span style={{ fontSize: 14, fontWeight: 800, color: S.text, whiteSpace: 'nowrap', flex: 1 }}>FleetTrack</span>}
                <button onClick={onToggle} title="Toggle sidebar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.secondary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 6, flexShrink: 0 }}>
                    <HamSVG />
                </button>
            </div>

            {/* Nav */}
            <nav style={{ flex: 1, padding: open ? '10px 8px' : '10px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
                {/* Report */}
                <NavItem icon={<ReportSVG />} label="Report" active={isReportActive}
                    open={open ? reportOpen : undefined}
                    onClick={() => { if (open) setReportOpen(o => !o); else { setPage('Report'); } }}
                    sidebarOpen={open} />

                {open && reportOpen && (
                    <div style={{ marginLeft: 4 }}>
                        <SubGroup label="Device Statistics" openKey={devStatOpen} onToggle={() => setDevStatOpen(o => !o)}
                            items={REPORT_DEVICE} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        <SubGroup label="Motion Statistics" openKey={motStatOpen} onToggle={() => setMotStatOpen(o => !o)}
                            items={REPORT_MOTION} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        <SubGroup label="State Statistics" openKey={stateStatOpen} onToggle={() => setStateStatOpen(o => !o)}
                            items={['Offline', 'Online']} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />

                        <SubGroup label="Alert Statistics" openKey={alertOpen} onToggle={() => setAlertOpen(o => !o)}
                            items={REPORT_ALERT} activePage={isReportActive ? reportSection : null}
                            onItemClick={reportTo} sidebarOpen={open} />
                    </div>
                )}

                {/* Device */}
                <NavItem icon={<DeviceSVG />} label="Device" active={isDeviceActive && !isReportActive}
                    open={open ? deviceOpen : undefined}
                    onClick={() => { if (open) setDeviceOpen(o => !o); else navTo('Dashboard'); }}
                    sidebarOpen={open} />

                {open && deviceOpen && (
                    <div style={{ marginLeft: 4 }}>
                        {DEVICE_ITEMS.map(({ label, page: target, icon }) => (
                            <NavItem key={label} icon={icon} label={label} depth={1} sidebarOpen={open}
                                active={page === target && !isReportActive}
                                onClick={() => navTo(target)} />
                        ))}
                    </div>
                )}

                {/* Fleet */}
                <NavItem icon={<FleetSVG />} label="Fleet" active={isFleetActive}
                    open={open ? fleetOpen : undefined}
                    onClick={() => { if (open) setFleetOpen(o => !o); else { navTo('Fleet'); } }}
                    sidebarOpen={open} />

                {open && fleetOpen && (
                    <div style={{ marginLeft: 4 }}>
                        {FLEET_ITEMS.map(({ label, key, icon }) => (
                            <NavItem key={key} icon={icon} label={label} depth={1} sidebarOpen={open}
                                active={isFleetActive && fleetPage === key}
                                onClick={() => { navTo('Fleet'); setFleetPage(key); }} />
                        ))}
                    </div>
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
