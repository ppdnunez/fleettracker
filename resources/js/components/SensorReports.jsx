import { useState, useEffect } from 'react';
import { api } from '../api.js';

/**
 * Temperature / humidity and tyre (TPMS) readings.
 *
 * Traccar has no sensor endpoint — every reading is a position attribute — and sensor modules do
 * not ride on every packet, so the latest position usually carries no reading at all. The backend
 * walks a window of history backwards for the newest genuine value and returns it with the time it
 * was really taken (see SensorController).
 *
 * That timestamp is the reason this page exists in the shape it does. For a cold chain or a tyre
 * safety check, "4.0°C, ninety minutes ago" is not the same fact as "4.0°C, now", so every reading
 * is shown with its age and anything past the staleness threshold is marked rather than displayed
 * as if it were live.
 */

const TH = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: '#d5c9b8', borderBottom: '2px solid #2c2c2c', whiteSpace: 'nowrap', background: '#222222' };
const TD = { padding: '10px 12px', fontSize: 12.5, borderBottom: '1px solid #2c2c2c', color: '#d5c9b8' };

const input  = { padding: '7px 10px', border: '1px solid #383838', borderRadius: 6, fontSize: 13, color: '#d5c9b8', background: '#1a1a1a', outline: 'none' };
const button = { padding: '7px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };

const LOOKBACK_OPTIONS = [2, 6, 12, 24, 48, 72];

/** Wording for the sensor keys; anything unmapped falls back to the raw key. */
const SENSOR_LABELS = {
    temp1: 'Temp 1', temp2: 'Temp 2', temp3: 'Temp 3', temp4: 'Temp 4',
    humidity: 'Humidity', humidity2: 'Humidity 2', humidity3: 'Humidity 3', humidity4: 'Humidity 4',
};

function age(minutes) {
    if (minutes == null) return 'unknown';
    if (minutes < 1)   return 'just now';
    if (minutes < 60)  return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString();
}

/** A single reading: the value, and how old it is. Staleness is stated, never hidden. */
function Reading({ label, value, unit, ageMinutes, stale, tone = '#f59e0b' }) {
    return (
        <div style={{
            border: `1px solid ${stale ? '#7c5e10' : '#2c2c2c'}`, borderRadius: 9,
            background: stale ? '#231a06' : '#222222', padding: '9px 12px', minWidth: 128,
        }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9a8a75', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: stale ? '#fcd34d' : tone, lineHeight: 1.3 }}>
                {value == null ? '—' : value}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 2 }}>{unit}</span>
            </div>
            <div style={{ fontSize: 11, color: stale ? '#fcd34d' : '#5a4e42' }}>
                {age(ageMinutes)}{stale ? ' · stale' : ''}
            </div>
        </div>
    );
}

