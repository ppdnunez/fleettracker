/* ── ReportPage.jsx ─────────────────────────────────────────── */
import { useState, useEffect, Fragment } from 'react';
import { api } from '../api.js';

/* ── shared sub-components ──────────────────────────────────── */
const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb' };
const TD = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#374151' };

const humanize = (raw) => raw ? raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()) : '';
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString() : '—';
const toLocalInput = (d) => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Notice({ color = '#fef3c7', icon = '⚠', text }) {
    return (
        <div style={{ background: color, border: `1px solid ${color === '#fef3c7' ? '#f59e0b' : '#3b82f6'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
            <span>{icon}</span><span>{text}</span>
        </div>
    );
}

function EmptyTable({ cols, rows }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
                <tr>{cols.map(c => <th key={c} style={TH}>{c}</th>)}</tr>
            </thead>
            <tbody>
                {rows && rows.length ? rows.map((r, i) => (
                    <tr key={i}>{r.map((cell, j) => <td key={j} style={TD}>{cell}</td>)}</tr>
                )) : (
                    <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                )}
            </tbody>
        </table>
    );
}

function SelInput({ label, type = 'select', options = [], placeholder }) {
    const [v, setV] = useState('');
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</label>
            {type === 'select' ? (
                <select value={v} onChange={e => setV(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', minWidth: 150 }}>
                    <option value="">{placeholder || 'Please select'}</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : (
                <input type={type} value={v} onChange={e => setV(e.target.value)} placeholder={placeholder}
                    style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
            )}
        </div>
    );
}

function FilterBar({ children, onSearch }) {
    return (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            {children}
            <button onClick={onSearch} style={{ padding: '7px 22px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Export</button>
        </div>
    );
}

function ChartPlaceholder({ label }) {
    return (
        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14, marginBottom: 18 }}>
            📈 {label} chart — no data
        </div>
    );
}

/* ── date range preset ────────────────────────────────────────── */
function DateDeviceFilter({ showModel, showSub }) {
    return (
        <>
            <SelInput label="Device" type="select" placeholder="Select device" />
            <SelInput label="Start date" type="date" />
            <SelInput label="End date" type="date" />
            {showModel && <SelInput label="Device Model" type="select" placeholder="All models" />}
            {showSub   && <SelInput label="Sub-account" type="select" placeholder="All accounts" />}
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  DEVICE STATISTICS PAGES                                       */
/* ══════════════════════════════════════════════════════════════ */

function formatMinutesDuration(minutes) {
    if (minutes == null) return '—';
    const total = Math.round(minutes);
    const h = Math.floor(total / 60), m = total % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const BATTERY_STATUS_COLOR = { Normal: '#16a34a', Low: '#f59e0b', Critical: '#ef4444' };

// Built from Traccar's GET /api/reports/route — each position's attributes.batteryLevel is bucketed
// into Normal/Low/Critical and consecutive same-status readings are collapsed into one row spanning
// from the first to the last reading at that status (see TraccarController::internalBatteryReport).
function InternalBattery() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [status, setStatus]     = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getBatteryReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load battery report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setStatus(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const filtered = status ? rows.filter(r => r.status === status) : rows;
    const COLS = ['No.','Device name','IMEI','Battery Level (%)','Status','Time','Duration'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={status} onChange={e => setStatus(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="">All statuses</option>
                    <option>Normal</option><option>Low</option><option>Critical</option>
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : filtered.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : filtered.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.level ?? '—'}</td>
                            <td style={{ ...TD, color: BATTERY_STATUS_COLOR[r.status] || '#374151', fontWeight: 600 }}>{r.status ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.startTime)}</td>
                            <td style={TD}>{formatMinutesDuration(r.durationMinutes)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Built from Traccar's GET /api/reports/route — reads attributes.power (falling back to
// attributes.battery), the vehicle/external power-supply voltage, as opposed to the internal-battery
// percentage used by the Internal Battery report. See TraccarController::externalBatteryReport.
function ExternalBattery() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [status, setStatus]     = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getExternalBatteryReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load external battery report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setStatus(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const filtered = status ? rows.filter(r => r.status === status) : rows;
    const COLS = ['No.','Device name','IMEI','Voltage (V)','Status','Record Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={status} onChange={e => setStatus(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="">All statuses</option>
                    <option>Normal</option><option>Low</option>
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : filtered.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : filtered.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.voltage ?? '—'}</td>
                            <td style={{ ...TD, color: BATTERY_STATUS_COLOR[r.status] || '#374151', fontWeight: 600 }}>{r.status ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.recordTime)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

const FUEL_METHODS = [
    ['none',   'No Sensor (Estimated)'],
    ['sensor', 'Fuel Sensor'],
    ['obd',    'OBD-II / CAN Bus'],
];
const FUEL_METHOD_LABELS = Object.fromEntries(FUEL_METHODS);
const FUEL_METHOD_NOTICE = {
    none:   'No sensor available: fuel used is estimated from distance traveled x the device’s configured average consumption (Attributes → fuelEfficiency, L/100km; defaults to 9.0 if not set).',
    sensor: 'Computed from drops in the fuel-level sensor reading (attributes.fuel); refuels are excluded. Converted from % to liters using the device’s fuelCapacity attribute when available.',
    obd:    'Computed from the vehicle’s OBD-II/CAN data: cumulative fuel used (attributes.fuelUsed) over the period, or the instantaneous consumption rate (attributes.fuelConsumption) integrated over time.',
};

// Built from Traccar's GET /api/reports/route — see TraccarController::fuelConsumptionReport for
// how each of the three methods (none/sensor/obd) derives Fuel Used from the raw position history.
function FuelConsumption() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [method, setMethod]     = useState('none');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        const m   = overrides.method ?? method;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString(), method: m };
            if (dId) params.deviceId = dId;
            const res = await api.getFuelConsumptionReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fuel consumption report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setMethod('none'); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device name','IMEI','Start Time','End Time','Distance (km)','Fuel Used (L)','Avg Consumption (L/100km)'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={method} onChange={e => setMethod(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 180 }}>
                    {FUEL_METHODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <Notice text={FUEL_METHOD_NOTICE[method]} />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data for {FUEL_METHOD_LABELS[method]}</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={r.deviceId}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.startTime)}</td>
                            <td style={TD}>{fmtTime(r.endTime)}</td>
                            <td style={TD}>{r.distanceKm}</td>
                            <td style={TD}>{r.fuelUsed}</td>
                            <td style={TD}>{r.avgConsumption ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Live snapshot built from Traccar's GET /api/positions (latest position per device) — see
// TraccarController::currentFuel for how attributes.fuel is cross-derived into liters/percent.
function CurrentFuelValue() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = {};
            if (dId) params.deviceId = dId;
            const res = await api.getCurrentFuel(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load current fuel values.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        setDeviceId('');
        search({ deviceId: '' });
    };

    const COLS = ['No.','Device name','IMEI','Current Fuel Level (L)','Fuel (%)','Last Updated'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={r.deviceId}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.liters ?? '—'}</td>
                            <td style={TD}>{r.percent != null ? `${r.percent}%` : '—'}</td>
                            <td style={TD}>{fmtTime(r.lastUpdated)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

// Lightweight hand-rolled dual-line sparkline (no chart dependency in this project) replacing the
// old static placeholder, plotted from the same rows the table below renders.
function TempHumidityChart({ rows }) {
    const ordered = [...rows].reverse(); // table is newest-first; chart reads chronologically
    if (ordered.length < 2) {
        return (
            <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, marginBottom: 14 }}>
                📈 Temperature & Humidity (dual axis) — not enough data
            </div>
        );
    }
    const W = 760, H = 160, P = 20;
    const temps = ordered.map(r => r.temperature).filter(v => v != null);
    const hums  = ordered.map(r => r.humidity).filter(v => v != null);
    const tMin = temps.length ? Math.min(...temps) : 0, tMax = temps.length ? Math.max(...temps) : 1;
    const hMin = hums.length  ? Math.min(...hums)  : 0, hMax = hums.length  ? Math.max(...hums)  : 1;
    const xStep = (W - P * 2) / (ordered.length - 1);

    const pathFor = (key, min, max) => {
        let d = '';
        ordered.forEach((r, i) => {
            if (r[key] == null) return;
            const x = P + i * xStep;
            const y = H - P - ((r[key] - min) / (max - min || 1)) * (H - P * 2);
            d += `${d ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
        });
        return d;
    };

    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>● Temperature (°C)</span>
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>● Humidity (%)</span>
            </div>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <path d={pathFor('temperature', tMin, tMax)} fill="none" stroke="#ef4444" strokeWidth="2" />
                <path d={pathFor('humidity', hMin, hMax)} fill="none" stroke="#3b82f6" strokeWidth="2" />
            </svg>
        </div>
    );
}

