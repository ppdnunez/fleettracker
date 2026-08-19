import { useState, useEffect } from 'react';
import { api } from '../api.js';

/**
 * Engine data from the OBD-II / CAN bus: live readings, the series behind them, and fault codes.
 *
 * Two presentation rules carry the awkward parts of this data:
 *
 *   - Every value is shown with its own age, because OBD frames are sparse. A plain GPS packet
 *     carries none of these keys, so the newest engine reading is routinely older than the newest
 *     position, and showing it as "now" would be a lie a workshop could act on.
 *   - The dash odometer and Traccar's GPS distance are never put in the same column. They measure
 *     different things and always disagree; side by side and labelled, the difference is
 *     informative, merged it is a fabricated mileage.
 */

const TH = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: '#cfdcf0', borderBottom: '2px solid #1e2c46', whiteSpace: 'nowrap', background: '#16233c' };
const TD = { padding: '9px 12px', fontSize: 12.5, borderBottom: '1px solid #1e2c46', color: '#cfdcf0' };
const input  = { padding: '7px 10px', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, color: '#cfdcf0', background: '#111c33', outline: 'none' };
const button = { padding: '7px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };

function age(minutes) {
    if (minutes == null) return 'unknown';
    if (minutes < 1)  return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h ${minutes % 60}m ago` : `${Math.floor(hours / 24)}d ago`;
}

function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString();
}

function useDevices() {
    const [devices, setDevices] = useState([]);
    useEffect(() => { api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {}); }, []);
    return devices;
}

function DeviceFilter({ devices, deviceId, setDeviceId }) {
    return (
        <select value={deviceId} onChange={e => setDeviceId(e.target.value)} style={{ ...input, cursor: 'pointer', minWidth: 180 }}>
            <option value="">All devices</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
    );
}

/** Shown wherever a device reports nothing — the honest answer, with what it would take to change. */
function NoObdNotice({ hours }) {
    return (
        <div style={{ border: '1px dashed #24344f', borderRadius: 10, padding: 28, textAlign: 'center', color: '#9daec9', fontSize: 13, lineHeight: 1.7 }}>
            No engine data in the last {hours} hours.
            <div style={{ marginTop: 6, fontSize: 12, color: '#5e7094', maxWidth: 660, margin: '6px auto 0' }}>
                These figures come from a vehicle's OBD-II / CAN bus, so they appear only for devices wired to
                one and only on the frames that carry them — an ordinary GPS packet has none. A vehicle with no
                OBD accessory fitted will always be empty here.
            </div>
        </div>
    );
}

/** One reading, with the unit it is actually stored in and how old it is. */
function Metric({ label, value, unit, stale, ageMinutes, tone }) {
    if (value == null) return null;

    return (
        <div style={{ minWidth: 118 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9daec9', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: tone ?? '#eaeff9', lineHeight: 1.3 }}>
                {value}<span style={{ fontSize: 12, fontWeight: 600, color: '#5e7094', marginLeft: 3 }}>{unit}</span>
            </div>
            <div style={{ fontSize: 10.5, color: stale ? '#fcd34d' : '#5e7094' }}>
                {age(ageMinutes)}{stale ? ' · stale' : ''}
            </div>
        </div>
    );
}

function FaultPill({ code, active }) {
    return (
        <span style={{
            padding: '2px 8px', borderRadius: 11, fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
            background: active ? '#3b1418' : '#16233c',
            color:      active ? '#fca5a5' : '#9daec9',
            border: `1px solid ${active ? '#7f1d1d' : '#24344f'}`,
        }}>{code}</span>
    );
}

/* ── Engine (current) ───────────────────────────────────────── */

export function ObdEngineReport() {
    const devices = useDevices();
    const [deviceId, setDeviceId] = useState('');
    const [hours, setHours]       = useState(6);
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            setData((await api.getObdCurrent({ hours, ...(deviceId ? { deviceId } : {}) })).data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load engine readings.');
            setData(null);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [hours, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const rows      = data?.devices ?? [];
    const reporting = rows.filter(d => d.hasObd);
    const silent    = rows.filter(d => !d.hasObd);

    const m = (d, key) => d.metrics?.[key] ?? {};

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <DeviceFilter devices={devices} deviceId={deviceId} setDeviceId={setDeviceId} />
                <select value={hours} onChange={e => setHours(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
                    {[1, 6, 24, 72].map(h => <option key={h} value={h}>Last {h === 1 ? 'hour' : `${h} hours`}</option>)}
                </select>
                <button onClick={load} style={button}>{loading ? 'Loading…' : 'Refresh'}</button>
            </div>

            {error && <div style={{ padding: '10px 14px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}

            {reporting.map(d => {
                const coolant = m(d, 'coolantTemp');
                // Over about 105 °C an engine is into the range where damage starts, so the number
                // is coloured rather than left for someone to notice.
                const coolantTone = coolant.value == null ? undefined : coolant.value >= 105 ? '#fca5a5' : coolant.value >= 100 ? '#fcd34d' : undefined;
                const faults = d.dtcs?.codes ?? [];

                return (
                    <div key={d.deviceId} style={{ border: '1px solid #1e2c46', borderRadius: 10, overflow: 'hidden', background: '#111c33' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#16233c', borderBottom: '1px solid #1e2c46', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 13.5, color: '#eaeff9' }}>{d.deviceName}</strong>
                            <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#5e7094' }}>{d.imei}</span>
                            {d.vehicleModel && <span style={{ fontSize: 11.5, color: '#9daec9' }}>{d.vehicleModel}</span>}
                            {d.vin && <span style={{ fontSize: 11.5, color: '#9daec9' }}>VIN {d.vin}</span>}
                            {/* The dongle's own state: a sleeping or upgrading unit explains a gap
                                in the readings that would otherwise look like a fault. */}
                            {d.obdStatus && (
                                <span style={{
                                    padding: '2px 8px', borderRadius: 11, fontSize: 11, fontWeight: 700,
                                    background: d.obdStatus.code === 0x5A ? '#0f2b24' : '#33260c',
                                    color:      d.obdStatus.code === 0x5A ? '#4ade80' : '#fcd34d',
                                }} title={`obdStatus ${d.obdStatus.hex}`}>{d.obdStatus.label}</span>
                            )}
                            {d.obdCompatible === false && (
                                <span style={{ padding: '2px 8px', borderRadius: 11, fontSize: 11, fontWeight: 700, background: '#3b1418', color: '#fca5a5' }}>
                                    Vehicle not OBD-compatible
                                </span>
                            )}
                            {faults.length > 0 && (
                                <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
                                    {faults.map(f => <FaultPill key={f.code} code={f.code} active />)}
                                </span>
                            )}
                        </div>

                        <div style={{ padding: 14, display: 'flex', gap: 26, flexWrap: 'wrap' }}>
                            {/* Each metric carries its own value, timestamp and staleness. */}
                            <Metric label="Engine speed" unit="rpm"  {...m(d, 'rpm')} />
                            <Metric label="Coolant"      unit="°C"   {...coolant} tone={coolantTone} />
                            <Metric label="Engine load"  unit="%"    {...m(d, 'engineLoad')} />
                            <Metric label="Throttle"     unit="%"    {...m(d, 'throttle')} />
                            <Metric label="Consumption"  unit="L/h"  {...m(d, 'fuelConsumption')} />
                            <Metric label="Fuel used"    unit="L"    {...m(d, 'fuelUsed')} />
                            {/* Shared keys: shown only when they arrived on an OBD frame, because
                                the tracker writes `power` and the BLE probe writes `fuelLevel`. */}
                            <Metric label="OBD supply"   unit="V"    {...(d.shared?.power ?? {})} />
                            <Metric label="Tank level"   unit="%"    {...(d.shared?.fuelLevel ?? {})} />
                        </div>

                        {d.fuelLevelAmbiguous && (
                            <div style={{ margin: '0 14px 12px', padding: '9px 13px', background: '#33260c', border: '1px solid #7c5e10', borderRadius: 7, fontSize: 12, color: '#fcd34d', lineHeight: 1.6 }}>
                                <b>Two sources are writing the tank level on this vehicle.</b> The BLE probe and the OBD
                                stream both use <code style={{ fontFamily: 'monospace' }}>fuelLevel</code>, and Traccar keeps
                                whichever module the device sent last — so the Fuel module and this one can disagree. The
                                figure above is the one that arrived on an OBD frame. Decide which source is authoritative
                                before trusting either for billing.
                            </div>
                        )}

                        {d.checksumFailures > 0 && (
                            <div style={{ margin: '0 14px 12px', padding: '9px 13px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 7, fontSize: 12, color: '#fca5a5', lineHeight: 1.6 }}>
                                {d.checksumFailures} OBD frame{d.checksumFailures === 1 ? '' : 's'} failed their checksum in this
                                window and were not read. Data is arriving but being discarded — usually wiring or a dongle fault,
                                not a silent vehicle.
                            </div>
                        )}

                        {/* Only when the decoder met something it could not fully interpret. */}
                        {(d.diagnostics?.obdRaw || d.diagnostics?.obdSubType != null) && (
                            <div style={{ margin: '0 14px 12px', padding: '9px 13px', background: '#16233c', border: '1px solid #24344f', borderRadius: 7, fontSize: 11.5, color: '#9daec9', lineHeight: 1.6 }}>
                                {/* Each field is the newest value of that key, so they may come
                                    from different frames — said plainly rather than implied. */}
                                <b style={{ color: '#cfdcf0' }}>Undecoded fields</b>
                                <span style={{ color: '#5e7094' }}> (newest of each)</span>{' '}
                                {['obdMessageId', 'obdVehicleType', 'obdSubType'].filter(k => d.diagnostics[k] != null)
                                    .map(k => `${k} ${d.diagnostics[k]}`).join(' · ')}
                                {d.diagnostics.obdRaw && (
                                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#5e7094', marginTop: 3, wordBreak: 'break-all' }}>{d.diagnostics.obdRaw}</div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', padding: '0 14px 14px' }}>
                            {/* The two comparisons worth making explicit — see the file comment. */}
                            <div style={{ minWidth: 250 }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9daec9', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Distance</div>
                                <div style={{ fontSize: 12.5, color: '#cfdcf0' }}>
                                    Dash odometer <b style={{ color: '#eaeff9' }}>{d.distance.obdOdometerKm != null ? `${d.distance.obdOdometerKm.toLocaleString()} km` : '—'}</b>
                                </div>
                                <div style={{ fontSize: 12.5, color: '#cfdcf0' }}>
                                    GPS since registration <b style={{ color: '#eaeff9' }}>{d.distance.gpsTotalKm != null ? `${d.distance.gpsTotalKm.toLocaleString()} km` : '—'}</b>
                                </div>
                                <div style={{ fontSize: 10.5, color: '#5e7094', marginTop: 3, lineHeight: 1.5 }}>
                                    Different measurements, not a discrepancy: the dash counts the vehicle's whole life,
                                    Traccar counts only since this device was fitted.
                                </div>
                            </div>

                            {d.speed.obdKmh != null && (
                                <div style={{ minWidth: 200 }}>
                                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9daec9', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Speed cross-check</div>
                                    <div style={{ fontSize: 12.5, color: '#cfdcf0' }}>
                                        OBD <b style={{ color: '#eaeff9' }}>{d.speed.obdKmh} km/h</b> · GPS <b style={{ color: '#eaeff9' }}>{d.speed.gpsKmh ?? '—'} km/h</b>
                                    </div>
                                    {d.speed.gpsKmh != null && Math.abs(d.speed.obdKmh - d.speed.gpsKmh) > 8 && (
                                        <div style={{ fontSize: 10.5, color: '#fcd34d', marginTop: 3, lineHeight: 1.5 }}>
                                            The two disagree by {Math.abs(d.speed.obdKmh - d.speed.gpsKmh).toFixed(1)} km/h,
                                            which can mean a mis-scaled wheel-speed signal.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {faults.length > 0 && (
                            <div style={{ padding: '10px 14px', borderTop: '1px solid #1e2c46', background: '#16233c' }}>
                                {faults.map(f => (
                                    <div key={f.code} style={{ fontSize: 12, color: '#cfdcf0', marginBottom: 3 }}>
                                        <b style={{ fontFamily: 'monospace', color: '#fca5a5' }}>{f.code}</b>
                                        {' — '}{f.description || f.subsystem || f.system || 'unrecognised code'}
                                        {f.generic === false && <span style={{ color: '#5e7094' }}> (manufacturer-specific)</span>}
                                    </div>
                                ))}
                                <div style={{ fontSize: 10.5, color: '#5e7094', marginTop: 4 }}>Reported {fmtTime(d.dtcs?.reportedAt)}</div>
                            </div>
                        )}
                    </div>
                );
            })}

            {!loading && reporting.length === 0 && <NoObdNotice hours={data?.lookbackHours ?? hours} />}

            {silent.length > 0 && reporting.length > 0 && (
                <p style={{ fontSize: 12, color: '#5e7094' }}>No engine data from: {silent.map(d => d.deviceName).join(', ')}</p>
            )}
        </div>
    );
}

/* ── Engine history ─────────────────────────────────────────── */

export function ObdHistoryReport() {
    const devices = useDevices();
    const [deviceId, setDeviceId] = useState('');
    const [hours, setHours]       = useState(24);
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            setRows((await api.getObdHistory({
                from: new Date(Date.now() - hours * 3600000).toISOString(),
                to:   new Date().toISOString(),
                ...(deviceId ? { deviceId } : {}),
            })).data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load engine history.');
            setRows([]);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [hours, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const COLS = ['Time', 'Device', 'RPM', 'Load', 'Throttle', 'Coolant', 'OBD speed', 'GPS speed', 'Consumption', 'Supply', 'State', 'Faults'];
    const v = (r, key, unit) => (r.values?.[key] != null ? `${r.values[key]}${unit}` : '—');

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <DeviceFilter devices={devices} deviceId={deviceId} setDeviceId={setDeviceId} />
                <select value={hours} onChange={e => setHours(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
                    {[6, 24, 72, 168].map(h => <option key={h} value={h}>Last {h < 24 ? `${h} hours` : `${h / 24} days`}</option>)}
                </select>
                <button onClick={load} style={button}>{loading ? 'Loading…' : 'Refresh'}</button>
            </div>

            {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 36, color: '#5e7094' }}>Loading…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ padding: 0 }}><div style={{ padding: 14 }}><NoObdNotice hours={hours} /></div></td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={`${r.deviceId}-${r.recordedAt}-${i}`}>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtTime(r.recordedAt)}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={{ ...TD, fontWeight: 700 }}>{v(r, 'rpm', '')}</td>
                                <td style={TD}>{v(r, 'engineLoad', '%')}</td>
                                <td style={TD}>{v(r, 'throttle', '%')}</td>
                                <td style={{ ...TD, color: r.values?.coolantTemp >= 105 ? '#fca5a5' : undefined }}>{v(r, 'coolantTemp', '°C')}</td>
                                <td style={TD}>{v(r, 'obdSpeed', ' km/h')}</td>
                                <td style={TD}>{r.gpsSpeedKmh != null ? `${r.gpsSpeedKmh} km/h` : '—'}</td>
                                <td style={TD}>{v(r, 'fuelConsumption', ' L/h')}</td>
                                <td style={TD}>{v(r, 'power', ' V')}</td>
                                <td style={TD}>
                                    {/* A failed checksum outranks the status: the frame arrived,
                                        but nothing on this row can be trusted. */}
                                    {r.checksumValid === false
                                        ? <span style={{ color: '#fca5a5', fontWeight: 700 }} title="XOR check failed">Bad checksum</span>
                                        : r.obdStatus
                                            ? <span style={{ color: r.obdStatus.code === 0x5A ? '#9daec9' : '#fcd34d' }} title={r.obdStatus.hex}>{r.obdStatus.label}</span>
                                            : <span style={{ color: '#5e7094' }}>—</span>}
                                </td>
                                <td style={TD}>
                                    {r.dtcs.length === 0 ? <span style={{ color: '#5e7094' }}>—</span>
                                        : <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.dtcs.map(c => <FaultPill key={c} code={c} active />)}</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ── Fault codes ────────────────────────────────────────────── */

export function ObdFaultsReport() {
    const devices = useDevices();
    const [deviceId, setDeviceId] = useState('');
    const [days, setDays]         = useState(7);
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            setRows((await api.getObdFaults({
                from: new Date(Date.now() - days * 86400000).toISOString(),
                to:   new Date().toISOString(),
                ...(deviceId ? { deviceId } : {}),
            })).data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fault codes.');
            setRows([]);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [days, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const active = rows.filter(r => r.active).length;
    const COLS = ['Code', 'Device', 'Meaning', 'First seen', 'Last seen', 'State'];

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <DeviceFilter devices={devices} deviceId={deviceId} setDeviceId={setDeviceId} />
                <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
                    {[1, 7, 30, 90].map(d => <option key={d} value={d}>Last {d === 1 ? 'day' : `${d} days`}</option>)}
                </select>
                <button onClick={load} style={button}>{loading ? 'Loading…' : 'Refresh'}</button>
                {rows.length > 0 && (
                    <span style={{ fontSize: 12, color: active > 0 ? '#fca5a5' : '#5e7094' }}>
                        {active} still set · {rows.length - active} cleared
                    </span>
                )}
            </div>

            {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}

            {/* A stored code repeats on every frame, so these are spans rather than occurrences. */}
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#5e7094', lineHeight: 1.6, maxWidth: 820 }}>
                One row per fault, not per packet: a stored code is re-sent on every OBD frame until it is
                cleared, so each code is tracked from when it first appeared to when it stopped being reported.
                "Cleared" means the vehicle stopped sending it — either it was reset in a workshop, or the
                condition went away on its own.
            </p>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead><tr>{COLS.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 36, color: '#5e7094' }}>Loading…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={COLS.length} style={{ ...TD, textAlign: 'center', padding: 36, color: '#5e7094', lineHeight: 1.7 }}>
                                <span style={{ display: 'inline-block', maxWidth: 620 }}>
                                    No fault codes in this period. That is also what you see when no device is wired to an
                                    OBD bus — the two look identical from here, because a vehicle reporting no faults and a
                                    vehicle reporting nothing both send no codes.
                                </span>
                            </td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={`${r.deviceId}-${r.code}-${r.firstSeen}-${i}`}>
                                <td style={TD}><FaultPill code={r.code} active={r.active} /></td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={TD}>
                                    {r.description || r.subsystem || (r.system ? `${r.system} fault` : 'Unrecognised code')}
                                    <div style={{ fontSize: 10.5, color: '#5e7094' }}>
                                        {r.system ?? 'unknown system'}
                                        {r.generic === false && ' · manufacturer-specific'}
                                        {r.generic === true && ' · standard code'}
                                    </div>
                                </td>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtTime(r.firstSeen)}</td>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtTime(r.lastSeen)}</td>
                                <td style={TD}>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 11, fontSize: 11, fontWeight: 700,
                                        background: r.active ? '#3b1418' : '#0f2b24',
                                        color:      r.active ? '#fca5a5' : '#4ade80',
                                    }}>{r.active ? 'Still set' : 'Cleared'}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
