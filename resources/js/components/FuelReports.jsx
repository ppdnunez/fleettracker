import { useState, useEffect } from 'react';
import { api } from '../api.js';

/**
 * Fuel level, fuel events, and the slow-siphon watch.
 *
 * Readings are position attributes that arrive on their own packets, so the backend walks history
 * back for the newest genuine value and returns it with the time it was taken — a fuel level from
 * two hours ago is shown as two hours old, not as the current level.
 */

const TH = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: '#cfdcf0', borderBottom: '2px solid #1e2c46', whiteSpace: 'nowrap', background: '#16233c' };
const TD = { padding: '10px 12px', fontSize: 12.5, borderBottom: '1px solid #1e2c46', color: '#cfdcf0' };
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

/** A tank as a bar. Colour is by level, so a near-empty tank is visible without reading the number. */
function TankBar({ percent }) {
    const pct  = Math.max(0, Math.min(100, percent ?? 0));
    const tone = pct <= 15 ? '#ef4444' : pct <= 30 ? '#f59e0b' : '#4ade80';
    return (
        <div style={{ height: 8, borderRadius: 4, background: '#16233c', overflow: 'hidden', minWidth: 120 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: tone }} />
        </div>
    );
}

/**
 * A tank figure in both units: litres, which is what Traccar's events are measured in, and the
 * share of the tank, which is what tells you whether 28 litres is a rounding error or a theft.
 * The percentage needs a tank capacity, so it is simply absent on devices that have none set
 * rather than shown as a guess.
 */
function Litres({ value, percent, note }) {
    if (value == null && percent == null) return <td style={TD}>—</td>;

    return (
        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 600, color: '#eaeff9' }}>{value == null ? '—' : `${value.toFixed(1)} L`}</div>
            {percent != null && <div style={{ fontSize: 11, color: '#9daec9' }}>{percent.toFixed(1)}%</div>}
            {note && <div style={{ fontSize: 10.5, color: '#5e7094' }}>{note}</div>}
        </td>
    );
}

function DeviceFilter({ devices, deviceId, setDeviceId }) {
    return (
        <select value={deviceId} onChange={e => setDeviceId(e.target.value)} style={{ ...input, cursor: 'pointer', minWidth: 180 }}>
            <option value="">All devices</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
    );
}

function useDevices() {
    const [devices, setDevices] = useState([]);
    useEffect(() => { api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {}); }, []);
    return devices;
}

/* ── Fuel level ─────────────────────────────────────────────── */