// Built from Traccar's GET /api/reports/route — reads attributes.temp1 (first temperature-probe
// channel) and attributes.humidity per reading. See TraccarController::temperatureHumidityReport.
function TemperatureHumidity() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            const res = await api.getTemperatureHumidityReport(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load temperature & humidity report.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device name','IMEI','Temperature (°C)','Humidity (%)','Record Time'];

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            <TempHumidityChart rows={rows} />
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                    ) : error ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    ) : rows.map((r, i) => (
                        <tr key={i}>
                            <td style={TD}>{i + 1}</td>
                            <td style={TD}>{r.deviceName ?? '—'}</td>
                            <td style={TD}>{r.imei ?? '—'}</td>
                            <td style={TD}>{r.temperature ?? '—'}</td>
                            <td style={TD}>{r.humidity ?? '—'}</td>
                            <td style={TD}>{fmtTime(r.recordTime)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

function DriverBehavior() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Event type" type="select" options={['Harsh Acceleration','Harsh Braking','Sharp Turn','Overspeed','Fatigue Driving']} />
            </FilterBar>
            <Notice text="Driver behavior events are detected based on accelerometer data." />
            <EmptyTable cols={['No.','Device name','Driver','Event Type','Value','Location','Time']} rows={[
                [1,'Device 001','Juan Dela Cruz','Harsh Braking','-0.62g','Makati City','2026-06-18 08:21:04'],
                [2,'Device 003','Maria Santos','Sharp Turn','42°/s','Quezon City','2026-06-18 08:05:51'],
                [3,'Device 005','Pedro Reyes','Overspeed','118 km/h','Pasig City','2026-06-18 07:48:30'],
                [4,'Device 007','Ana Garcia','Fatigue Driving','4h 10m continuous','Taguig City','2026-06-18 06:55:17'],
            ]} />
        </>
    );
}

function PositioningBattery() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <ChartPlaceholder label="Positioning accuracy & battery trend" />
            <EmptyTable cols={['No.','Device name','IMEI','Signal Strength','GPS Accuracy (m)','Battery (%)','Time']} rows={[
                [1,'Device 001','123456789012001','82%','3.2','92','2026-06-18 09:50:00'],
                [2,'Device 003','123456789012003','91%','2.5','100','2026-06-18 09:49:42'],
                [3,'Device 006','123456789012006','38%','6.8','64','2026-06-18 09:48:55'],
            ]} />
        </>
    );
}

