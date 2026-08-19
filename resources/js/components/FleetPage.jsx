import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import MapCanvas, { MARKER_COLORS } from './MapCanvas.jsx';
import { VEHICLE_TYPES, FUEL_TYPES, vehicleTypeEmoji } from '../vehicleCatalog.js';
import ReportPage from './ReportPage.jsx';
import GeofenceManagementPage from './GeofencePage.jsx';
import DeviceStatusIcons, { alarmLabel } from './DeviceStatusIcons.jsx';
import useTraccarSocket from '../useTraccarSocket.js';
import { FuelLevelReport, FuelEventsReport, FuelTheftWatch } from './FuelReports.jsx';
import FuelThresholdsPage from './FuelThresholdsPage.jsx';

/* ── icons ───────────────────────────────────────────────────── */
const SearchSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/>
    </svg>
);

/* ── shared style primitives (match ReportPage) ─────────────── */
const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#cfdcf0', borderBottom: '2px solid #1e2c46', whiteSpace: 'nowrap', background: '#16233c' };
const TD = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #1e2c46', color: '#cfdcf0' };

/* ── shared sub-components (match ReportPage style) ─────────── */
function FilterBar({ children }) {
    return (
        <div style={{ background: '#16233c', border: '1px solid #1e2c46', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            {children}
        </div>
    );
}
function FInput({ label, placeholder, type = 'text', style, value, onChange }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {label && <label style={{ fontSize: 12, color: '#9daec9', fontWeight: 600 }}>{label}</label>}
            <input type={type} placeholder={placeholder} value={value} onChange={onChange} style={{ padding: '7px 10px', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, outline: 'none', ...style }} />
        </div>
    );
}
function SearchBtn() {
    return (
        <button style={{ padding: '7px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SearchSVG />Search
        </button>
    );
}
function Btn({ children, primary, red, onClick }) {
    return (
        <button onClick={onClick} style={{ padding: '7px 16px', borderRadius: 6, border: primary ? 'none' : red ? '1px solid #ef4444' : '1px solid #24344f', background: primary ? '#3b82f6' : '#111c33', color: primary ? '#fff' : red ? '#ef4444' : '#cfdcf0', fontSize: 13, cursor: 'pointer', fontWeight: primary ? 600 : 400, whiteSpace: 'nowrap' }}>
            {children}
        </button>
    );
}
function ActionRow({ left }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>{left}</div>
        </div>
    );
}
function TabBar({ tabs, active, onChange }) {
    return (
        <div style={{ display: 'flex', borderBottom: '2px solid #1e2c46', marginBottom: 16 }}>
            {tabs.map(t => (
                <button key={t} onClick={() => onChange(t)} style={{ padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active === t ? 700 : 500, color: active === t ? '#3b82f6' : '#9daec9', borderBottom: active === t ? '2.5px solid #3b82f6' : '2.5px solid transparent', marginBottom: -2 }}>
                    {t}
                </button>
            ))}
        </div>
    );
}
function EmptyTable({ cols, rows }) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{cols.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {rows && rows.length ? rows.map((r, i) => (
                        <tr key={i}>{r.map((cell, j) => <td key={j} style={TD}>{cell}</td>)}</tr>
                    )) : (
                        <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5e7094' }}>No data</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
/* `title` is still accepted and still documents which page a block belongs to at the call site,
   but it is no longer drawn: the app header names the page, and printing it again directly beneath
   was the same words twice. */
function PageShell({ children }) {
    return (
        <div style={{ flex: 1, overflowY: 'auto', background: '#111c33', padding: '16px 24px' }}>
            {children}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  Fleet Dashboard (operations cockpit)                          */
/* ══════════════════════════════════════════════════════════════ */

/* Cards for the "Operational Modules" panel. `key` matches PAGE_MAP so a card navigates. */
const OPERATIONAL_MODULES = [
    { key: 'VehicleTrack',       code: 'MOD-01', name: 'Vehicle Track',            color: '#4da8ff', description: 'Real-time location, route replay, geofence and online status.' },
    { key: 'Driver',             code: 'MOD-02', name: 'Driver Management',        color: '#43d4d4', description: 'Roster, licensing, assignments and driver identity.' },
    { key: 'FuelManagement',     code: 'MOD-03', name: 'Fuel Management',          color: '#f2a93b', description: 'Fuel levels, prices, consumption and abnormal-loss review.' },
    { key: 'VehicleMaintenance', code: 'MOD-04', name: 'Inspection & Maintenance', color: '#3fc07a', description: 'Maintenance schedules, service history and due items.' },
];

const DAY_MS = 86400000;

/** Merge a Traccar websocket {"positions":[…]} frame into cockpit devices. */
function applyCockpitPositions(devices, positions) {
    const byDeviceId = {};
    for (const p of positions) byDeviceId[p.deviceId] = p;

    return devices.map(d => {
        const p = byDeviceId[d.id];
        if (!p) return d;
        return {
            ...d,
            lat:      p.latitude,
            lng:      p.longitude,
            ignition: p.attributes?.ignition ?? null,
            alarm:    p.attributes?.alarm ?? null,
            battery:  p.attributes?.batteryLevel ?? null,
            charging: p.attributes?.charge ?? null,
            // The detail rail reads raw attributes off this, so it has to travel with the rest.
            position: p,
        };
    });
}

/** Merge a Traccar websocket {"devices":[…]} frame (online/offline, renames). */
function applyCockpitDevices(devices, updates) {
    const byId = {};
    for (const u of updates) byId[u.id] = u;

    return devices.map(d => {
        const u = byId[d.id];
        if (!u) return d;
        return {
            ...d,
            name:    u.name,
            imei:    u.uniqueId,
            tracker: u.model || u.uniqueId,
            status:  u.status === 'online' ? 'ONLINE' : 'OFFLINE',
        };
    });
}

/* A Traccar device plus its latest position, in the shape MapCanvas expects. The raw position
   is kept so the detail rail can read attributes (satellites, rssi, ignition) without refetching. */
function toMapDevice(device, position) {
    return {
        id:       device.id,
        name:     device.name,
        imei:     device.uniqueId,
        tracker:  device.model || device.uniqueId,
        status:   device.status === 'online' ? 'ONLINE' : 'OFFLINE',
        lat:      position ? position.latitude  : null,
        lng:      position ? position.longitude : null,
        // Same three the map label draws as icons (see DeviceStatusIcons).
        ignition: position?.attributes?.ignition ?? null,
        alarm:    position?.attributes?.alarm ?? null,
        battery:  position?.attributes?.batteryLevel ?? null,
        charging: position?.attributes?.charge ?? null,
        position: position || null,
    };
}

/* 9.437981 -> 9°26'16.73"S — the format the operations view shows for coordinates. */
function toDms(value, axis) {
    if (value == null) return '—';
    const hemisphere = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    const abs     = Math.abs(value);
    const degrees = Math.floor(abs);
    const rawMin  = (abs - degrees) * 60;
    const minutes = Math.floor(rawMin);
    const seconds = ((rawMin - minutes) * 60).toFixed(2);
    return `${degrees}°${String(minutes).padStart(2, '0')}'${seconds}"${hemisphere}`;
}

/* Traccar reports GSM rssi on a 0-31 scale for most protocols. */
function signalLabel(rssi) {
    if (rssi == null) return null;
    if (rssi >= 20) return 'Strong';
    if (rssi >= 10) return 'Fair';
    return 'Weak';
}

function relativeAge(iso) {
    if (!iso) return '—';
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (!Number.isFinite(minutes) || minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function DetailRow({ label, value }) {
    return (
        <div className="mine-detail-row">
            <dt>{label}</dt>
            <dd>{value ?? '—'}</dd>
        </div>
    );
}

/* Right-hand rail describing the selected device, from its latest Traccar position. */
function DeviceDetailRail({ device, onClose }) {
    const [asDms, setAsDms] = useState(true);

    const position   = device.position;
    const attributes = position?.attributes ?? {};
    const online     = device.status === 'ONLINE';
    const ignition   = attributes.ignition;
    const strength   = signalLabel(attributes.rssi);
    const lastFix    = position?.fixTime || position?.deviceTime || position?.serverTime || null;

    return (
        <aside className="mine-detail-rail">
            <div className="mine-detail-head">
                <div className="mine-detail-title">
                    <div style={{ minWidth: 0 }}>
                        <h4>{device.name}</h4>
                        <span className="mine-device-imei">{device.imei}</span>
                    </div>
                    <button className="mine-detail-close" onClick={onClose} title="Close">✕</button>
                </div>
                <div className="mine-detail-row" style={{ borderTop: 'none' }}>
                    <dt>
                        <span className="mine-device-state" style={{ color: online ? MARKER_COLORS.online.fill : MARKER_COLORS.offline.fill }}>
                            <i />{online ? 'Online' : 'Offline'}
                        </span>
                        {ignition !== undefined && (
                            <span style={{ marginLeft: 7, color: 'var(--mine-muted)', fontSize: 11.5 }}>
                                (ACC: {ignition ? 'ON' : 'OFF'})
                            </span>
                        )}
                    </dt>
                    <dd>{relativeAge(lastFix)}</dd>
                </div>
            </div>

            <div className="mine-detail-card">
                <h5>Address</h5>
                <p className="mine-detail-body" style={{ margin: 0 }}>
                    {position?.address || 'No address resolved for the latest position.'}
                </p>
            </div>

            <div className="mine-detail-card">
                <h5>Coordinates</h5>
                <div className="mine-detail-row" style={{ paddingTop: 0 }}>
                    <dt>Unit switching</dt>
                    <dd>
                        <span className="mine-unit-switch">
                            <button
                                type="button"
                                aria-pressed={asDms}
                                aria-label="Toggle degrees-minutes-seconds"
                                onClick={() => setAsDms(v => !v)}
                            />
                        </span>
                    </dd>
                </div>
                <p className="mine-detail-mono" style={{ margin: '6px 0 0' }}>
                    {device.lat == null || device.lng == null
                        ? 'No position reported.'
                        : asDms
                            ? `${toDms(device.lat, 'lat')}, ${toDms(device.lng, 'lng')}`
                            : `${device.lat.toFixed(6)}, ${device.lng.toFixed(6)}`}
                </p>
            </div>

            <div className="mine-detail-card">
                <h5>Device</h5>
                <dl style={{ margin: 0 }}>
                    <DetailRow label="GNSS"                     value={position?.protocol ? 'GPS' : null} />
                    <DetailRow label="Visible satellites"       value={attributes.sat ?? null} />
                    <DetailRow label="Cellular signal strength" value={strength} />
                    <DetailRow label="Speed"                    value={position?.speed != null ? `${(position.speed * 1.852).toFixed(1)} km/h` : null} />
                    <DetailRow label="Last online"              value={lastFix ? new Date(lastFix).toLocaleString() : null} />
                </dl>
            </div>
        </aside>
    );
}

function FleetDashboard({ setFleetPage }) {
    const [devices,     setDevices]     = useState([]);
    const [driverCount, setDriverCount] = useState(0);
    const [distanceKm,  setDistanceKm]  = useState(0);
    const [alertCount,  setAlertCount]  = useState(0);
    const [selected,    setSelected]    = useState(null);
    const [search,      setSearch]      = useState('');
    const [loading,     setLoading]     = useState(true);
    const [connected,   setConnected]   = useState(false);

    /**
     * Live updates, straight off Traccar's websocket.
     *
     * Without this the cockpit was a snapshot taken once on mount — correct at the moment the page
     * opened and frozen from then on, which is why it appeared to need a manual refresh. Positions
     * and online/offline now arrive as the devices report them; the KPI tiles below are built from
     * Traccar's report endpoints and stay on their own load, since a mileage report per position
     * push would be an enormous amount of work for a number that moves by metres.
     */
    useTraccarSocket((frame) => {
        if (frame.positions) setDevices(ds => applyCockpitPositions(ds, frame.positions));
        if (frame.devices)   setDevices(ds => applyCockpitDevices(ds, frame.devices));
    }, setConnected);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const now      = new Date();
            const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
            const weekAgo  = new Date(now.getTime() - 7 * DAY_MS);

            // Each tile degrades on its own: one failing Traccar report shouldn't blank the
            // whole cockpit, so every call resolves to null rather than rejecting the batch.
            const [deviceRes, positionRes, driverRes, mileageRes, eventRes] = await Promise.all([
                api.getTraccarDevices().catch(() => null),
                api.getLatestPositions().catch(() => null),
                api.getFleetDrivers().catch(() => null),
                api.getMileageReport({ from: midnight.toISOString(), to: now.toISOString() }).catch(() => null),
                api.getAlertEvents({ from: weekAgo.toISOString(), to: now.toISOString() }).catch(() => null),
            ]);
            if (cancelled) return;

            const deviceList = Array.isArray(deviceRes?.data)   ? deviceRes.data   : [];
            const positions  = Array.isArray(positionRes?.data) ? positionRes.data : [];
            const byDeviceId = {};
            for (const p of positions) byDeviceId[p.deviceId] = p;

            setDevices(deviceList.map(d => toMapDevice(d, byDeviceId[d.id])));
            setDriverCount(Array.isArray(driverRes?.data) ? driverRes.data.length : 0);
            setDistanceKm(
                Array.isArray(mileageRes?.data)
                    ? mileageRes.data.reduce((sum, row) => sum + (row.mileageKm || 0), 0)
                    : 0
            );
            setAlertCount(Array.isArray(eventRes?.data) ? eventRes.data.length : 0);

            setLoading(false);
        })();

        return () => { cancelled = true; };
    }, []);

    const onlineCount = devices.filter(d => d.status === 'ONLINE').length;
    const onlineRate  = devices.length ? (onlineCount / devices.length) * 100 : 0;

    const query    = search.trim().toLowerCase();
    const listed   = query
        ? devices.filter(d => d.name.toLowerCase().includes(query) || (d.imei || '').toLowerCase().includes(query))
        : devices;
    // Selecting a device flies the map to it (MapCanvas -> FlyToSelected).
    const selectedDevice = devices.find(d => d.id === selected) || null;

    const kpis = [
        { label: 'Tracked Vehicles',   value: devices.length,                note: 'Active fleet',                   color: '#4da8ff' },
        { label: 'Online Rate',        value: `${onlineRate.toFixed(1)}%`,   note: `${onlineCount} vehicles online`, color: '#3fc07a' },
        { label: 'Distance Today',     value: `${distanceKm.toFixed(1)} km`, note: 'Fleet-wide mileage',             color: '#f2a93b' },
        { label: 'Alerts · 7 Days',    value: alertCount,                    note: 'Requires attention',             color: '#ff5c5c' },
        { label: 'Registered Drivers', value: driverCount,                   note: 'Driver registry',                color: '#b98af0' },
    ];

    if (loading) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060a14', color: '#5e7094', fontSize: 13 }}>
                Loading dashboard…
            </div>
        );
    }

    return (
        <div className="mine-cockpit-canvas">
            <section className="mine-kpi-grid" aria-label="Fleet operations KPIs">
                {kpis.map(k => (
                    <article key={k.label} className="mine-kpi-tile" style={{ '--mine-kpi-color': k.color }}>
                        <div className="mine-kpi-label"><i />{k.label}</div>
                        <div className="mine-kpi-value">{k.value}</div>
                        <div className="mine-kpi-note">{k.note}</div>
                    </article>
                ))}
            </section>

            <section className="mine-panel">
                <div className="mine-map-bar">
                    <span className="mine-map-bar-title">Live Operations</span>
                    <div className="mine-legend">
                        {/* Says whether the feed is actually live. A map that has quietly stopped
                            updating looks identical to a fleet that has stopped moving. */}
                        <span title={connected ? 'Receiving live updates from Traccar' : 'Reconnecting to Traccar'}>
                            <i style={{ background: connected ? '#3fc07a' : '#f2a93b', color: connected ? '#3fc07a' : '#f2a93b' }} />
                            {connected ? 'Live' : 'Reconnecting…'}
                        </span>
                        <span><i style={{ background: MARKER_COLORS.online.fill,   color: MARKER_COLORS.online.fill }} />Online</span>
                        <span><i style={{ background: MARKER_COLORS.offline.fill,  color: MARKER_COLORS.offline.fill }} />Offline</span>
                        <span><i style={{ background: MARKER_COLORS.selected.fill, color: MARKER_COLORS.selected.fill }} />Selected</span>
                    </div>
                </div>
                <div className="mine-live-map-frame">
                    <div className="mine-map-layout">
                        {/* Device rail */}
                        <div className="mine-device-rail">
                            <div className="mine-rail-head">
                                <span>Devices</span>
                                <span>{onlineCount}/{devices.length}</span>
                            </div>
                            <div className="mine-rail-search">
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search device…"
                                />
                            </div>
                            <div className="mine-device-scroll">
                                {listed.length === 0 ? (
                                    <p className="mine-rail-empty">No devices found.</p>
                                ) : listed.map(d => {
                                    const isSelected = d.id === selected;
                                    const color = isSelected
                                        ? MARKER_COLORS.selected.fill
                                        : d.status === 'ONLINE' ? MARKER_COLORS.online.fill : MARKER_COLORS.offline.fill;
                                    return (
                                        <button
                                            key={d.id}
                                            className={`mine-device-item${isSelected ? ' is-selected' : ''}`}
                                            onClick={() => setSelected(isSelected ? null : d.id)}
                                        >
                                            <span className="mine-device-head">
                                                <span className="mine-device-name">{d.name}</span>
                                                <span className="mine-device-icons">
                                                    <DeviceStatusIcons device={d} size={14} />
                                                </span>
                                            </span>
                                            <span className="mine-device-imei">{d.imei}</span>
                                            <span className="mine-device-state" style={{ color }}>
                                                <i />{isSelected ? 'Selected' : d.status === 'ONLINE' ? 'Online' : 'Offline'}
                                            </span>
                                            {alarmLabel(d.alarm) && (
                                                <span className="mine-device-alarm">{alarmLabel(d.alarm)}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mine-map-stage">
                            <MapCanvas
                                devices={devices}
                                selected={selected}
                                onSelect={setSelected}
                                selectedDevice={selectedDevice}
                            />
                        </div>

                        {/* Detail rail — only once a device is picked */}
                        {selectedDevice && (
                            <DeviceDetailRail device={selectedDevice} onClose={() => setSelected(null)} />
                        )}
                    </div>
                </div>
            </section>

            <section className="mine-panel">
                <header className="mine-panel-header">
                    <div>
                        <h3>Operational Modules</h3>
                        <p>Core fleet workflows connected to the live operations view.</p>
                    </div>
                </header>
                <div className="mine-module-grid">
                    {OPERATIONAL_MODULES.map(m => (
                        <button
                            key={m.key}
                            className="mine-module-card"
                            style={{ '--mine-module-color': m.color }}
                            onClick={() => setFleetPage?.(m.key)}
                        >
                            <span className="mine-module-code">{m.code}</span>
                            <span className="mine-module-name">{m.name}</span>
                            <span className="mine-module-description">{m.description}</span>
                            <span className="mine-module-link">Open module <b>→</b></span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

/* Driver */
const DEFAULT_NOTICE_DAYS = 14;

function daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(dateStr) - today) / 86400000);
}
function licenseStatus(dateStr) {
    if (!dateStr) return '—';
    return daysUntil(dateStr) < 0 ? 'Expired' : 'Valid';
}
function expiryReminder(dateStr, notifyDays) {
    if (!dateStr) return '—';
    const days = daysUntil(dateStr);
    if (days < 0) return 'Expired';
    if (days <= (notifyDays ?? DEFAULT_NOTICE_DAYS)) return 'Expiring soon';
    return 'Normal';
}
const REMINDER_COLOR = { Expired: '#ef4444', 'Expiring soon': '#f59e0b', Normal: '#16a34a', '—': '#9ca3af' };
const STATUS_COLOR    = { Expired: '#ef4444', Valid: '#16a34a', '—': '#9ca3af' };

function Badge({ text, color }) {
    return <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}1a`, padding: '2px 8px', borderRadius: 999 }}>{text}</span>;
}

const driverFieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const driverInputStyle = { padding: '7px 10px', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%' };
const driverLabelStyle = { fontSize: 11.5, color: '#9daec9', fontWeight: 600 };

function DriverFormModal({ driver, onClose, onSaved }) {
    const isNew = !driver;
    const [form, setForm] = useState({
        badge_no: driver?.badge_no || '',
        name: driver?.name || '',
        phone: driver?.phone || '',
        license_no: driver?.license_no || '',
        rfid_card_no: driver?.rfid_card_no || '',
        ibutton_no: driver?.ibutton_no || '',
        register_place: driver?.register_place || '',
        register_date: driver?.register_date ? driver.register_date.slice(0, 10) : '',
        license_expiry: driver?.license_expiry ? driver.license_expiry.slice(0, 10) : '',
        notify_days_before: driver?.notify_days_before ?? '',
        status: driver?.status || 'Active',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    const handleSave = async () => {
        if (!form.badge_no.trim() || !form.name.trim()) { setError('Driver No. and Driver Name are required.'); return; }
        setSaving(true);
        setError('');
        const payload = { ...form, notify_days_before: form.notify_days_before === '' ? null : Number(form.notify_days_before) };
        try {
            if (isNew) {
                await api.createFleetDriver(payload);
            } else {
                await api.updateFleetDriver(driver.id, payload);
            }
            onSaved();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to save driver.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#111c33', borderRadius: 12, width: 480, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2c46' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>{isNew ? 'New Driver' : 'Edit Driver'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {error && <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>{error}</div>}

                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Driver No. *</label>
                        <input value={form.badge_no} onChange={set('badge_no')} disabled={!isNew} style={{ ...driverInputStyle, background: isNew ? '#111c33' : '#16233c' }} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Driver Name *</label>
                        <input value={form.name} onChange={set('name')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Phone</label>
                        <input value={form.phone} onChange={set('phone')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>License No.</label>
                        <input value={form.license_no} onChange={set('license_no')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>RFID Card No.</label>
                        <input value={form.rfid_card_no} onChange={set('rfid_card_no')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>iButton No.</label>
                        <input value={form.ibutton_no} onChange={set('ibutton_no')} placeholder="Card number on the iButton fob" style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Register Place</label>
                        <input value={form.register_place} onChange={set('register_place')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Register Date</label>
                        <input type="date" value={form.register_date} onChange={set('register_date')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Status</label>
                        <select value={form.status} onChange={set('status')} style={{ ...driverInputStyle, background: '#111c33', cursor: 'pointer' }}>
                            <option>Active</option>
                            <option>Inactive</option>
                        </select>
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>License Expiry</label>
                        <input type="date" value={form.license_expiry} onChange={set('license_expiry')} style={driverInputStyle} />
                    </div>
                    <div style={{ ...driverFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={driverLabelStyle}>Notify before expiry (days)</label>
                        <input type="number" min="1" max="365" placeholder={`Default ${DEFAULT_NOTICE_DAYS}`} value={form.notify_days_before} onChange={set('notify_days_before')} style={{ ...driverInputStyle, maxWidth: 200 }} />
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #1e2c46', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Turprotrack-local driver registry (Approach 2): GET/POST/PUT/DELETE /api/drivers, which keeps a
// matching Traccar driver in sync server-side (DriverController) so the device<->driver link still
// works through Traccar elsewhere in the app. License/Safety Sticker status badges are computed
// from each driver's expiry dates; the same dates drive the "drivers:notify-expirations" scheduled
// email reminder on the backend.
/* ── Face enrolment ──────────────────────────────────────────────
   The face database lives on the JC171 device; nothing biometric is stored here. Every action
   below relays an EVENTSET command through Traccar and returns as soon as Traccar accepts it —
   the device reports the real outcome later on the /img/uploads/face/* webhooks. */

const FACE_STATUS_COLOR = { enrolled: '#16a34a', pending: '#f59e0b', failed: '#ef4444', deleted: '#9ca3af' };

function facePhotoUrl(face) {
    return face?.photo_url || null;
}

/* Live camera capture. The stream is stopped on unmount so the webcam light does not stay on. */
function CameraCaptureModal({ driver, onClose, onCaptured }) {
    const videoRef  = useRef(null);
    const streamRef = useRef(null);
    const [error, setError]   = useState('');
    const [busy, setBusy]     = useState(false);

    useEffect(() => {
        let cancelled = false;
        navigator.mediaDevices?.getUserMedia({ video: { width: 640, height: 480 } })
            .then(stream => {
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) videoRef.current.srcObject = stream;
            })
            .catch(e => !cancelled && setError(e.message || 'Could not open the camera.'));

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, []);

    const takePhoto = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) { setError('Camera is not ready yet.'); return; }

        const canvas = document.createElement('canvas');
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        setBusy(true);
        canvas.toBlob(blob => {
            if (!blob) { setBusy(false); setError('Could not capture the frame.'); return; }
            onCaptured(new File([blob], `${driver.badge_no}-face.jpg`, { type: 'image/jpeg' }))
                .finally(() => setBusy(false));
        }, 'image/jpeg', 0.92);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
            <div style={{ background: '#111c33', borderRadius: 12, width: 560, maxWidth: '92vw', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2c46' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>Face Enrollment — {driver.name}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ padding: 20 }}>
                    {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>{error}</div>}
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8, background: '#0f172a', aspectRatio: '4 / 3', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '12px 20px', borderTop: '1px solid #1e2c46', display: 'flex', gap: 8 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={takePhoto} disabled={busy} style={{ flex: 1, padding: 10, borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
                        {busy ? 'Saving…' : 'Take Photo'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function FaceEnrollmentModal({ driver, devices, faces, onClose, onChanged }) {
    const driverFaces = faces.filter(f => f.driver_id === driver.id);
    const [imei, setImei] = useState(driverFaces[0]?.imei || devices[0]?.uniqueId || '');
    const [busy, setBusy]       = useState('');
    const [message, setMessage] = useState(null);
    const [camera, setCamera]   = useState(false);
    const fileRef = useRef(null);

    const face = driverFaces.find(f => f.imei === imei) || null;

    // Every action reports what the device layer actually said rather than a generic "done" —
    // an accepted command is not a completed enrolment.
    const run = async (key, fn) => {
        setBusy(key);
        setMessage(null);
        try {
            const res = await fn();
            const cmd = res?.data?.command ?? res?.data;
            setMessage({
                ok: cmd?.ok !== false,
                text: cmd?.message || 'Command accepted.',
                detail: cmd?.command || null,
            });
            await onChanged();
        } catch (e) {
            setMessage({ ok: false, text: e.response?.data?.message || 'Request failed.' });
        } finally {
            setBusy('');
        }
    };

    const savePhoto = async (file) => {
        const form = new FormData();
        form.append('driver_id', driver.id);
        form.append('imei', imei || '');
        form.append('photo', file);
        await run('capture', () => api.captureFace(form));
        setCamera(false);
    };

    const Action = ({ label, onClick, variant, actionKey }) => {
        const styles = {
            primary: { background: '#3b82f6', color: '#fff', border: 'none' },
            outline: { background: '#111c33', color: '#7fc4ff', border: '1.5px solid #24507f' },
            plain:   { background: '#111c33', color: '#cfdcf0', border: '1.5px solid #1e2c46' },
            danger:  { background: '#111c33', color: '#ef4444', border: '1.5px solid #7f1d1d' },
        }[variant || 'plain'];
        const disabled = !!busy || (!imei && actionKey !== 'capture');
        return (
            <button onClick={onClick} disabled={disabled} style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, marginBottom: 8, ...styles,
            }}>
                {busy === actionKey ? 'Working…' : label}
            </button>
        );
    };

    return (
        <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}>
                <div style={{ background: '#111c33', borderRadius: 12, width: 460, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2c46' }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>Face Enrollment — {driver.name}</h2>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 16 }}>✕</button>
                    </div>

                    <div style={{ padding: 20 }}>
                        <div style={{ ...driverFieldStyle, marginBottom: 12 }}>
                            <label style={driverLabelStyle}>Vehicle (IMEI)</label>
                            <select value={imei} onChange={e => setImei(e.target.value)} style={{ ...driverInputStyle, background: '#111c33', cursor: 'pointer' }}>
                                <option value="">Select device…</option>
                                {devices.map(d => <option key={d.id} value={d.uniqueId}>{d.uniqueId} — {d.name}</option>)}
                            </select>
                        </div>

                        <div style={{ padding: '9px 12px', background: '#16233c', border: '1px solid #1e2c46', borderRadius: 7, fontSize: 12.5, marginBottom: 12 }}>
                            Status: <strong style={{ color: FACE_STATUS_COLOR[face?.status] || '#5e7094' }}>{face?.status || 'not enrolled'}</strong>
                        </div>

                        {face?.status === 'enrolled' && (
                            <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: '#0f2b24', border: '1px solid #1f6b52', borderRadius: 7, fontSize: 12, color: '#4ade80', marginBottom: 12 }}>
                                {facePhotoUrl(face) && <img src={facePhotoUrl(face)} alt="" style={{ width: 44, height: 44, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />}
                                <span>
                                    ✓ Already enrolled{face.enrolled_at ? ` on ${new Date(face.enrolled_at).toLocaleString()}` : ''}.
                                    Re-enrolling will replace the current face data on the device.
                                </span>
                            </div>
                        )}

                        {face?.error && (
                            <div style={{ padding: '9px 12px', background: '#33260c', border: '1px solid #7c5e10', borderRadius: 7, fontSize: 12, color: '#fcd34d', marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                                Device reported: {face.error}
                            </div>
                        )}

                        {message && (
                            <div style={{
                                padding: '9px 12px', borderRadius: 7, fontSize: 12, marginBottom: 12,
                                background: message.ok ? '#152a4a' : '#3b1418',
                                border: `1px solid ${message.ok ? '#24507f' : '#7f1d1d'}`,
                                color: message.ok ? '#7fc4ff' : '#fca5a5',
                            }}>
                                {message.text}
                                {message.detail && <div style={{ marginTop: 4, fontFamily: 'ui-monospace,Menlo,Consolas,monospace', fontSize: 11, opacity: 0.8 }}>{message.detail}</div>}
                            </div>
                        )}

                        <Action label={face?.status === 'enrolled' ? 'Re-enroll Face (Device Camera)' : 'Enroll Face (Device Camera)'}
                            variant="primary" actionKey="enroll"
                            onClick={() => run('enroll', () => api.enrollFace(driver.id, imei))} />

                        <Action label="Enroll Face (Laptop Camera)" variant="outline" actionKey="capture"
                            onClick={() => { setMessage(null); setCamera(true); }} />

                        <Action label="Upload Photo (From File)" variant="outline" actionKey="file"
                            onClick={() => fileRef.current?.click()} />

                        <Action label="Refresh Photo From Device" actionKey="fetch"
                            onClick={() => run('fetch', () => api.fetchFacePhoto(driver.id, imei))} />

                        <Action label="Test Recognition Now" actionKey="test"
                            onClick={() => run('test', () => api.testFaceRecognition(imei))} />

                        <Action label="Delete Enrolled Face" variant="danger" actionKey="delete"
                            onClick={() => run('delete', () => api.deleteFace(driver.id, imei))} />

                        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) savePhoto(f); }} />
                    </div>
                </div>
            </div>

            {camera && (
                <CameraCaptureModal driver={driver} onClose={() => setCamera(false)} onCaptured={savePhoto} />
            )}
        </>
    );
}

/* "Face Photos" tab — pick up to five drivers with a photo on file and push them to one device
   as a zipped EVENTSET,FACE,DOWN batch. */
const MAX_FACE_BATCH = 5;

function FacePhotosTab({ drivers, devices, faces, onChanged }) {
    const [imei, setImei]         = useState('');
    const [picked, setPicked]     = useState([]);
    const [busy, setBusy]         = useState(false);
    const [message, setMessage]   = useState(null);

    // One card per driver that actually has a photo — a batch of drivers without photos would
    // just be rejected server-side.
    const cards = drivers
        .map(d => ({ driver: d, face: faces.find(f => f.driver_id === d.id && f.photo_url) }))
        .filter(c => c.face);

    const toggle = (id) => setPicked(p =>
        p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX_FACE_BATCH ? p : [...p, id]
    );

    const push = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const res = await api.downloadFaceBatch(imei, picked);
            const cmd = res.data?.command;
            setMessage({ ok: cmd?.ok !== false, text: cmd?.message || 'Batch sent.', url: res.data?.zip_url });
            setPicked([]);
            await onChanged();
        } catch (e) {
            setMessage({ ok: false, text: e.response?.data?.message || 'Failed to push the batch.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#9daec9', lineHeight: 1.6 }}>
                Select up to {MAX_FACE_BATCH} drivers with a photo already on file, choose a target device, and push them
                as a batch via EVENTSET,FACE,DOWN. Verify the import on-device afterward with Test Recognition / FACE,CHECK.
            </p>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <div style={driverFieldStyle}>
                    <label style={driverLabelStyle}>Target Device</label>
                    <select value={imei} onChange={e => setImei(e.target.value)} style={{ ...driverInputStyle, background: '#111c33', cursor: 'pointer', width: 240 }}>
                        <option value="">Select device…</option>
                        {devices.map(d => <option key={d.id} value={d.uniqueId}>{d.uniqueId} — {d.name}</option>)}
                    </select>
                </div>
                <button onClick={push} disabled={!imei || picked.length === 0 || busy} style={{
                    padding: '8px 16px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: (!imei || !picked.length || busy) ? 'not-allowed' : 'pointer',
                    opacity: (!imei || !picked.length || busy) ? 0.55 : 1,
                }}>
                    {busy ? 'Pushing…' : `Zip & Push to Device (${picked.length}/${MAX_FACE_BATCH})`}
                </button>
            </div>

            {message && (
                <div style={{
                    marginBottom: 14, padding: '9px 12px', borderRadius: 7, fontSize: 12,
                    background: message.ok ? '#152a4a' : '#3b1418',
                    border: `1px solid ${message.ok ? '#24507f' : '#7f1d1d'}`,
                    color: message.ok ? '#7fc4ff' : '#fca5a5',
                }}>
                    {message.text}
                    {message.url && <div style={{ marginTop: 4, fontFamily: 'ui-monospace,Menlo,Consolas,monospace', fontSize: 11, wordBreak: 'break-all' }}>{message.url}</div>}
                </div>
            )}

            {cards.length === 0 ? (
                <p style={{ padding: 40, textAlign: 'center', color: '#5e7094', fontSize: 13 }}>
                    No driver photos on file yet. Use a driver's <strong>Face</strong> action to capture one.
                </p>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                    {cards.map(({ driver, face }) => {
                        const isPicked = picked.includes(driver.id);
                        return (
                            <button key={driver.id} onClick={() => toggle(driver.id)} style={{
                                padding: 8, borderRadius: 9, cursor: 'pointer', textAlign: 'center', background: '#111c33',
                                border: `2px solid ${isPicked ? '#3b82f6' : '#1e2c46'}`,
                            }}>
                                <div style={{ position: 'relative' }}>
                                    <input type="checkbox" checked={isPicked} readOnly style={{ position: 'absolute', top: 6, left: 6, accentColor: '#3b82f6' }} />
                                    <img src={face.photo_url} alt={driver.name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, background: '#16233c' }} />
                                </div>
                                <div style={{ marginTop: 7, fontSize: 12.5, fontWeight: 700, color: '#eaeff9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driver.name}</div>
                                <div style={{ fontSize: 11, color: '#5e7094' }}>{driver.badge_no}</div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ── KPI tiles ───────────────────────────────────────────────── */
function DriverKpi({ label, value, note, color }) {
    return (
        <div style={{ flex: 1, minWidth: 180, background: '#111c33', border: '1px solid #1e2c46', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 12.5, color: '#9daec9', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: color || '#eaeff9', lineHeight: 1.1 }}>{value}</div>
            {note && <div style={{ marginTop: 4, fontSize: 11.5, color: '#5e7094' }}>{note}</div>}
        </div>
    );
}

function DriverPage() {
    const [drivers, setDrivers] = useState([]);
    const [devices, setDevices] = useState([]);
    const [faces, setFaces]     = useState([]);
    const [tab, setTab]         = useState('Driver information');
    const [search, setSearch]   = useState('');
    const [place, setPlace]     = useState('');
    const [expiredOnly, setExpiredOnly] = useState(false);
    const [editing, setEditing] = useState(null);
    const [facing, setFacing]   = useState(null);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');

    const fetchDrivers = async () => {
        setLoading(true);
        try {
            const res = await api.getFleetDrivers();
            setDrivers(res.data);
        } catch (e) {
            setError('Failed to load drivers.');
        } finally {
            setLoading(false);
        }
    };

    const fetchFaces = async () => {
        try {
            const res = await api.getDriverFaces();
            setFaces(Array.isArray(res.data) ? res.data : []);
        } catch (e) { /* face state is supplementary — the roster still lists without it */ }
    };

    useEffect(() => {
        fetchDrivers();
        fetchFaces();
        api.getTraccarDevices().then(r => setDevices(r.data || [])).catch(() => {});
    }, []);

    const reset = () => { setSearch(''); setPlace(''); setExpiredOnly(false); };

    const filtered = drivers.filter(d => {
        if (search && !(d.badge_no.toLowerCase().includes(search.toLowerCase()) || d.name.toLowerCase().includes(search.toLowerCase()))) return false;
        if (place && !(d.register_place || '').toLowerCase().includes(place.toLowerCase())) return false;
        if (expiredOnly && licenseStatus(d.license_expiry) !== 'Expired') return false;
        return true;
    });

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteFleetDriver(id);
            await fetchDrivers();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to delete driver.');
        }
    };

    // "Authorized to drive" means the device will recognise them: an enrolled face on any device.
    const enrolledIds = new Set(faces.filter(f => f.status === 'enrolled').map(f => f.driver_id));
    const authorized  = drivers.filter(d => enrolledIds.has(d.id)).length;
    const total       = drivers.length;
    const pct         = (n) => (total ? `${Math.round((n / total) * 100)}%` : '—');
    const expiringSoon = drivers.filter(d => {
        const days = daysUntil(d.license_expiry);
        return days !== null && days >= 0 && days <= 30;
    }).length;

    const COLS = ['No.', 'Driver No.', 'Driver Name', 'License Status', 'License Expiry', 'Driving license reminder', 'Face', 'Status', 'Action'];

    return (
        <PageShell title="Driver">
            <p style={{ margin: '-8px 0 16px', fontSize: 12.5, color: '#9daec9' }}>
                Manage drivers, credentials, and on-device facial authorization.
            </p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                <DriverKpi label="Total Drivers" value={total} />
                <DriverKpi label="Authorized to Drive" value={authorized} note={pct(authorized)} color="#16a34a" />
                <DriverKpi label="Not Authorized" value={total - authorized} note={pct(total - authorized)} color="#ef4444" />
                <DriverKpi label="Expiring Licenses (30 Days)" value={expiringSoon} color={expiringSoon ? '#f59e0b' : '#111827'} />
            </div>

            <TabBar tabs={['Driver information', 'Face Photos']} active={tab} onChange={setTab} />

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>{error}</div>}

            {tab === 'Face Photos' ? (
                <FacePhotosTab drivers={drivers} devices={devices} faces={faces} onChanged={fetchFaces} />
            ) : (
                <>
                    <FilterBar>
                        <FInput placeholder="Driver No./Driver Name" style={{ width: 200 }} value={search} onChange={e => setSearch(e.target.value)} />
                        <FInput placeholder="Register Place" style={{ width: 160 }} value={place} onChange={e => setPlace(e.target.value)} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cfdcf0', cursor: 'pointer', paddingBottom: 1 }}>
                            <input type="checkbox" checked={expiredOnly} onChange={e => setExpiredOnly(e.target.checked)} style={{ accentColor: '#3b82f6' }} />License Expired
                        </label>
                        <button onClick={reset} style={{ padding: '7px 14px', background: '#111c33', color: '#cfdcf0', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
                    </FilterBar>
                    <ActionRow left={[<Btn key="add" primary onClick={() => setEditing('new')}>Add Driver</Btn>]} />

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                            <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5e7094' }}>Loading…</td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5e7094' }}>No data</td></tr>
                                ) : filtered.map((d, i) => {
                                    const lStatus   = licenseStatus(d.license_expiry);
                                    const lReminder = expiryReminder(d.license_expiry, d.notify_days_before);
                                    const face      = faces.find(f => f.driver_id === d.id);
                                    return (
                                        <tr key={d.id}>
                                            <td style={TD}>{i + 1}</td>
                                            <td style={TD}>{d.badge_no}</td>
                                            <td style={{ ...TD, fontWeight: 500 }}>{d.name}</td>
                                            <td style={TD}><Badge text={lStatus} color={STATUS_COLOR[lStatus]} /></td>
                                            <td style={TD}>{d.license_expiry ? d.license_expiry.slice(0, 10) : '—'}</td>
                                            <td style={TD}><Badge text={lReminder} color={REMINDER_COLOR[lReminder]} /></td>
                                            <td style={TD}>
                                                {face
                                                    ? <Badge text={face.status} color={FACE_STATUS_COLOR[face.status] || '#9ca3af'} />
                                                    : <span style={{ color: '#5e7094', fontSize: 12 }}>not enrolled</span>}
                                            </td>
                                            <td style={TD}>{d.status}</td>
                                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                                                <button onClick={() => setEditing(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Edit</button>
                                                <button onClick={() => setFacing(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Face</button>
                                                <button onClick={() => setPendingDeleteId(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {editing && (
                <DriverFormModal
                    driver={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchDrivers(); }}
                />
            )}

            {facing && (
                <FaceEnrollmentModal
                    driver={facing}
                    devices={devices}
                    faces={faces}
                    onClose={() => setFacing(null)}
                    onChanged={fetchFaces}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#111c33', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>Delete driver?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#9daec9' }}>This also removes the driver from Traccar. This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}

/* ── Vehicle ─────────────────────────────────────────────────────
   A vehicle is a local profile bound to a Traccar device by IMEI. Identity lives on `vehicles`,
   configuration on `vehicle_settings` under the same IMEI, and driver assignment on
   `driver_device` — the modal saves identity and settings together so it reads as one action. */

function AssignDriversModal({ vehicle, allDrivers, assignedIds, onClose, onSaved }) {
    const [selected, setSelected] = useState(new Set(assignedIds));
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState('');

    const toggle = (id) => setSelected(s => {
        const next = new Set(s);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            const { data } = await api.setVehicleDrivers(vehicle.imei, Array.from(selected));
            onSaved(data);
            onClose();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to save driver assignment.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#111c33', borderRadius: 12, width: 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2c46', flexShrink: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>Assign Drivers — {vehicle.name || vehicle.imei}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
                    {error && <div style={{ margin: '8px 0', padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>{error}</div>}
                    {allDrivers.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#5e7094', fontSize: 13, padding: '24px 0' }}>No drivers yet — add one under Driver first.</p>
                    ) : allDrivers.map(d => (
                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid #1e2c46', cursor: 'pointer', fontSize: 13.5, color: '#cfdcf0' }}>
                            <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} style={{ accentColor: '#3b82f6', width: 15, height: 15 }} />
                            <span style={{ fontWeight: 500 }}>{d.name}</span>
                            <span style={{ color: '#5e7094', fontSize: 12 }}>{d.badge_no}</span>
                        </label>
                    ))}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #1e2c46', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Add/Edit form for the vehicle registry, merged with its per-IMEI settings row so identity and
 * configuration are one modal and one Save.
 *
 * The IMEI is pickable only when adding (from Traccar devices not yet bound to a vehicle) and is
 * fixed afterwards — it is the join key for settings, driver assignment and maintenance records.
 * Relay opt-ins are off by default: immobilising a vehicle is high-impact, and the email alert
 * fires either way.
 */
function VehicleFormModal({ vehicle, availableDevices, onClose, onSaved }) {
    const isNew = !vehicle;
    const [form, setForm] = useState({
        imei: vehicle?.imei || '',
        name: vehicle?.name || '',
        plate_number: vehicle?.plate_number || '',
        manufacturer: vehicle?.manufacturer || '',
        model: vehicle?.model || '',
        year: vehicle?.year ?? '',
        color: vehicle?.color || '',
        status: vehicle?.status || 'Active',
    });

    const [enabled, setEnabled]                 = useState(false);
    const [faceFailEnabled, setFaceFailEnabled] = useState(false);
    const [channel, setChannel]                 = useState(10);
    const [fuelRate, setFuelRate]               = useState('');
    const [tankCapacity, setTankCapacity]       = useState('');
    const [vehicleType, setVehicleType]         = useState('');
    const [fuelType, setFuelType]               = useState('');
    const [stickerExpiry, setStickerExpiry]     = useState('');
    const [stickerNotifyDays, setStickerNotifyDays]     = useState('');
    const [insuranceExpiry, setInsuranceExpiry]         = useState('');
    const [insuranceNotifyDays, setInsuranceNotifyDays] = useState('');
    const [settingsLoading, setSettingsLoading] = useState(!isNew);

    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    useEffect(() => {
        if (isNew) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await api.getVehicleSetting(vehicle.imei);
                if (cancelled) return;
                setEnabled(!!res.data.relay_disconnect_enabled);
                setFaceFailEnabled(!!res.data.relay_disconnect_on_face_fail);
                setChannel(res.data.relay_channel ?? 10);
                setFuelRate(res.data.fuel_rate_l_per_100km ?? '');
                setTankCapacity(res.data.fuel_tank_capacity_liters ?? '');
                setVehicleType(res.data.vehicle_type ?? '');
                setFuelType(res.data.fuel_type ?? '');
                setStickerExpiry(res.data.safety_sticker_expiry ? res.data.safety_sticker_expiry.slice(0, 10) : '');
                setStickerNotifyDays(res.data.sticker_notify_days_before ?? '');
                setInsuranceExpiry(res.data.insurance_expiry ? res.data.insurance_expiry.slice(0, 10) : '');
                setInsuranceNotifyDays(res.data.insurance_notify_days_before ?? '');
            } catch (e) {
                if (!cancelled) setError('Failed to load vehicle settings.');
            } finally {
                if (!cancelled) setSettingsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isNew, vehicle?.imei]);

    const handleSave = async () => {
        if (!form.imei) { setError('Select an IMEI to bind this vehicle to.'); return; }
        if (!form.name.trim()) { setError('Vehicle Name is required.'); return; }
        setSaving(true);
        setError('');
        const num = (v) => (v === '' || v === null ? null : Number(v));
        try {
            if (isNew) {
                await api.createVehicle({ ...form, year: num(form.year) });
            } else {
                await api.updateVehicle(vehicle.id, { ...form, year: num(form.year) });
            }
            await api.setVehicleSetting(form.imei, {
                relay_disconnect_enabled:      enabled,
                relay_disconnect_on_face_fail: faceFailEnabled,
                relay_channel:                 Number(channel) || 10,
                fuel_rate_l_per_100km:         num(fuelRate),
                fuel_tank_capacity_liters:     num(tankCapacity),
                vehicle_type:                  vehicleType || null,
                fuel_type:                     fuelType || null,
                safety_sticker_expiry:         stickerExpiry || null,
                sticker_notify_days_before:    num(stickerNotifyDays),
                insurance_expiry:              insuranceExpiry || null,
                insurance_notify_days_before:  num(insuranceNotifyDays),
            });
            onSaved();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to save vehicle.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#111c33', borderRadius: 12, width: 480, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2c46' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>{isNew ? 'Add Vehicle' : 'Edit Vehicle'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {error && <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>{error}</div>}

                    <div style={{ ...driverFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={driverLabelStyle}>IMEI *</label>
                        {isNew ? (
                            <select value={form.imei} onChange={set('imei')} style={{ ...driverInputStyle, background: '#111c33', cursor: 'pointer' }}>
                                <option value="">Select an unlinked device…</option>
                                {availableDevices.map(d => (
                                    <option key={d.uniqueId} value={d.uniqueId}>{d.uniqueId} — {d.name || 'unnamed device'}</option>
                                ))}
                            </select>
                        ) : (
                            <input value={form.imei} disabled style={{ ...driverInputStyle, background: '#16233c', fontFamily: 'ui-monospace,Menlo,Consolas,monospace' }} />
                        )}
                        {isNew && availableDevices.length === 0 && (
                            <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#f59e0b' }}>Every visible device is already linked to a vehicle.</p>
                        )}
                    </div>

                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Vehicle Name *</label>
                        <input value={form.name} onChange={set('name')} placeholder="e.g. Delivery Van 3" style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Plate Number</label>
                        <input value={form.plate_number} onChange={set('plate_number')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Manufacturer</label>
                        <input value={form.manufacturer} onChange={set('manufacturer')} placeholder="e.g. Toyota" style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Model</label>
                        <input value={form.model} onChange={set('model')} placeholder="e.g. Hiace" style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Year</label>
                        <input type="number" min="1900" max="2100" value={form.year} onChange={set('year')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Color</label>
                        <input value={form.color} onChange={set('color')} style={driverInputStyle} />
                    </div>
                    {!isNew && (
                        <div style={driverFieldStyle}>
                            <label style={driverLabelStyle}>Status</label>
                            <select value={form.status} onChange={set('status')} style={{ ...driverInputStyle, background: '#111c33', cursor: 'pointer' }}>
                                <option>Active</option>
                                <option>Inactive</option>
                            </select>
                        </div>
                    )}
                </div>

                <div style={{ padding: '4px 20px 20px' }}>
                    {settingsLoading ? (
                        <p style={{ fontSize: 13, color: '#5e7094' }}>Loading settings…</p>
                    ) : (
                        <>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, marginBottom: 16, cursor: 'pointer', borderTop: '1px solid #1e2c46', paddingTop: 16 }}>
                                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ accentColor: '#3b82f6', width: 16, height: 16, marginTop: 2 }} />
                                <span style={{ fontSize: 13, color: '#cfdcf0' }}>
                                    <strong>Disconnect relay on unregistered driver tap.</strong><br />
                                    <span style={{ fontSize: 12, color: '#9daec9' }}>Only fires while the vehicle is stationary. An email alert is always sent, whether or not this is enabled.</span>
                                </span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
                                <input type="checkbox" checked={faceFailEnabled} onChange={e => setFaceFailEnabled(e.target.checked)} style={{ accentColor: '#3b82f6', width: 16, height: 16, marginTop: 2 }} />
                                <span style={{ fontSize: 13, color: '#cfdcf0' }}>
                                    <strong>Disconnect relay on failed face recognition.</strong><br />
                                    <span style={{ fontSize: 12, color: '#9daec9' }}>Fires whenever the device's face check comes back with no match. Independent of the toggle above — an email alert is always sent, whether or not this is enabled.</span>
                                </span>
                            </label>

                            <div style={{ ...driverFieldStyle, marginBottom: 16 }}>
                                <label style={driverLabelStyle}>Relay Channel</label>
                                <input type="number" min="1" max="255" value={channel} onChange={e => setChannel(e.target.value)} style={{ ...driverInputStyle, maxWidth: 120 }} />
                            </div>

                            <div style={{ ...driverFieldStyle, marginBottom: 16, borderTop: '1px solid #1e2c46', paddingTop: 16 }}>
                                <label style={driverLabelStyle}>Vehicle Type</label>
                                <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} style={{ ...driverInputStyle, background: '#111c33', cursor: 'pointer', maxWidth: 200 }}>
                                    <option value="">Default (no icon)</option>
                                    {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                                </select>
                                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#5e7094' }}>Controls the icon shown on the live map pin and in the device list sidebar.</p>
                            </div>

                            <div style={{ ...driverFieldStyle, marginBottom: 16 }}>
                                <label style={driverLabelStyle}>Fuel Type</label>
                                <select value={fuelType} onChange={e => setFuelType(e.target.value)} style={{ ...driverInputStyle, background: '#111c33', cursor: 'pointer', maxWidth: 200 }}>
                                    <option value="">Not set</option>
                                    {FUEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#5e7094' }}>Matches this vehicle to the Fuel Management module's current petrol/diesel price.</p>
                            </div>

                            <div style={{ borderTop: '1px solid #1e2c46', paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle}>Fuel Rate (L/100km)</label>
                                    <input type="number" min="0" step="0.1" placeholder="e.g. 12.5" value={fuelRate} onChange={e => setFuelRate(e.target.value)} style={driverInputStyle} />
                                </div>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle}>Tank Capacity (L)</label>
                                    <input type="number" min="0" step="0.1" placeholder="e.g. 80" value={tankCapacity} onChange={e => setTankCapacity(e.target.value)} style={driverInputStyle} />
                                </div>
                                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 11.5, color: '#5e7094' }}>
                                    Used by Fuel Management &gt; Consumption's "Fuel Rate" and "Fuel Sensor" methods.
                                </p>
                            </div>

                            <div style={{ borderTop: '1px solid #1e2c46', paddingTop: 16, marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle}>Safety Sticker Expiry</label>
                                    <input type="date" value={stickerExpiry} onChange={e => setStickerExpiry(e.target.value)} style={driverInputStyle} />
                                </div>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle}>Notify before expiry (days)</label>
                                    <input type="number" min="1" max="365" placeholder={`Default ${DEFAULT_NOTICE_DAYS}`} value={stickerNotifyDays} onChange={e => setStickerNotifyDays(e.target.value)} style={driverInputStyle} />
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #1e2c46', paddingTop: 16, marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle}>Insurance Expiry</label>
                                    <input type="date" value={insuranceExpiry} onChange={e => setInsuranceExpiry(e.target.value)} style={driverInputStyle} />
                                </div>
                                <div style={driverFieldStyle}>
                                    <label style={driverLabelStyle}>Notify before expiry (days)</label>
                                    <input type="number" min="1" max="365" placeholder={`Default ${DEFAULT_NOTICE_DAYS}`} value={insuranceNotifyDays} onChange={e => setInsuranceNotifyDays(e.target.value)} style={driverInputStyle} />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #1e2c46', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving || settingsLoading} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (saving || settingsLoading) ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function VehiclePage() {
    const [vehicles, setVehicles] = useState([]);
    const [devices, setDevices]   = useState([]);   // Traccar devices this account can see
    const [settings, setSettings] = useState([]);   // per-IMEI settings, for the status columns
    const [drivers, setDrivers]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [search, setSearch]     = useState('');
    const [stickerExpiredOnly, setStickerExpiredOnly]     = useState(false);
    const [insuranceExpiredOnly, setInsuranceExpiredOnly] = useState(false);
    const [editing, setEditing]   = useState(null);   // vehicle object, 'new', or null
    const [assigning, setAssigning] = useState(null); // vehicle object, or null
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [vehRes, devRes, setRes, drvRes] = await Promise.all([
                api.getVehicles(),
                api.getTraccarDevices().catch(() => ({ data: [] })),
                api.getVehicleSettings().catch(() => ({ data: [] })),
                api.getFleetDrivers(),
            ]);
            setVehicles(Array.isArray(vehRes.data) ? vehRes.data : []);
            setDevices(Array.isArray(devRes.data) ? devRes.data : []);
            setSettings(Array.isArray(setRes.data) ? setRes.data : []);
            setDrivers(Array.isArray(drvRes.data) ? drvRes.data : []);
        } catch (e) {
            setError('Failed to load vehicles.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // Driver names per vehicle, derived from each driver's own imeis list — one pass rather than
    // an assignment request per row.
    const driversByImei = {};
    drivers.forEach(d => (d.imeis || []).forEach(imei => { (driversByImei[imei] ||= []).push(d); }));

    const settingsByImei = {};
    settings.forEach(s => { settingsByImei[s.imei] = s; });

    // Devices with no vehicle row yet — a device already bound shouldn't be pickable again.
    const boundImeis = new Set(vehicles.map(v => v.imei));
    const availableDevices = devices.filter(d => !boundImeis.has(d.uniqueId));

    const filtered = vehicles.filter(v => {
        if (search) {
            const q = search.toLowerCase();
            if (!(v.name || '').toLowerCase().includes(q) && !(v.plate_number || '').toLowerCase().includes(q)) return false;
        }
        const setting = settingsByImei[v.imei];
        if (stickerExpiredOnly && expiryReminder(setting?.safety_sticker_expiry, setting?.sticker_notify_days_before) !== 'Expired') return false;
        if (insuranceExpiredOnly && expiryReminder(setting?.insurance_expiry, setting?.insurance_notify_days_before) !== 'Expired') return false;
        return true;
    });

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteVehicle(id);
            await load();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to delete vehicle.');
        }
    };

    const COLS = ['No.', 'Vehicle Name', 'Plate Number', 'Manufacturer / Model', 'Status', 'Safety Sticker Status', 'Insurance Status', 'Drivers', 'Action'];

    return (
        <PageShell title="Vehicle">
            <FilterBar>
                <FInput placeholder="Vehicle Name or Plate No." style={{ width: 240 }} value={search} onChange={e => setSearch(e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cfdcf0', cursor: 'pointer', paddingBottom: 1 }}>
                    <input type="checkbox" checked={stickerExpiredOnly} onChange={e => setStickerExpiredOnly(e.target.checked)} style={{ accentColor: '#3b82f6' }} />Safety Sticker Expired
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cfdcf0', cursor: 'pointer', paddingBottom: 1 }}>
                    <input type="checkbox" checked={insuranceExpiredOnly} onChange={e => setInsuranceExpiredOnly(e.target.checked)} style={{ accentColor: '#3b82f6' }} />Insurance Expired
                </label>
                <button onClick={() => { setSearch(''); setStickerExpiredOnly(false); setInsuranceExpiredOnly(false); }} style={{ padding: '7px 14px', background: '#111c33', color: '#cfdcf0', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
                <button onClick={load} style={{ padding: '7px 14px', background: '#111c33', color: '#cfdcf0', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Refresh</button>
            </FilterBar>
            <ActionRow left={[<Btn key="add" primary onClick={() => setEditing('new')}>Add Vehicle</Btn>]} />

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1300 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5e7094' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5e7094' }}>
                                {vehicles.length === 0 ? 'No vehicles yet — click "Add Vehicle" to link a tracked device.' : 'No vehicles found'}
                            </td></tr>
                        ) : filtered.map((v, i) => {
                            const assigned = driversByImei[v.imei] || [];
                            const setting  = settingsByImei[v.imei];
                            const sStatus  = expiryReminder(setting?.safety_sticker_expiry, setting?.sticker_notify_days_before);
                            const iStatus  = expiryReminder(setting?.insurance_expiry, setting?.insurance_notify_days_before);
                            const emoji    = vehicleTypeEmoji(setting?.vehicle_type);
                            return (
                                <tr key={v.id}>
                                    <td style={TD}>{i + 1}</td>
                                    <td style={{ ...TD, fontWeight: 500 }}>{emoji ? `${emoji} ` : ''}{v.name}</td>
                                    <td style={TD}>{v.plate_number || '—'}</td>
                                    <td style={TD}>{[v.manufacturer, v.model].filter(Boolean).join(' / ') || '—'}</td>
                                    <td style={TD}><Badge text={v.status} color={v.status === 'Active' ? '#16a34a' : '#ef4444'} /></td>
                                    <td style={TD}><Badge text={sStatus} color={REMINDER_COLOR[sStatus]} /></td>
                                    <td style={TD}><Badge text={iStatus} color={REMINDER_COLOR[iStatus]} /></td>
                                    <td style={TD}>{assigned.length === 0 ? <span style={{ color: '#5e7094' }}>—</span> : assigned.map(d => d.name).join(', ')}</td>
                                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                                        <button onClick={() => setEditing(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Edit</button>
                                        <button onClick={() => setAssigning(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Assign Drivers</button>
                                        <button onClick={() => setPendingDeleteId(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {editing && (
                <VehicleFormModal
                    vehicle={editing === 'new' ? null : editing}
                    availableDevices={availableDevices}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}

            {assigning && (
                <AssignDriversModal
                    vehicle={assigning}
                    allDrivers={drivers}
                    assignedIds={(driversByImei[assigning.imei] || []).map(d => d.id)}
                    onClose={() => setAssigning(null)}
                    onSaved={() => load()}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#111c33', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>Delete vehicle?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#9daec9' }}>This unlinks the IMEI from this vehicle profile. This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}

/* Vehicle Track */
// Functional scope: real-time location, route replay, speed, mileage, stop, geofence, work-zone
// rule and online-rate management — for every VL863-tracked vehicle. Built almost entirely by
// composing the Traccar-backed report modules already built under Report (Replay, Track Details,
// Mileage, Parking/Idling, Geo Fence, Online/Offline) via <ReportPage reportSection="..."/>, plus
// the existing live map (MapCanvas) and geofence management page (GeofencePage) — no duplicated
// logic, just reused as-is under a single Fleet-side module.
/** Full REST poll interval. The websocket carries positions between polls; this is the floor
 *  that also catches device add/rename/removal, which the socket does not always announce. */
const VEHICLE_TRACK_POLL_SECONDS = 30;

function liveTrackDeviceShape(device, positionsByDeviceId, vehicleTypesByImei = {}) {
    const pos = positionsByDeviceId[device.id];
    return {
        id:          device.id,
        name:        device.name,
        imei:        device.uniqueId,
        tracker:     device.model || device.uniqueId,
        status:      device.status === 'online' ? 'ONLINE' : 'OFFLINE',
        lat:         pos ? pos.latitude  : null,
        lng:         pos ? pos.longitude : null,
        // Drives the map pin's glyph — configured per vehicle under Fleet > Vehicle.
        vehicleType: vehicleTypesByImei[device.uniqueId] ?? null,
    };
}

/** Merge a Traccar websocket {"positions":[…]} frame into the current device list. */
function applyTrackPositions(devices, positions) {
    const byDeviceId = {};
    for (const p of positions) byDeviceId[p.deviceId] = p;

    return devices.map(d => {
        const p = byDeviceId[d.id];
        if (!p) return d;
        return {
            ...d,
            lat:    p.latitude,
            lng:    p.longitude,
        };
    });
}

/** Merge a Traccar websocket {"devices":[…]} frame (status/name changes). */
function applyTrackDevices(devices, updates) {
    const byId = {};
    for (const u of updates) byId[u.id] = u;

    return devices.map(d => {
        const u = byId[d.id];
        if (!u) return d;
        return {
            ...d,
            name:    u.name,
            tracker: u.model || u.uniqueId,
            status:  u.status === 'online' ? 'ONLINE' : 'OFFLINE',
        };
    });
}

/**
 * Real-time Location tab.
 *
 * Positions arrive two ways: Traccar's own websocket pushes them as the devices report, and a
 * slower REST poll acts as the floor so the view still converges if the socket drops or a device
 * is added/renamed while it is open. The reference implementation pushes over MQTT via Reverb
 * because its backend is TurboHive; Traccar already exposes an authenticated socket of its own,
 * so that is used here instead of introducing a broker.
 */
function LiveLocationTab() {
    const [devices, setDevices]   = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading]   = useState(true);
    const [connected, setConnected] = useState(false);
    const [nextRefreshIn, setNextRefreshIn] = useState(VEHICLE_TRACK_POLL_SECONDS);

    const wsRef        = useRef(null);
    const reconnectRef = useRef(null);

    const load = async () => {
        try {
            const [devRes, posRes, setRes] = await Promise.all([
                api.getTraccarDevices(),
                api.getLatestPositions(),
                api.getVehicleSettings().catch(() => ({ data: [] })),
            ]);

            const positionsByDeviceId = {};
            (posRes.data ?? []).forEach(p => { positionsByDeviceId[p.deviceId] = p; });

            const vehicleTypesByImei = {};
            (setRes.data ?? []).forEach(s => {
                if (s.imei && s.vehicle_type) vehicleTypesByImei[s.imei] = s.vehicle_type;
            });

            setDevices((devRes.data ?? []).map(d => liveTrackDeviceShape(d, positionsByDeviceId, vehicleTypesByImei)));
        } catch (e) {
            // Keep the last good snapshot on screen rather than blanking the map on one bad poll.
        } finally {
            setLoading(false);
        }
    };

    // REST floor, with a visible countdown so the view never looks silently stale.
    useEffect(() => {
        load();
        const tick = setInterval(() => {
            setNextRefreshIn(s => {
                if (s <= 1) { load(); return VEHICLE_TRACK_POLL_SECONDS; }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, []);

    // Traccar's websocket. The token is minted server-side as the signed-in identity, so a
    // tenant's socket carries only their own devices.
    useEffect(() => {
        let cancelled = false;

        const connect = async () => {
            try {
                const { data } = await api.getWsToken();
                if (cancelled) return;

                const ws = new WebSocket(`${data.url}?token=${encodeURIComponent(data.token)}`);
                wsRef.current = ws;

                ws.onopen = () => !cancelled && setConnected(true);
                ws.onmessage = (evt) => {
                    let msg;
                    try { msg = JSON.parse(evt.data); } catch { return; }
                    if (msg.positions) setDevices(ds => applyTrackPositions(ds, msg.positions));
                    if (msg.devices)   setDevices(ds => applyTrackDevices(ds, msg.devices));
                };
                ws.onclose = () => {
                    if (cancelled) return;
                    setConnected(false);
                    reconnectRef.current = setTimeout(connect, 3000);
                };
                ws.onerror = () => ws.close();
            } catch (e) {
                if (cancelled) return;
                setConnected(false);
                reconnectRef.current = setTimeout(connect, 3000);
            }
        };

        connect();

        return () => {
            cancelled = true;
            clearTimeout(reconnectRef.current);
            wsRef.current?.close();
        };
    }, []);

    const selectedDevice = devices.find(d => d.id === selected) || null;
    const onlineCount    = devices.filter(d => d.status === 'ONLINE').length;

    const refreshNow = () => { setNextRefreshIn(VEHICLE_TRACK_POLL_SECONDS); load(); };

    const legendItem = (color, label) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9daec9', fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {label}
        </span>
    );

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    {legendItem(MARKER_COLORS.online.fill,   `Online (${onlineCount})`)}
                    {legendItem(MARKER_COLORS.offline.fill,  `Offline (${devices.length - onlineCount})`)}
                    {legendItem(MARKER_COLORS.selected.fill, 'Selected')}
                </div>
                <button onClick={refreshNow} style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    ⟳ Refresh
                </button>
            </div>

            {/* Isolated so Leaflet's stacking stays local — see zLayers.js. */}
            <div style={{ height: 600, borderRadius: 10, overflow: 'hidden', border: '1px solid #1e2c46', position: 'relative', isolation: 'isolate' }}>
                {loading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5e7094', fontSize: 13, zIndex: 500, background: '#111c33' }}>Loading…</div>
                )}
                <MapCanvas
                    devices={devices}
                    selected={selected}
                    onSelect={setSelected}
                    selectedDevice={selectedDevice}
                    liveConnected={connected}
                    nextRefreshIn={nextRefreshIn}
                />
            </div>
        </div>
    );
}

function EmbeddedReport({ section, height = 640 }) {
    return (
        <div style={{ height, display: 'flex', flexDirection: 'column', border: '1px solid #1e2c46', borderRadius: 10, overflow: 'hidden' }}>
            <ReportPage reportSection={section} embedded />
        </div>
    );
}

const VEHICLE_TRACK_TABS = ['Real-time Location', 'Route Replay', 'Speed', 'Mileage', 'Stops', 'Geofence', 'Work-zone Rules', 'Online Rate'];

function VehicleTrackPage() {
    const [tab, setTab]             = useState(VEHICLE_TRACK_TABS[0]);
    const [stopsView, setStopsView] = useState('Parking');
    const [rateView, setRateView]   = useState('Online');

    return (
        <PageShell title="Vehicle Track">
            <TabBar tabs={VEHICLE_TRACK_TABS} active={tab} onChange={setTab} />

            {tab === 'Real-time Location' && <LiveLocationTab />}
            {tab === 'Route Replay'       && <EmbeddedReport section="Replay" />}
            {tab === 'Speed'              && <EmbeddedReport section="Track Details" />}
            {tab === 'Mileage'            && <EmbeddedReport section="Mileage" />}
            {tab === 'Geofence'           && <EmbeddedReport section="Geo Fence" />}

            {tab === 'Stops' && (
                <>
                    <TabBar tabs={['Parking', 'Idling']} active={stopsView} onChange={setStopsView} />
                    <EmbeddedReport section={stopsView} />
                </>
            )}

            {tab === 'Online Rate' && (
                <>
                    <TabBar tabs={['Online', 'Offline']} active={rateView} onChange={setRateView} />
                    <EmbeddedReport section={rateView} />
                </>
            )}

            {tab === 'Work-zone Rules' && (
                <div style={{ height: 640, display: 'flex', border: '1px solid #1e2c46', borderRadius: 10, overflow: 'hidden' }}>
                    <GeofenceManagementPage onBack={() => {}} />
                </div>
            )}
        </PageShell>
    );
}

/* Fuel Management */
// Functional scope: fuel curve, refuelling, idle fuel, abnormal loss, vehicle/driver/route ranking
// and tonne-kilometre fuel analytics — core and auxiliary vehicles by priority. "Consumption" and
// "Current Fuel" reuse the existing Fuel Consumption / Current Fuel Value report modules; the rest
// (Fuel Curve, Refuelling, Idle Fuel, Abnormal Loss, Ranking) are new Traccar-backed reports added
// for this module (see TraccarController's Fleet -> Fuel Management section) and surfaced the same
// way as Vehicle Track: via <ReportPage reportSection="..."/>.
// Every tab here reads Traccar: /reports/route for position history and /positions for the
// latest reading. Fuel Curve is deliberately absent — it plots the raw fuel-sensor trace, which
// is only meaningful on a device that reports a `fuel` attribute.
/* Live sensor tracking first, then the historical reports.
   The split matters: 'Level', 'Events', 'Theft Watch' and 'Thresholds' come from the fuel *probe*
   (position attributes plus Traccar's own drop/increase events), while the tabs after them are
   Traccar's report endpoints and mostly work off a configured consumption rate. Reading the level
   off a sensor and inferring litres from a rate are different claims, so they are not mixed. */
const FUEL_MANAGEMENT_TABS = [
    'Level', 'Events', 'Theft Watch', 'Thresholds',
    'Consumption', 'Current Fuel', 'Refuelling', 'Idle Fuel', 'Abnormal Loss', 'Ranking',
];

function FuelManagementPage() {
    const [tab, setTab] = useState(FUEL_MANAGEMENT_TABS[0]);

    return (
        <PageShell title="Fuel Management">
            <TabBar tabs={FUEL_MANAGEMENT_TABS} active={tab} onChange={setTab} />

            {/* Probe-based tracking. These read fuel attributes off positions, so they show a
                reading with the time it was actually taken rather than assuming the latest packet
                carried one — sensor modules do not ride on every fix. */}
            {tab === 'Level'       && <FuelLevelReport />}
            {tab === 'Events'      && <FuelEventsReport />}
            {tab === 'Theft Watch' && <FuelTheftWatch />}
            {tab === 'Thresholds'  && (
                // Framed rather than full-bleed: it is a settings screen borrowed into a report
                // page, and it paints its own background.
                <div style={{ border: '1px solid #1e2c46', borderRadius: 10, overflow: 'hidden', display: 'flex', minHeight: 620 }}>
                    <FuelThresholdsPage />
                </div>
            )}

            {tab === 'Consumption'   && <EmbeddedReport section="Fuel Consumption" />}
            {tab === 'Current Fuel'  && <EmbeddedReport section="Current fuel Value" />}
            {tab === 'Refuelling'    && <EmbeddedReport section="Refuelling" />}
            {tab === 'Idle Fuel'     && <EmbeddedReport section="Idle Fuel" />}
            {tab === 'Abnormal Loss' && <EmbeddedReport section="Abnormal Fuel Loss" />}
            {tab === 'Ranking'       && <EmbeddedReport section="Fuel Ranking" height={720} />}
        </PageShell>
    );
}

/* Vehicle Maintenance */
const MAINTENANCE_STATUSES = ['Scheduled', 'Due Soon', 'Overdue', 'Completed', 'Cancelled'];
// Only these three are stored; "Due Soon" and "Overdue" are derived server-side from the due
// date and the vehicle's live Traccar odometer (VehicleMaintenance::effectiveStatus).
const SETTABLE_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];
const MAINTENANCE_STATUS_COLOR = {
    Scheduled:  '#3b82f6',
    'Due Soon': '#f59e0b',
    Overdue:    '#ef4444',
    Completed:  '#16a34a',
    Cancelled:  '#9ca3af',
};
const DEFAULT_NOTIFY_KM = 500;

const EMPTY_MAINTENANCE = {
    imei: '', maintenance_type: '', description: '', status: 'Scheduled',
    due_date: '', due_odometer_km: '', notify_days_before: '', notify_km_before: '',
    completed_date: '', completed_odometer_km: '', cost: '', vendor: '', notes: '',
};

function MaintenanceFormModal({ record, devices, onClose, onSaved }) {
    const isNew = !record;
    const [form, setForm] = useState(() => {
        if (!record) return { ...EMPTY_MAINTENANCE };
        const seeded = {};
        for (const key of Object.keys(EMPTY_MAINTENANCE)) seeded[key] = record[key] ?? '';
        return {
            ...seeded,
            due_date:       record.due_date       ? record.due_date.slice(0, 10)       : '',
            completed_date: record.completed_date ? record.completed_date.slice(0, 10) : '',
        };
    });
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    /* Live odometer per vehicle, so the due reading can be anchored to the number the schedule
       will actually be checked against. Fetched once per modal: it is a single Traccar call and
       the form is short-lived, so there is nothing to keep in sync. */
    const [odometers, setOdometers]       = useState({});
    const [serviceEvery, setServiceEvery] = useState('');

    useEffect(() => {
        api.getMaintenanceOdometers().then(res => setOdometers(res.data ?? {})).catch(() => {});
    }, []);

    const current = odometers[form.imei] ?? null;

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    /* "Service every N km" — the way servicing is actually specified. What gets stored is still an
       absolute reading, because that is what the vehicle's odometer is compared against; this only
       does the arithmetic that would otherwise happen in someone's head, and it does it against the
       reading the comparison will really use. */
    const applyInterval = () => {
        const every = Number(serviceEvery);
        if (!current || !Number.isFinite(every) || every <= 0) return;
        setForm(f => ({ ...f, due_odometer_km: String(Math.round(current.km + every)) }));
    };

    const handleSave = async () => {
        if (!String(form.imei).trim() || !String(form.maintenance_type).trim()) {
            setError('Vehicle and Maintenance Type are required.');
            return;
        }
        setSaving(true);
        setError('');
        const num = (v) => (v === '' || v === null ? null : Number(v));
        const payload = {
            ...form,
            due_odometer_km:       num(form.due_odometer_km),
            completed_odometer_km: num(form.completed_odometer_km),
            cost:                  num(form.cost),
            notify_days_before:    num(form.notify_days_before),
            notify_km_before:      num(form.notify_km_before),
            due_date:              form.due_date       || null,
            completed_date:        form.completed_date || null,
            description:           form.description    || null,
            vendor:                form.vendor         || null,
            notes:                 form.notes          || null,
        };
        try {
            if (isNew) await api.createVehicleMaintenance(payload);
            else       await api.updateVehicleMaintenance(record.id, payload);
            onSaved();
        } catch (e) {
            // Laravel answers a 422 with per-field messages; showing only the summary line hid
            // which field was actually rejected, which is the one thing the reader needs.
            const errors = e.response?.data?.errors;
            setError(errors
                ? Object.values(errors).flat().join(' ')
                : (e.response?.data?.message || 'Failed to save maintenance record.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#111c33', borderRadius: 12, width: 560, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2c46' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>{isNew ? 'New Maintenance Record' : 'Edit Maintenance Record'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {error && <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>{error}</div>}

                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Vehicle *</label>
                        <select value={form.imei} onChange={set('imei')} style={{ ...driverInputStyle, background: '#111c33', cursor: 'pointer' }}>
                            <option value="">Select vehicle</option>
                            {devices.map(d => <option key={d.id} value={d.uniqueId}>{d.name} ({d.uniqueId})</option>)}
                        </select>
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Maintenance Type *</label>
                        <input value={form.maintenance_type} onChange={set('maintenance_type')} placeholder="e.g. Oil change" style={driverInputStyle} />
                    </div>
                    <div style={{ ...driverFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={driverLabelStyle}>Description</label>
                        <input value={form.description} onChange={set('description')} style={driverInputStyle} />
                    </div>
                    <div style={{ ...driverFieldStyle, gridColumn: '1 / -1', maxWidth: 220 }}>
                        <label style={driverLabelStyle}>Status</label>
                        <select value={form.status} onChange={set('status')} style={{ ...driverInputStyle, background: '#111c33', cursor: 'pointer' }}>
                            {SETTABLE_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Due Date</label>
                        <input type="date" value={form.due_date} onChange={set('due_date')} style={driverInputStyle} />
                    </div>
                    <div style={{ ...driverFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={driverLabelStyle}>Due Odometer (km)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <input type="number" min="0" step="0.01" value={form.due_odometer_km} onChange={set('due_odometer_km')}
                                style={{ ...driverInputStyle, width: 150 }} />

                            <span style={{ fontSize: 12.5, color: '#5e7094' }}>or service every</span>
                            <input type="number" min="1" step="1" value={serviceEvery} onChange={e => setServiceEvery(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyInterval(); } }}
                                placeholder="5000" disabled={!current}
                                style={{ ...driverInputStyle, width: 100, opacity: current ? 1 : 0.5 }} />
                            <span style={{ fontSize: 12.5, color: '#5e7094' }}>km</span>
                            <button type="button" onClick={applyInterval} disabled={!current || !serviceEvery}
                                style={{
                                    padding: '7px 14px', borderRadius: 6, border: '1px solid #24344f',
                                    background: current && serviceEvery ? '#152a4a' : '#111c33',
                                    color: current && serviceEvery ? '#7fc4ff' : '#24344f',
                                    fontSize: 12.5, fontWeight: 600,
                                    cursor: current && serviceEvery ? 'pointer' : 'not-allowed',
                                }}>
                                Apply
                            </button>
                        </div>

                        {/* What the due figure will be compared against. Without it, an absolute
                            reading is guesswork — and on a device with no odometer of its own the
                            number means something different, which is worth saying out loud. */}
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9daec9', lineHeight: 1.5 }}>
                            {!form.imei ? (
                                'Pick a vehicle to see its current reading.'
                            ) : current ? (
                                <>
                                    Current reading: <b style={{ color: '#eaeff9' }}>{current.km.toLocaleString()} km</b>
                                    {form.due_odometer_km !== '' && Number(form.due_odometer_km) > current.km && (
                                        <> · due in <b style={{ color: '#eaeff9' }}>{Math.round(Number(form.due_odometer_km) - current.km).toLocaleString()} km</b></>
                                    )}
                                    {form.due_odometer_km !== '' && Number(form.due_odometer_km) <= current.km && (
                                        <span style={{ color: '#fcd34d' }}> · already past this reading — the record will show as Overdue</span>
                                    )}
                                    {current.source === 'totalDistance' && (
                                        <span style={{ display: 'block', color: '#fcd34d' }}>
                                            This device reports no odometer of its own, so the figure is Traccar's distance
                                            since the device was registered — not the vehicle's dashboard reading. Set the due
                                            odometer against this number, not the dashboard.
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span style={{ color: '#fcd34d' }}>
                                    No odometer reported for this vehicle, so an odometer-based schedule will never trigger.
                                    Use the due date instead.
                                </span>
                            )}
                        </p>
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Notify Days Before</label>
                        <input type="number" min="1" max="365" placeholder={`Default ${DEFAULT_NOTICE_DAYS}`} value={form.notify_days_before} onChange={set('notify_days_before')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Notify Km Before</label>
                        <input type="number" min="1" placeholder={`Default ${DEFAULT_NOTIFY_KM}`} value={form.notify_km_before} onChange={set('notify_km_before')} style={driverInputStyle} />
                    </div>

                    {/* Everything below is filled in once the work has actually been done. */}
                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #1e2c46', paddingTop: 14, marginTop: 4, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: '#9daec9' }}>
                        COMPLETION
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Completed Date</label>
                        <input type="date" value={form.completed_date} onChange={set('completed_date')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Completed Odometer (km)</label>
                        <input type="number" min="0" step="0.01" value={form.completed_odometer_km} onChange={set('completed_odometer_km')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Cost</label>
                        <input type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} style={driverInputStyle} />
                    </div>
                    <div style={driverFieldStyle}>
                        <label style={driverLabelStyle}>Vendor</label>
                        <input value={form.vendor} onChange={set('vendor')} style={driverInputStyle} />
                    </div>
                    <div style={{ ...driverFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={driverLabelStyle}>Notes</label>
                        <input value={form.notes} onChange={set('notes')} style={driverInputStyle} />
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #1e2c46', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Service records live in the local `vehicle_maintenances` table rather than Traccar's
// /api/maintenance, which only models a repeating threshold and has nowhere to put vendor,
// cost, completion odometer or notes. The vehicle list and the odometer that escalates a
// record to "Due Soon"/"Overdue" still come from Traccar (VehicleMaintenanceController).
function VehicleMaintenancePage() {
    const [records, setRecords] = useState([]);
    const [devices, setDevices] = useState([]);
    const [search, setSearch]   = useState('');
    const [status, setStatus]   = useState('');
    const [editing, setEditing] = useState(null);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const res = await api.getVehicleMaintenances();
            setRecords(res.data);
            setError('');
        } catch (e) {
            setError('Failed to load maintenance records.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecords();
        // The vehicle picker is best-effort: the records table still works when Traccar is down.
        api.getTraccarDevices().then(r => setDevices(r.data || [])).catch(() => {});
    }, []);

    const reset = () => { setSearch(''); setStatus(''); };

    const filtered = records.filter(r => {
        if (search) {
            const q = search.toLowerCase();
            if (!((r.vehicle_no || '').toLowerCase().includes(q)
               || (r.imei || '').toLowerCase().includes(q)
               || (r.maintenance_type || '').toLowerCase().includes(q))) return false;
        }
        if (status && r.effective_status !== status) return false;
        return true;
    });

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteVehicleMaintenance(id);
            await fetchRecords();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to delete maintenance record.');
        }
    };

    const COLS = ['No.', 'Vehicle', 'Type', 'Status', 'Due Date', 'Due Odometer (km)', 'Cost', 'Vendor', 'Action'];

    return (
        <PageShell title="Vehicle Maintenance">
            <TabBar tabs={['Maintenance Records']} active="Maintenance Records" onChange={() => {}} />
            <FilterBar>
                <FInput placeholder="Vehicle/Maintenance Type" style={{ width: 220 }} value={search} onChange={e => setSearch(e.target.value)} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#9daec9', fontWeight: 600 }}>Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, outline: 'none', background: '#111c33', cursor: 'pointer' }}>
                        <option value="">All statuses</option>
                        {MAINTENANCE_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#111c33', color: '#cfdcf0', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </FilterBar>
            <ActionRow left={[<Btn key="add" primary onClick={() => setEditing('new')}>Add</Btn>]} />

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5e7094' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5e7094' }}>No data</td></tr>
                        ) : filtered.map((r, i) => (
                            <tr key={r.id}>
                                <td style={TD}>{i + 1}</td>
                                {/* IMEI, current odometer and the completion figures are all in
                                    the edit modal; the table stays scannable. */}
                                <td style={{ ...TD, fontWeight: 500 }} title={r.imei}>{r.vehicle_no}</td>
                                <td style={TD}>{r.maintenance_type}</td>
                                <td style={TD}><Badge text={r.effective_status} color={MAINTENANCE_STATUS_COLOR[r.effective_status] || '#9ca3af'} /></td>
                                <td style={TD}>{r.due_date ? r.due_date.slice(0, 10) : '—'}</td>
                                <td style={TD}>{r.due_odometer_km ?? '—'}</td>
                                <td style={TD}>{r.cost ?? '—'}</td>
                                <td style={TD}>{r.vendor || '—'}</td>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                                    <button onClick={() => setEditing(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12.5, fontWeight: 600, marginRight: 10 }}>Edit</button>
                                    <button onClick={() => setPendingDeleteId(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editing && (
                <MaintenanceFormModal
                    record={editing === 'new' ? null : editing}
                    devices={devices}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchRecords(); }}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#111c33', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>Delete maintenance record?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#9daec9' }}>This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}

/* ── page map ────────────────────────────────────────────────── */
/* What the app header calls each Fleet page. Keys match PAGE_MAP; exported so the header names the
   page the reader is actually on rather than the generic "Fleet". */
export const FLEET_PAGE_TITLES = {
    Dashboard:          'Fleet Dashboard',
    Driver:             'Driver',
    Vehicle:            'Vehicle',
    VehicleTrack:       'Vehicle Track',
    VehicleMaintenance: 'Vehicle Maintenance',
    FuelManagement:     'Fuel Management',
};

const PAGE_MAP = {
    Dashboard:          FleetDashboard,
    Driver:             DriverPage,
    Vehicle:            VehiclePage,
    VehicleTrack:       VehicleTrackPage,
    VehicleMaintenance: VehicleMaintenancePage,
    FuelManagement:     FuelManagementPage,
};

/* ══════════════════════════════════════════════════════════════ */
/*  Main export                                                   */
/* ══════════════════════════════════════════════════════════════ */
export default function FleetPage({ fleetPage = 'Dashboard', setFleetPage }) {
    const Content = PAGE_MAP[fleetPage] || FleetDashboard;

    return (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
            {/* Content — the cockpit paints its own dark ground, so don't force white under it. */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: fleetPage === 'Dashboard' ? '#060a14' : '#111c33' }}>
                <Content setFleetPage={setFleetPage} />
            </div>
        </div>
    );
}
