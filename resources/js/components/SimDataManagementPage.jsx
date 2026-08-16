import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Reminder thresholds, mirroring NotifyVehicleExpirations' DEFAULT_NOTICE_DAYS on the backend —
// a vehicle with no sim_notify_days_before of its own falls back to the same 14 days there.
const DEFAULT_NOTICE_DAYS = 14;

function daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(dateStr) - today) / 86400000);
}
function simStatus(dateStr, notifyDays) {
    if (!dateStr) return 'Not set';
    const days = daysUntil(dateStr);
    if (days < 0) return 'Expired';
    if (days <= (notifyDays ?? DEFAULT_NOTICE_DAYS)) return 'Expiring soon';
    return 'Normal';
}
const STATUS_COLOR = { Expired: '#ef4444', 'Expiring soon': '#f59e0b', Normal: '#16a34a', 'Not set': '#9ca3af' };

function Badge({ text }) {
    const color = STATUS_COLOR[text] || '#9ca3af';
    return <span style={{ fontSize: 11.5, fontWeight: 700, color, background: `${color}1a`, padding: '3px 9px', borderRadius: 999 }}>{text}</span>;
}

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle = { fontSize: 11.5, color: '#9daec9', fontWeight: 600 };
const inputStyle = { padding: '8px 10px', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%', background: '#111c33', color: '#eaeff9' };

// Edits only the SIM fields, but loads and re-submits the vehicle's full settings row. The two
// relay booleans are `required` on PUT /vehicle-settings/{imei}, so they have to be sent, and
// sending a stale value would silently flip a relay setting — hence the load-then-resend. The
// remaining fields are optional and survive being omitted, but are echoed back for the same
// reason: this modal never wants to be the thing that changed them.
//
// Doubles as the picker flow: when `device` is null (opened via "+ Add SIM Data") a Device select
// is shown instead of a fixed header. Every tracker is listed, not just ones without SIM data —
// there is no separate insert endpoint, saving upserts the vehicle_settings row either way.
function SimSettingsModal({ device, pickableDevices, onClose, onSaved }) {
    const [selectedImei, setSelectedImei] = useState(device?.imei || '');
    const [loaded, setLoaded]             = useState(null);
    const [simNumber, setSimNumber]       = useState('');
    const [simExpiry, setSimExpiry]       = useState('');
    const [simNotifyDays, setSimNotifyDays] = useState('');
    const [loading, setLoading] = useState(!!device);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');

    useEffect(() => {
        if (!selectedImei) { setLoaded(null); return; }
        setLoading(true);
        setError('');
        (async () => {
            try {
                const res = await api.getVehicleSetting(selectedImei);
                setLoaded(res.data);
                setSimNumber(res.data.sim_number || '');
                setSimExpiry(res.data.sim_data_expiry ? res.data.sim_data_expiry.slice(0, 10) : '');
                setSimNotifyDays(res.data.sim_notify_days_before ?? '');
            } catch (e) {
                setError('Failed to load SIM data settings.');
            } finally {
                setLoading(false);
            }
        })();
    }, [selectedImei]);

    const handleSave = async () => {
        if (!selectedImei) { setError('Select a device.'); return; }
        setSaving(true);
        setError('');
        try {
            await api.setVehicleSetting(selectedImei, {
                relay_disconnect_enabled:      !!loaded?.relay_disconnect_enabled,
                relay_disconnect_on_face_fail: !!loaded?.relay_disconnect_on_face_fail,
                relay_channel:                 loaded?.relay_channel ?? 10,
                fuel_rate_l_per_100km:         loaded?.fuel_rate_l_per_100km ?? null,
                fuel_tank_capacity_liters:     loaded?.fuel_tank_capacity_liters ?? null,
                vehicle_type:                  loaded?.vehicle_type ?? null,
                fuel_type:                     loaded?.fuel_type ?? null,
                safety_sticker_expiry:         loaded?.safety_sticker_expiry ?? null,
                sticker_notify_days_before:    loaded?.sticker_notify_days_before ?? null,
                insurance_expiry:              loaded?.insurance_expiry ?? null,
                insurance_notify_days_before:  loaded?.insurance_notify_days_before ?? null,
                sim_number:              simNumber.trim() || null,
                sim_data_expiry:         simExpiry || null,
                sim_notify_days_before:  simNotifyDays === '' ? null : Number(simNotifyDays),
            });
            onSaved();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to save SIM data settings.');
        } finally {
            setSaving(false);
        }
    };

    const fieldsDisabled = !selectedImei || loading;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#111c33', borderRadius: 12, width: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2c46' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>
                        {device ? `SIM Data — ${device.name || device.imei}` : 'Add SIM Data'}
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && <div style={{ marginBottom: 14, padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>{error}</div>}

                    {!device && (
                        <div style={{ ...fieldStyle, marginBottom: 14 }}>
                            <label style={labelStyle}>Device</label>
                            <select value={selectedImei} onChange={e => setSelectedImei(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                <option value="">Select a device…</option>
                                {(pickableDevices || []).map(d => (
                                    <option key={d.imei} value={d.imei}>{d.name} — {d.imei}</option>
                                ))}
                            </select>
                            {(pickableDevices || []).length === 0 && (
                                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#f59e0b' }}>No devices found in Device Management yet.</p>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <p style={{ fontSize: 13, color: '#5e7094' }}>Loading…</p>
                    ) : (
                        <>
                            <div style={{ ...fieldStyle, marginBottom: 14 }}>
                                <label style={labelStyle}>SIM Number / ICCID</label>
                                <input value={simNumber} onChange={e => setSimNumber(e.target.value)} disabled={fieldsDisabled} placeholder="e.g. 8991000123456789" style={inputStyle} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={fieldStyle}>
                                    <label style={labelStyle}>Data/Load Expiry</label>
                                    <input type="date" value={simExpiry} onChange={e => setSimExpiry(e.target.value)} disabled={fieldsDisabled} style={inputStyle} />
                                </div>
                                <div style={fieldStyle}>
                                    <label style={labelStyle}>Notify before expiry (days)</label>
                                    <input type="number" min="1" max="365" placeholder="Default 14" value={simNotifyDays} onChange={e => setSimNotifyDays(e.target.value)} disabled={fieldsDisabled} style={inputStyle} />
                                </div>
                            </div>
                            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#5e7094' }}>
                                Subscribers to the "SIM Card Data/Load Expiry" alert (Alert Recipients) are emailed once the expiry falls within this window.
                            </p>
                        </>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #1e2c46', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving || fieldsDisabled} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (saving || fieldsDisabled) ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#cfdcf0', borderBottom: '2px solid #1e2c46', whiteSpace: 'nowrap', background: '#16233c' };
const TD = { padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #1e2c46', color: '#eaeff9' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 5, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

export default function SimDataManagementPage() {
    const [devices, setDevices]   = useState([]); // every tracker Traccar shows this account
    const [vehicles, setVehicles] = useState([]); // local registry, for friendly name/plate
    const [settings, setSettings] = useState([]); // SIM fields by imei
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [search, setSearch]     = useState('');
    const [editing, setEditing]   = useState(null); // row object, 'new', or null

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [devRes, vehRes, settingsRes] = await Promise.all([
                api.getTraccarDevices(),
                api.getVehicles().catch(() => ({ data: [] })),
                api.getVehicleSettings().catch(() => ({ data: [] })),
            ]);
            setDevices(Array.isArray(devRes.data) ? devRes.data : []);
            setVehicles(Array.isArray(vehRes.data) ? vehRes.data : []);
            setSettings(Array.isArray(settingsRes.data) ? settingsRes.data : []);
        } catch (e) {
            setError('Failed to load SIM data list.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const vehiclesByImei = {};
    vehicles.forEach(v => { vehiclesByImei[v.imei] = v; });
    const settingsByImei = {};
    settings.forEach(s => { settingsByImei[s.imei] = s; });

    // Traccar's uniqueId is the IMEI everything else in this app keys off.
    const rows = devices.map(d => {
        const imei    = d.uniqueId;
        const vehicle = vehiclesByImei[imei];
        const setting = settingsByImei[imei];
        return {
            imei,
            name:          vehicle?.name || d.name || imei,
            plateNumber:   vehicle?.plate_number || '',
            simNumber:     setting?.sim_number || '',
            simExpiry:     setting?.sim_data_expiry || '',
            simNotifyDays: setting?.sim_notify_days_before ?? null,
        };
    });

    const q = search.toLowerCase();
    const filtered = rows.filter(r =>
        !search ||
        r.name.toLowerCase().includes(q) ||
        r.plateNumber.toLowerCase().includes(q) ||
        r.imei.includes(search) ||
        r.simNumber.toLowerCase().includes(q)
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#111c33' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #1e2c46', flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: '#9daec9' }}>Track each tracker's SIM card data/load expiry and get emailed before it runs out.</p>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e2c46', flexShrink: 0, display: 'flex', gap: 8 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, plate no., IMEI, or SIM number"
                    style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                <button onClick={load} style={{ padding: '7px 14px', background: '#111c33', color: '#cfdcf0', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Refresh</button>
                <button onClick={() => setEditing('new')} style={{ marginLeft: 'auto', padding: '7px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add SIM Data</button>
            </div>

            {error && (
                <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                    <thead>
                        <tr>
                            <th style={TH}>Vehicle / Device</th>
                            <th style={TH}>Plate Number</th>
                            <th style={TH}>IMEI</th>
                            <th style={TH}>SIM Number</th>
                            <th style={TH}>Data/Load Expiry</th>
                            <th style={TH}>Status</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5e7094' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5e7094' }}>No devices found.</td></tr>
                        ) : filtered.map(r => (
                            <tr key={r.imei}>
                                <td style={{ ...TD, fontWeight: 500 }}>{r.name}</td>
                                <td style={TD}>{r.plateNumber || '—'}</td>
                                <td style={{ ...TD, fontFamily: 'monospace' }}>{r.imei}</td>
                                <td style={TD}>{r.simNumber || '—'}</td>
                                <td style={TD}>{r.simExpiry ? r.simExpiry.slice(0, 10) : '—'}</td>
                                <td style={TD}><Badge text={simStatus(r.simExpiry, r.simNotifyDays)} /></td>
                                <td style={{ ...TD, textAlign: 'center' }}>
                                    <button style={iconBtn} title="Edit SIM data" onClick={() => setEditing(r)}>✏</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editing && (
                <SimSettingsModal
                    device={editing === 'new' ? null : editing}
                    pickableDevices={editing === 'new' ? rows : undefined}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}
        </div>
    );
}