function Logistics() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter showModel showSub />
                <SelInput label="Status" type="select" options={['In Transit','Delivered','Idle']} />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Origin','Destination','Distance (km)','Start Time','End Time','Status']} rows={[
                [1,'Device 001','123456789012001','Manila Warehouse','Makati Depot','14.2','2026-06-18 06:00','2026-06-18 07:05','Delivered'],
                [2,'Device 004','123456789012004','Quezon City Hub','Pasig Distribution Center','21.6','2026-06-18 07:30','—','In Transit'],
                [3,'Device 007','123456789012007','Caloocan Yard','Taguig Cold Storage','27.9','2026-06-18 05:45','2026-06-18 07:58','Delivered'],
            ]} />
        </>
    );
}

function TravelStatisticsOBD() {
    return (
        <>
            <Notice color="#dbeafe" icon="ℹ" text="This report is only available for devices with OBD support." />
            <FilterBar><DateDeviceFilter /></FilterBar>
            <ChartPlaceholder label="Travel statistics (OBD)" />
            <EmptyTable cols={['No.','Device name','IMEI','Total Distance (km)','Total Duration','Avg Speed (km/h)','Max Speed (km/h)','Trips','Date']} rows={[
                [1,'Device 001','123456789012001','142.6','4h 10m','38','97','5','2026-06-18'],
                [2,'Device 003','123456789012003','98.3','3h 02m','42','105','3','2026-06-18'],
                [3,'Device 005','123456789012005','176.0','5h 25m','35','88','7','2026-06-18'],
            ]} />
        </>
    );
}