function SensorReport({ mode }) {
    const isTyre = mode === 'tyre';

    const [devices, setDevices]   = useState([]);
    const [deviceId, setDeviceId] = useState('');
    const [hours, setHours]       = useState(6);
    const [data, setData]         = useState(null);
    const [alarms, setAlarms]     = useState([]);
    const [history, setHistory]   = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => {
        api.getTraccarDevices().then(res => setDevices(res.data)).catch(() => {});
    }, []);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const params = { hours };
            if (deviceId) params.deviceId = deviceId;

            const window = {
                from: new Date(Date.now() - hours * 3600000).toISOString(),
                to:   new Date().toISOString(),
                ...(deviceId ? { deviceId } : {}),
            };

            // Alarms and history are supporting detail on this page, so either failing must not
            // cost the readings themselves.
            const [current, raised, series] = await Promise.all([
                api.getSensorReadings(params),
                api.getSensorAlarms(window).catch(() => ({ data: [] })),
                api.getSensorHistory(window).catch(() => ({ data: [] })),
            ]);

            setData(current.data);
            setAlarms((raised.data ?? []).filter(a => a.kind === (isTyre ? 'tyre' : 'climate')));
            setHistory((series.data ?? []).filter(r => (isTyre ? r.tyres.length : r.temperatures.length + r.humidity.length) > 0));
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load sensor readings.');
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [hours, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const all       = data?.devices ?? [];
    const reporting = all.filter(d => (isTyre ? d.tyres.length : d.temperatures.length + d.humidity.length) > 0);
    const silent    = all.filter(d => !reporting.includes(d));

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)} style={{ ...input, cursor: 'pointer', minWidth: 180 }}>
                    <option value="">All devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>

                <span style={{ fontSize: 12.5, color: '#9a8a75' }}>Look back</span>
                <select value={hours} onChange={e => setHours(Number(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
                    {LOOKBACK_OPTIONS.map(h => <option key={h} value={h}>{h} hours</option>)}
                </select>

                <button onClick={load} style={button}>{loading ? 'Loading…' : 'Refresh'}</button>

                {/* Why a lookback control exists at all: readings arrive on their own packets, and
                    a device parked overnight may not have sent one for hours. */}
                <span style={{ fontSize: 12, color: '#5a4e42', marginLeft: 'auto', maxWidth: 460 }}>
                    Shows the newest genuine reading in the window, with the time it was taken —
                    not the latest GPS packet, which usually carries no sensor data.
                </span>
            </div>

            {error && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12.5, color: '#fca5a5' }}>
                    {error}
                </div>
            )}

            {loading && !data ? (
                <p style={{ padding: 40, textAlign: 'center', color: '#5a4e42', fontSize: 13 }}>Loading readings…</p>
            ) : (
                <>
                    {reporting.map(device => (
                        <div key={device.deviceId} style={{ border: '1px solid #2c2c2c', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#222222', borderBottom: '1px solid #2c2c2c' }}>
                                <strong style={{ fontSize: 13.5, color: '#f5f0e8' }}>{device.deviceName}</strong>
                                <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#5a4e42' }}>{device.imei}</span>
                                {device.tyreAlarms.length > 0 && (
                                    <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#fca5a5' }}>
                                        Tyre alarm at {device.tyreAlarms.join(', ')}
                                    </span>
                                )}
                            </div>

                            <div style={{ padding: 14 }}>
                                {isTyre ? (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                                            <thead><tr>{['Axle', 'Position', 'Sensor', 'Pressure', 'Temp', 'Moving', 'Reading age'].map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                                            <tbody>
                                                {device.tyres.map(t => {
                                                    // Matched on axle-position, the identity the device
                                                    // uses in tyreAlarmPositions — not the array index,
                                                    // which is only the order it happened to report in.
                                                    const alarmed = device.tyreAlarms.includes(`${t.axle}-${t.position}`);
                                                    return (
                                                        <tr key={t.index} style={alarmed ? { background: '#3b1418' } : undefined}>
                                                            <td style={TD}>{t.axle ?? '—'}</td>
                                                            <td style={TD}>{t.position ?? '—'}</td>
                                                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11.5 }}>{t.sensorId ?? '—'}</td>
                                                            <td style={{ ...TD, fontWeight: 700, color: alarmed ? '#fca5a5' : '#f5f0e8' }}>
                                                                {t.pressureBar == null ? '—' : `${t.pressureBar} bar`}
                                                            </td>
                                                            <td style={TD}>{t.temperature == null ? '—' : `${t.temperature} °C`}</td>
                                                            <td style={TD}>{t.moving == null ? '—' : t.moving ? 'Yes' : 'No'}</td>
                                                            <td style={{ ...TD, color: t.stale ? '#fcd34d' : '#9a8a75' }}>
                                                                {age(t.ageMinutes)}{t.stale ? ' · stale' : ''}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                        {device.temperatures.map(t => (
                                            <Reading key={t.key} label={SENSOR_LABELS[t.key] ?? t.key} value={t.value} unit="°C"
                                                ageMinutes={t.ageMinutes} stale={t.stale} />
                                        ))}
                                        {device.humidity.map(h => (
                                            <Reading key={h.key} label={SENSOR_LABELS[h.key] ?? h.key} value={h.value} unit="%"
                                                ageMinutes={h.ageMinutes} stale={h.stale} tone="#4ade80" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {reporting.length === 0 && (
                        <div style={{ border: '1px dashed #383838', borderRadius: 10, padding: 32, textAlign: 'center', color: '#9a8a75', fontSize: 13 }}>
                            No {isTyre ? 'tyre' : 'temperature or humidity'} readings in the last {data?.lookbackHours ?? hours} hours.
                            <div style={{ marginTop: 6, fontSize: 12, color: '#5a4e42' }}>
                                Only devices with a sensor module attached report these. Try a longer window before
                                concluding a sensor has failed — readings arrive on their own packets, not with every fix.
                            </div>
                        </div>
                    )}

                    {/* Named, not hidden: knowing which vehicles are not reporting is the point of a
                        compliance view, and an empty card would look like a healthy zero. */}
                    {silent.length > 0 && reporting.length > 0 && (
                        <p style={{ fontSize: 12, color: '#5a4e42', margin: '4px 0 16px' }}>
                            No readings from: {silent.map(d => d.deviceName).join(', ')}
                        </p>
                    )}

                    <h3 style={{ margin: '18px 0 8px', fontSize: 13.5, fontWeight: 700, color: '#f5f0e8' }}>
                        {isTyre ? 'Tyre alarms' : 'Temperature & humidity alarms'}
                        <span style={{ fontWeight: 500, color: '#5a4e42' }}> · last {hours} hours</span>
                    </h3>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                            <thead><tr>{['Time', 'Device', 'IMEI', 'Alarm'].map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                            <tbody>
                                {alarms.length === 0 ? (
                                    <tr><td colSpan={4} style={{ ...TD, textAlign: 'center', padding: 28, color: '#5a4e42' }}>No alarms raised in this window.</td></tr>
                                ) : alarms.map(a => (
                                    <tr key={a.id}>
                                        <td style={TD}>{fmtTime(a.occurredAt)}</td>
                                        <td style={TD}>{a.deviceName ?? '—'}</td>
                                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11.5 }}>{a.imei ?? '—'}</td>
                                        <td style={{ ...TD, fontWeight: 700, color: '#fca5a5' }}>{a.label}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Every reading in the window, not just the newest — the record behind the
                        tiles above, and what a compliance question is actually answered with.
                        Collapsed by default because it can run to hundreds of rows. */}
                    <h3 style={{ margin: '20px 0 8px', fontSize: 13.5, fontWeight: 700, color: '#f5f0e8', display: 'flex', alignItems: 'center', gap: 10 }}>
                        Reading history
                        <span style={{ fontWeight: 500, color: '#5a4e42' }}>· {history.length} reading{history.length === 1 ? '' : 's'} in {hours}h</span>
                        {history.length > 0 && (
                            <button onClick={() => setShowHistory(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', fontSize: 12.5, fontWeight: 600, padding: 0 }}>
                                {showHistory ? 'Hide' : 'Show'}
                            </button>
                        )}
                    </h3>

                    {showHistory && history.length > 0 && (
                        <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                                <thead><tr>{['Time', 'Device', isTyre ? 'Tyre readings' : 'Readings', 'Alarm'].map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                                <tbody>
                                    {history.map((r, i) => (
                                        <tr key={`${r.deviceId}-${r.recordedAt}-${i}`}>
                                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtTime(r.recordedAt)}</td>
                                            <td style={TD}>{r.deviceName ?? '—'}</td>
                                            <td style={TD}>
                                                {isTyre
                                                    ? r.tyres.map(t => `A${t.axle ?? '?'}-${t.position ?? '?'}: ${t.pressureBar ?? '—'} bar${t.temperature != null ? ` / ${t.temperature}°C` : ''}`).join('  ·  ')
                                                    : [
                                                        ...r.temperatures.map(t => `${SENSOR_LABELS[t.key] ?? t.key}: ${t.value}°C`),
                                                        ...r.humidity.map(h => `${SENSOR_LABELS[h.key] ?? h.key}: ${h.value}%`),
                                                    ].join('  ·  ')}
                                            </td>
                                            <td style={{ ...TD, color: r.alarm ? '#fca5a5' : '#5a4e42' }}>{r.alarm ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export function TemperatureHumidityReport() { return <SensorReport mode="climate" />; }
export function TyreTpmsReport()            { return <SensorReport mode="tyre" />; }