export function FuelLevelReport() {
    const devices = useDevices();
    const [deviceId, setDeviceId] = useState('');
    const [hours, setHours]       = useState(6);
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const params = { hours };
            if (deviceId) params.deviceId = deviceId;
            setData((await api.getFuelReadings(params)).data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fuel readings.');
            setData(null);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [hours, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const all       = data?.devices ?? [];
    const reporting = all.filter(d => d.hasFuel);
    const silent    = all.filter(d => !d.hasFuel);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <DeviceFilter devices={devices} deviceId={deviceId} setDeviceId={setDeviceId} />
                <span style={{ fontSize: 12.5, color: '#9daec9' }}>Look back</span>
                <select value={hours} onChange={e => setHours(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
                    {[2, 6, 12, 24, 48, 72].map(h => <option key={h} value={h}>{h} hours</option>)}
                </select>
                <button onClick={load} style={button}>{loading ? 'Loading…' : 'Refresh'}</button>
            </div>

            {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}

            {reporting.map(d => (
                <div key={d.deviceId} style={{ border: '1px solid #1e2c46', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#16233c', borderBottom: '1px solid #1e2c46' }}>
                        <strong style={{ fontSize: 13.5, color: '#eaeff9' }}>{d.deviceName}</strong>
                        <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#5e7094' }}>{d.imei}</span>
                        {d.sensorType && <span style={{ fontSize: 11.5, color: '#9daec9' }}>{d.sensorType}</span>}
                        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: d.level?.stale ? '#fcd34d' : '#5e7094' }}>
                            {age(d.level?.ageMinutes ?? d.litres?.ageMinutes)}{d.level?.stale ? ' · stale' : ''}
                        </span>
                    </div>

                    <div style={{ padding: 14, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 190 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#9daec9', textTransform: 'uppercase', letterSpacing: 0.4 }}>Level</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#eaeff9', lineHeight: 1.25 }}>
                                {d.level?.value != null ? `${d.level.value}%` : d.litres?.value != null ? `${d.litres.value} L` : '—'}
                            </div>
                            {d.level?.value != null && <TankBar percent={d.level.value} />}

                            {/* Percent and litres are different facts, and only litres drives
                                Traccar's drop events — so a derived figure says it is derived. */}
                            <div style={{ marginTop: 6, fontSize: 11.5, color: '#5e7094' }}>
                                {d.litres?.value != null
                                    ? `${d.litres.value} L reported`
                                    : d.derivedLitres != null
                                        ? `≈ ${d.derivedLitres} L (from ${d.fuelCapacity} L capacity)`
                                        : 'No litres — set a fuel capacity to convert'}
                            </div>
                        </div>

                        {d.tanks.length > 0 && (
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#9daec9', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Additional tanks</div>
                                {d.tanks.map(t => (
                                    <div key={t.tank} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                        <span style={{ fontSize: 12, color: '#cfdcf0', width: 54 }}>Tank {t.tank}</span>
                                        <TankBar percent={t.value} />
                                        <span style={{ fontSize: 12, color: '#eaeff9', fontWeight: 700 }}>{t.value}%</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {d.probes.length > 0 && (
                            <div style={{ flex: 1, minWidth: 300 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead><tr>{['Probe', 'Reading', 'Range', 'Level'].map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                                    <tbody>
                                        {d.probes.map(p => (
                                            <tr key={p.index}>
                                                <td style={TD}>
                                                    {p.name || p.mac || p.sensorId || `#${p.index}`}
                                                    {/* Battery and error had their own columns, but a wired probe
                                                        reports neither, so both stood empty on every row. They only
                                                        appear now when the probe actually sends them. */}
                                                    {p.battery != null && <span style={{ marginLeft: 8, fontSize: 11, color: '#9daec9' }}>batt {p.battery}%</span>}
                                                    {p.error && <div style={{ fontSize: 11, color: '#fca5a5' }}>{p.error}</div>}
                                                </td>
                                                <td style={TD}>{p.value}</td>
                                                <td style={TD}>{p.range ?? '—'}</td>
                                                <td style={{ ...TD, fontWeight: 700 }}>{p.percent != null ? `${p.percent}%` : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            ))}

            {!loading && reporting.length === 0 && (
                <div style={{ border: '1px dashed #24344f', borderRadius: 10, padding: 32, textAlign: 'center', color: '#9daec9', fontSize: 13 }}>
                    No fuel readings in the last {data?.lookbackHours ?? hours} hours.
                    <div style={{ marginTop: 6, fontSize: 12, color: '#5e7094' }}>
                        Only devices with a fuel probe report these, and readings arrive on their own packets rather than with every fix.
                    </div>
                </div>
            )}

            {silent.length > 0 && reporting.length > 0 && (
                <p style={{ fontSize: 12, color: '#5e7094' }}>No readings from: {silent.map(d => d.deviceName).join(', ')}</p>
            )}
        </div>
    );
}

/* ── Fuel events ────────────────────────────────────────────── */

export function FuelEventsReport() {
    const devices = useDevices();
    const [deviceId, setDeviceId] = useState('');
    const [hours, setHours]       = useState(24);
    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const params = {
                from: new Date(Date.now() - hours * 3600000).toISOString(),
                to:   new Date().toISOString(),
                ...(deviceId ? { deviceId } : {}),
            };
            setRows((await api.getFuelEvents(params)).data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fuel events.');
            setRows([]);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [hours, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const thresholdCount = rows.filter(r => r.source === 'threshold').length;

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

            {/* Traccar's drop/increase events need a litres value and a threshold; the probe's own
                alarms need neither. Saying which are missing is more use than an empty column. */}
            {rows.length > 0 && thresholdCount === 0 && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: '#33260c', border: '1px solid #7c5e10', borderRadius: 8, fontSize: 12.5, color: '#fcd34d' }}>
                    All of these came from the sensor itself. Traccar has raised no fuel drop or increase events,
                    which needs a <b>fuelDropThreshold</b> and a fuel value in litres — see Settings → Fuel Thresholds.
                </div>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                    <thead><tr>{['Time', 'Device', 'Event', 'Source', 'Before', 'After', 'Change'].map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: 36, color: '#5e7094' }}>Loading…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: 36, color: '#5e7094' }}>No fuel events in this period.</td></tr>
                        ) : rows.map(r => (
                            <tr key={r.id}>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtTime(r.occurredAt)}</td>
                                <td style={TD}>{r.deviceName ?? '—'}</td>
                                <td style={{ ...TD, fontWeight: 700, color: r.kind === 'refuel' || r.kind === 'deviceFuelIncrease' ? '#4ade80' : '#fca5a5' }}>
                                    {r.label}{r.alarmType ? ` (${r.alarmType})` : ''}
                                </td>
                                <td style={TD}>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 11, fontSize: 11, fontWeight: 700,
                                        background: r.source === 'threshold' ? '#152a4a' : '#0f2b24',
                                        color:      r.source === 'threshold' ? '#7fc4ff' : '#4ade80',
                                    }}>{r.source === 'threshold' ? 'Traccar threshold' : 'Sensor'}</span>
                                </td>
                                <Litres value={r.before} percent={r.beforePercent} />
                                {/* A probe alarm describes no change, so its own column shows the
                                    level the tank was at when it fired instead of an empty dash. */}
                                {r.after == null && r.atEvent != null
                                    ? <Litres value={r.atEvent} percent={r.atEventPercent} note="at alarm" />
                                    : <Litres value={r.after} percent={r.afterPercent} />}
                                <td style={{ ...TD, fontWeight: 700, color: r.change == null ? '#5e7094' : r.change < 0 ? '#fca5a5' : '#4ade80' }}>
                                    {r.change == null ? '—' : `${r.change > 0 ? '+' : ''}${r.change.toFixed(1)} L`}
                                    {r.changePercent != null && (
                                        <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>
                                            {r.changePercent > 0 ? '+' : ''}{r.changePercent.toFixed(1)}% of tank
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ── Theft watch ────────────────────────────────────────────── */

export function FuelTheftWatch() {
    const devices = useDevices();
    const [deviceId, setDeviceId] = useState('');
    const [minutes, setMinutes]   = useState(30);
    const [drop, setDrop]         = useState(3);
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const load = async () => {
        setLoading(true); setError('');
        try {
            const params = { minutes, dropPercent: drop };
            if (deviceId) params.deviceId = deviceId;
            setData((await api.getFuelTheftScan(params)).data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to run the theft scan.');
            setData(null);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [minutes, drop, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const rows      = data?.devices ?? [];
    const suspected = rows.filter(r => r.suspected);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <DeviceFilter devices={devices} deviceId={deviceId} setDeviceId={setDeviceId} />
                <span style={{ fontSize: 12.5, color: '#9daec9' }}>Window</span>
                <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
                    {[15, 30, 60, 120, 240].map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
                <span style={{ fontSize: 12.5, color: '#9daec9' }}>Alert on drop over</span>
                <input type="number" min="0.5" max="100" step="0.5" value={drop} onChange={e => setDrop(Number(e.target.value))} style={{ ...input, width: 80 }} />
                <span style={{ fontSize: 12.5, color: '#9daec9' }}>%</span>
                <button onClick={load} style={button}>{loading ? 'Scanning…' : 'Rescan'}</button>
            </div>

            {/* Why this exists at all, stated where it is used. */}
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#5e7094', maxWidth: 780, lineHeight: 1.6 }}>
                Traccar's own fuel-drop events compare two consecutive positions, so a slow siphon never trips them —
                40 litres drawn over fifteen minutes is a few tenths between any two fixes. This compares the whole
                window instead, and only flags a vehicle that was <b>stationary with the ignition off throughout</b>,
                so ordinary consumption is not reported as theft.
            </p>

            {error && <div style={{ marginBottom: 14, padding: '10px 14px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}

            {suspected.length > 0 && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5', fontWeight: 700 }}>
                    {suspected.length} vehicle{suspected.length === 1 ? '' : 's'} lost fuel while parked in the last {data.windowMinutes} minutes.
                </div>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                    <thead><tr>{['Device', 'Window', 'Before', 'After', 'Drop', 'Vehicle state', 'Verdict'].map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: 36, color: '#5e7094' }}>Scanning…</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: 36, color: '#5e7094' }}>
                                No fuel drop detected. A vehicle needs at least two fuel readings in the window to be assessed.
                            </td></tr>
                        ) : rows.map(r => (
                            <tr key={r.deviceId} style={r.suspected ? { background: '#3b1418' } : undefined}>
                                <td style={{ ...TD, fontWeight: 700 }}>{r.deviceName}</td>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtTime(r.from)} → {fmtTime(r.to)}</td>
                                <td style={TD}>{r.beforeLevel != null ? `${r.beforeLevel}%` : '—'}</td>
                                <td style={TD}>{r.afterLevel != null ? `${r.afterLevel}%` : '—'}</td>
                                <td style={{ ...TD, fontWeight: 700, color: r.suspected ? '#fca5a5' : '#cfdcf0' }}>
                                    {r.dropPercent}%{r.dropLitres != null ? ` · ${r.dropLitres} L` : ''}
                                </td>
                                <td style={TD}>{r.moved ? 'Moved / ignition on' : 'Parked, ignition off'}</td>
                                <td style={{ ...TD, fontWeight: 700, color: r.suspected ? '#fca5a5' : '#5e7094' }}>
                                    {r.suspected ? 'Investigate' : r.moved ? 'Consumption while driving' : 'Below threshold'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