function VehicleFaultOBD() {
    return (
        <>
            <Notice color="#dbeafe" icon="ℹ" text="This report is only available for OBD-enabled devices." />
            <FilterBar><DateDeviceFilter /></FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Fault Code','Description','Severity','Detected Time','Cleared Time']} rows={[
                [1,'Device 002','123456789012002','P0128','Coolant Thermostat Below Regulating Temp','Medium','2026-06-18 06:12:00','—'],
                [2,'Device 008','123456789012008','P0420','Catalyst System Efficiency Below Threshold','High','2026-06-17 21:40:00','2026-06-18 05:00:00'],
            ]} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  MOTION STATISTICS PAGES                                       */
/* ══════════════════════════════════════════════════════════════ */

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function formatDuration(ms) {
    if (!ms) return '—';
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const knotsToKmh = (knots) => (knots == null ? null : knots * 1.852);

function RouteDetailRow({ colSpan, deviceId, trip }) {
    const [state, setState] = useState({ loading: true, error: '', points: null });

    useEffect(() => {
        let cancelled = false;
        setState({ loading: true, error: '', points: null });
        api.getRouteHistory(deviceId, trip.startTime, trip.endTime)
            .then(res => { if (!cancelled) setState({ loading: false, error: '', points: res.data }); })
            .catch(() => { if (!cancelled) setState({ loading: false, error: 'Failed to load route.', points: null }); });
        return () => { cancelled = true; };
    }, [deviceId, trip.startTime, trip.endTime]);

    let content;
    if (state.loading) {
        content = 'Loading route…';
    } else if (state.error) {
        content = state.error;
    } else if (state.points && state.points.length > 0) {
        const first = state.points[0];
        const last = state.points[state.points.length - 1];
        content = `${state.points.length} GPS points recorded — from (${first.latitude.toFixed(4)}, ${first.longitude.toFixed(4)}) to (${last.latitude.toFixed(4)}, ${last.longitude.toFixed(4)})`;
    } else {
        content = 'No route points found for this trip.';
    }

    return (
        <tr>
            <td colSpan={colSpan} style={{ ...TD, background: '#f8fafc', color: '#6b7280' }}>{content}</td>
        </tr>
    );
}

function TrackDetails() {
    const [devices,  setDevices]  = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [from,     setFrom]     = useState('');
    const [to,       setTo]       = useState('');
    const [trips,    setTrips]    = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [exporting,setExporting]= useState(false);
    const [error,    setError]    = useState('');
    const [expanded, setExpanded] = useState(null);

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const selectedDevice = devices.find(d => d.id === Number(deviceId));

    const search = async () => {
        if (!deviceId || !from || !to) { setError('Select a device and date range.'); return; }
        setError('');
        setLoading(true);
        setExpanded(null);
        try {
            const res = await api.getTripsReport(deviceId, new Date(from).toISOString(), new Date(to).toISOString());
            setTrips(res.data);
        } catch (e) {
            setError('Failed to load track details.');
            setTrips([]);
        } finally {
            setLoading(false);
        }
    };

    const exportXlsx = async () => {
        if (!deviceId || !from || !to) { setError('Select a device and date range.'); return; }
        setExporting(true);
        try {
            const res = await api.exportTripsReport(deviceId, new Date(from).toISOString(), new Date(to).toISOString());
            downloadBlob(res.data, `track-details-${selectedDevice?.name || deviceId}.xlsx`);
        } catch (e) {
            setError('Failed to export track details.');
        } finally {
            setExporting(false);
        }
    };

    const cols = ['No.', 'Device name', 'Start Time', 'End Time', 'Distance (km)', 'Avg Speed (km/h)', 'Max Speed (km/h)', 'Duration', ''];

    return (
        <>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Device</label>
                    <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                        style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', minWidth: 180 }}>
                        <option value="">Select device</option>
                        {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>From</label>
                    <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                        style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>To</label>
                    <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                        style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                </div>
                <button onClick={search} disabled={loading} style={{ padding: '7px 22px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Loading…' : 'Search'}
                </button>
                <button onClick={exportXlsx} disabled={exporting || trips.length === 0} style={{ padding: '7px 18px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: (exporting || trips.length === 0) ? 'not-allowed' : 'pointer', opacity: trips.length === 0 ? 0.5 : 1 }}>
                    {exporting ? 'Exporting…' : 'Export to Excel'}
                </button>
            </div>

            <Notice color="#dbeafe" icon="ℹ" text="Track precision depends on GPS signal quality and reporting interval settings." />
            {error && <Notice text={error} />}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead>
                        <tr>{cols.map(c => <th key={c} style={TH}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                        {trips.length === 0 ? (
                            <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                                {loading ? 'Loading…' : 'No data'}
                            </td></tr>
                        ) : trips.map((t, i) => (
                            <Fragment key={i}>
                                <tr>
                                    <td style={TD}>{i + 1}</td>
                                    <td style={TD}>{t.deviceName || selectedDevice?.name || '—'}</td>
                                    <td style={TD}>{new Date(t.startTime).toLocaleString()}</td>
                                    <td style={TD}>{new Date(t.endTime).toLocaleString()}</td>
                                    <td style={TD}>{(t.distance / 1000).toFixed(1)}</td>
                                    <td style={TD}>{knotsToKmh(t.averageSpeed)?.toFixed(1) ?? '—'}</td>
                                    <td style={TD}>{knotsToKmh(t.maxSpeed)?.toFixed(1) ?? '—'}</td>
                                    <td style={TD}>{formatDuration(t.duration)}</td>
                                    <td style={TD}>
                                        <button onClick={() => setExpanded(expanded === i ? null : i)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12.5, cursor: 'pointer' }}>
                                            {expanded === i ? 'Hide route' : 'View route'}
                                        </button>
                                    </td>
                                </tr>
                                {expanded === i && <RouteDetailRow colSpan={cols.length} deviceId={deviceId} trip={t} />}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function Mileage() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Date','Daily Mileage (km)','Total Mileage (km)']} rows={[
                [1,'Device 001','123456789012001','2026-06-18','142.6','18,420.3'],
                [2,'Device 003','123456789012003','2026-06-18','98.3','9,875.1'],
                [3,'Device 005','123456789012005','2026-06-18','176.0','24,310.8'],
            ]} />
        </>
    );
}

function Trips() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <Notice color="#dbeafe" icon="ℹ" text="A trip is defined as movement between two ignition-off or stop events lasting more than 5 minutes." />
            <EmptyTable cols={['No.','Device name','IMEI','Trip #','Start Time','End Time','Start Location','End Location','Distance (km)','Duration']} rows={[
                [1,'Device 001','123456789012001','TRP-1001','2026-06-18 06:00','2026-06-18 06:45','Manila Warehouse','Makati Depot','14.2','45m'],
                [2,'Device 001','123456789012001','TRP-1002','2026-06-18 07:10','2026-06-18 08:05','Makati Depot','Pasig City','19.8','55m'],
                [3,'Device 005','123456789012005','TRP-1003','2026-06-18 05:45','2026-06-18 07:58','Caloocan Yard','Taguig Cold Storage','27.9','2h 13m'],
            ]} />
        </>
    );
}

function Overspeed() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Speed limit (km/h)" type="number" placeholder="e.g. 120" />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Speed (km/h)','Limit (km/h)','Duration','Location','Time']} rows={[
                [1,'Device 005','123456789012005','118','100','45s','Pasig City','2026-06-18 07:48:30'],
                [2,'Device 007','123456789012007','132','100','1m 10s','Taguig City','2026-06-18 06:55:17'],
            ]} />
        </>
    );
}

function Parking() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Min. duration (min)" type="number" placeholder="e.g. 10" />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Start Time','End Time','Duration','Location','Latitude','Longitude']} rows={[
                [1,'Device 002','123456789012002','2026-06-18 02:10','2026-06-18 05:40','3h 30m','Quezon City','14.6100','121.0100'],
                [2,'Device 004','123456789012004','2026-06-17 22:00','2026-06-18 06:00','8h 00m','Pasig City','14.6200','121.0200'],
            ]} />
        </>
    );
}

function Idling() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Min. idle (min)" type="number" placeholder="e.g. 5" />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Start Time','End Time','Idle Duration','Location','Fuel Wasted (L)']} rows={[
                [1,'Device 001','123456789012001','2026-06-18 08:45','2026-06-18 09:02','17m','Makati City','1.2'],
                [2,'Device 006','123456789012006','2026-06-18 07:30','2026-06-18 07:51','21m','Caloocan City','1.5'],
            ]} />
        </>
    );
}

function Ignition() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Event','Time','Location','Odometer (km)']} rows={[
                [1,'Device 001','123456789012001','ON','2026-06-18 06:00:02','Manila Warehouse','18,278.1'],
                [2,'Device 001','123456789012001','OFF','2026-06-18 09:30:11','Pasig City','18,420.3'],
                [3,'Device 003','123456789012003','ON','2026-06-18 05:40:00','Quezon City Hub','9,776.8'],
            ]} />
        </>
    );
}

function GeoFence() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Geo-fence" type="select" placeholder="Select fence" />
                <SelInput label="Event" type="select" options={['Enter','Exit','Both']} />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Fence Name','Event','Time','Location']} rows={[
                [1,'Device 001','123456789012001','Manila Depot Zone','Exit','2026-06-18 06:00:05','Manila Warehouse'],
                [2,'Device 004','123456789012004','Pasig Distribution Zone','Enter','2026-06-18 07:42:18','Pasig City'],
                [3,'Device 007','123456789012007','Taguig Cold Storage Zone','Enter','2026-06-18 07:58:03','Taguig City'],
            ]} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  STATE STATISTICS                                              */
/* ══════════════════════════════════════════════════════════════ */
function StateStatistics() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter showModel showSub />
                <SelInput label="State" type="select" options={['Online','Offline','Moving','Parked','No GPS']} />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','State','Duration','Start Time','End Time','Location']} rows={[
                [1,'Device 001','123456789012001','Moving','3h 30m','2026-06-18 06:00','2026-06-18 09:30','Makati City'],
                [2,'Device 002','123456789012002','Parked','5h 12m','2026-06-18 02:10','2026-06-18 07:22','Quezon City'],
                [3,'Device 004','123456789012004','Offline','12h 04m','2026-06-17 21:00','2026-06-18 09:04','Pasig City'],
                [4,'Device 008','123456789012008','No GPS','1h 15m','2026-06-18 08:00','2026-06-18 09:15','Caloocan City'],
            ]} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  STATE STATISTICS — Offline / Online                           */
/* ══════════════════════════════════════════════════════════════ */
function AccountFilterBar() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <select style={{ padding: '7px 32px 7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', minWidth: 200, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23999\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                <option>NextGen PNG(Stock8/Total8)</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: '#3b82f6' }} /> Sub-account devices
            </label>
            <button style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/></svg>Search
            </button>
            <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Export</button>
                <button style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Print</button>
                <button style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="4" height="4" rx="1"/><rect x="6" y="1" width="4" height="4" rx="1"/><rect x="11" y="1" width="2" height="4" rx="0.5"/><rect x="1" y="7" width="4" height="4" rx="1"/><rect x="6" y="7" width="4" height="4" rx="1"/><rect x="11" y="7" width="2" height="4" rx="0.5"/></svg>▾
                </button>
            </div>
        </div>
    );
}

function OfflinePage() {
    return (
        <>
            <AccountFilterBar />
            <EmptyTable cols={['No.','Device Name','IMEI','Model','Account','SIM','Phone','Offline reason','Offline Duration','Offline duration (original data)','Offline Time','Coordinates','Alert address']} rows={[
                [1,'Device 004','123456789012004','TRK-2201','NextGen PNG','89014103211118510720','+63 917 111 2222','Power Cut','12h 04m','12h 04m','2026-06-18 09:04:00','14.6200, 121.0200','Pasig City'],
                [2,'Device 008','123456789012008','TRK-8834','NextGen PNG','89014103211118510721','+63 917 333 4444','GSM Signal Loss','3h 22m','3h 22m','2026-06-18 06:36:00','14.5650, 121.0050','Caloocan City'],
            ]} />
        </>
    );
}

function OnlinePage() {
    return (
        <>
            <AccountFilterBar />
            <EmptyTable cols={['No.','Device Name','IMEI','Model','Account','SIM','Phone','Coordinates','Alert address']} rows={[
                [1,'Device 001','123456789012001','TRK-4821','NextGen PNG','89014103211118510722','+63 917 555 6666','14.5995, 120.9842','Manila'],
                [2,'Device 003','123456789012003','TRK-7714','NextGen PNG','89014103211118510723','+63 917 777 8888','14.5800, 120.9700','Manila'],
                [3,'Device 005','123456789012005','TRK-9982','NextGen PNG','89014103211118510724','+63 917 999 0000','14.5700, 120.9900','Manila'],
            ]} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  ALERT STATISTICS                                              */
/* ══════════════════════════════════════════════════════════════ */
// Traccar's real event types (GET /api/notifications/types) — events of type "alarm" carry a
// sub-type in their Data column (Position.ALARM_* constants), shown alongside the base type.
const ALERT_TYPE_OPTIONS = [
    ['commandResult', 'Command result'], ['deviceOnline', 'Status online'],
    ['deviceUnknown', 'Status unknown'], ['deviceOffline', 'Status offline'],
    ['deviceInactive', 'Device inactive'], ['queuedCommandSent', 'Queued command sent'],
    ['deviceMoving', 'Device moving'], ['deviceStopped', 'Device stopped'],
    ['deviceOverspeed', 'Speed limit exceeded'], ['deviceFuelDrop', 'Fuel drop'],
    ['deviceFuelIncrease', 'Fuel increase'], ['geofenceEnter', 'Geofence entered'],
    ['geofenceExit', 'Geofence exited'], ['proximityEnter', 'Linked device nearby'],
    ['proximityExit', 'Linked device away'], ['unaccompaniedMotion', 'Unaccompanied motion'],
    ['alarm', 'Alarm'], ['ignitionOn', 'Ignition on'], ['ignitionOff', 'Ignition off'],
    ['maintenance', 'Maintenance required'], ['driverChanged', 'Driver changed'], ['media', 'Media'],
];
const ALERT_TYPE_LABELS = Object.fromEntries(ALERT_TYPE_OPTIONS);
const ALARM_DATA_LABELS = {
    general: 'General', sos: 'SOS', vibration: 'Vibration', movement: 'Movement',
    lowspeed: 'Low Speed', overspeed: 'Overspeed', fallDown: 'Fall Down', lowPower: 'Low Power',
    lowBattery: 'Low Battery', fault: 'Fault', powerOff: 'Power Off', powerOn: 'Power On',
    door: 'Door', lock: 'Lock', unlock: 'Unlock', geofence: 'Geofence', geofenceEnter: 'Geofence Enter',
    geofenceExit: 'Geofence Exit', gpsAntennaCut: 'GPS Antenna Cut', accident: 'Accident', tow: 'Tow',
    idle: 'Idle', hardAcceleration: 'Hard Acceleration', hardBraking: 'Hard Braking',
    hardCornering: 'Hard Cornering', jamming: 'Jamming', temperature: 'Temperature', parking: 'Parking',
    bonnet: 'Bonnet', footBrake: 'Foot Brake', fuelLeak: 'Fuel Leak', tampering: 'Tampering',
    removing: 'Removing',
};
const alertTypeLabel = (type) => ALERT_TYPE_LABELS[type] || humanize(type);
const alarmDataLabel  = (data) => data ? (ALARM_DATA_LABELS[data] || humanize(data)) : '—';
const fmtCoords = (lat, lng) => (lat != null && lng != null) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '—';

function exportAlertsCsv(rows) {
    const header = ['No.','Device Name','IMEI','Model','Account','Alert Type','Data','Alert Time','Position Time','Speed (km/h)','Coordinates','Alert address'];
    const lines = [header.join(',')];
    rows.forEach((r, i) => {
        const cells = [
            i + 1, r.deviceName, r.imei, r.model, r.account,
            alertTypeLabel(r.type), alarmDataLabel(r.data), fmtTime(r.eventTime), fmtTime(r.positionTime),
            r.speed, fmtCoords(r.latitude, r.longitude), r.address,
        ];
        lines.push(cells.map(c => `"${String(c ?? '—').replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'alert-details.csv'; a.click();
    URL.revokeObjectURL(url);
}

function AlertDetails() {
    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [type, setType]         = useState('');
    const [from, setFrom]         = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toLocalInput(d); });
    const [to, setTo]             = useState(() => toLocalInput(new Date()));
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const search = async (overrides = {}) => {
        const f = overrides.from ?? from, t = overrides.to ?? to;
        const dId = 'deviceId' in overrides ? overrides.deviceId : deviceId;
        const ty  = 'type' in overrides ? overrides.type : type;
        setLoading(true);
        setError('');
        try {
            const params = { from: new Date(f).toISOString(), to: new Date(t).toISOString() };
            if (dId) params.deviceId = dId;
            if (ty)  params.type = ty;
            const res = await api.getAlertEvents(params);
            setRows(res.data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load alert events.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        const d = new Date(); d.setHours(0,0,0,0);
        setDeviceId(''); setType(''); setFrom(toLocalInput(d)); setTo(toLocalInput(new Date()));
        setRows([]); setError('');
    };

    const COLS = ['No.','Device Name','IMEI','Model','Account','Alert Type','Data','Alert Time','Position Time','Speed (km/h)','Coordinates','Alert address'];

    return (
        <div>
            {/* Filter row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>Alert Time :</span>
                <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <span style={{ color: '#9ca3af' }}>-</span>
                <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 170 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select value={type} onChange={e => setType(e.target.value)}
                    style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option value="">All alert types</option>
                    {ALERT_TYPE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                <button onClick={() => search()} style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/></svg>Search
                </button>
                <button onClick={reset} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            {/* Action row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button onClick={() => exportAlertsCsv(rows)} disabled={!rows.length}
                        style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: rows.length ? '#374151' : '#cbd5e1', fontSize: 13, cursor: rows.length ? 'pointer' : 'not-allowed' }}>Export</button>
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
                    <thead>
                        <tr>
                            {COLS.map(c => <th key={c} style={TH}>{c}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : error ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#ef4444' }}>{error}</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={r.id}>
                                <td style={TD}>{i + 1}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.model ?? '—'}</td>
                                <td style={TD}>{r.account ?? '—'}</td>
                                <td style={TD}>{alertTypeLabel(r.type)}</td>
                                <td style={TD}>{alarmDataLabel(r.data)}</td>
                                <td style={TD}>{fmtTime(r.eventTime)}</td>
                                <td style={TD}>{fmtTime(r.positionTime)}</td>
                                <td style={TD}>{r.speed ?? '—'}</td>
                                <td style={TD}>{fmtCoords(r.latitude, r.longitude)}</td>
                                <td style={TD}>{r.address ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  PAGE MAP                                                      */
/* ══════════════════════════════════════════════════════════════ */
const PAGES = {
    'Internal Battery':              InternalBattery,
    'External Battery':              ExternalBattery,
    'Fuel Consumption':              FuelConsumption,
    'Current fuel Value':            CurrentFuelValue,
    'Temperature & Humidity':        TemperatureHumidity,
    'Driver Behavior':               DriverBehavior,
    'Positioning & Battery':         PositioningBattery,
    'Logistics':                     Logistics,
    'Travel statistics (OBD)':       TravelStatisticsOBD,
    'Vehicle fault statistics (OBD)':VehicleFaultOBD,
    'Track Details':                 TrackDetails,
    'Mileage':                       Mileage,
    'Trips':                         Trips,
    'Overspeed':                     Overspeed,
    'Parking':                       Parking,
    'Idling':                        Idling,
    'Ignition':                      Ignition,
    'Geo Fence':                     GeoFence,
    'State Statistics':              StateStatistics,
    'Offline':                       OfflinePage,
    'Online':                        OnlinePage,
    'Alert Details':                 AlertDetails,
};

/* ══════════════════════════════════════════════════════════════ */
/*  ROOT EXPORT                                                   */
/* ══════════════════════════════════════════════════════════════ */
export default function ReportPage({ reportSection }) {
    const Content = PAGES[reportSection] || (() => (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>Select a report from the sidebar.</div>
    ));

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{reportSection || 'Report'}</h2>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <Content />
            </div>
        </div>
    );
}
