import { useEffect, useState } from 'react';
import { api } from '../api.js';

const TYPE_OPTIONS = [
    { value: 'id',              label: 'Identifier' },
    { value: 'latitude',        label: 'Latitude' },
    { value: 'longitude',       label: 'Longitude' },
    { value: 'speed',           label: 'Speed' },
    { value: 'course',          label: 'Course' },
    { value: 'altitude',        label: 'Altitude' },
    { value: 'accuracy',        label: 'Accuracy' },
    { value: 'deviceTime',      label: 'Device Time' },
    { value: 'fixTime',         label: 'Fix Time' },
    { value: 'serverTime',      label: 'Server Time' },
    { value: 'index',           label: 'Index' },
    { value: 'hdop',            label: 'HDOP' },
    { value: 'vdop',            label: 'VDOP' },
    { value: 'pdop',            label: 'PDOP' },
    { value: 'sat',             label: 'Satellites' },
    { value: 'satVisible',      label: 'Visible Satellites' },
    { value: 'rssi',            label: 'RSSI' },
    { value: 'coolantTemp',     label: 'Coolant Temperature' },
    { value: 'engineTemp',      label: 'Engine Temperature' },
    { value: 'gps',             label: 'GPS' },
    { value: 'odometer',        label: 'Odometer' },
    { value: 'serviceOdometer', label: 'Service Odometer' },
    { value: 'tripOdometer',    label: 'Trip Odometer' },
    { value: 'hours',           label: 'Hours' },
    { value: 'steps',           label: 'Steps' },
    { value: 'heartRate',       label: 'Heart Rate' },
    { value: 'input',           label: 'Input' },
    { value: 'output',          label: 'Output' },
    { value: 'power',           label: 'Power' },
    { value: 'battery',         label: 'Battery' },
    { value: 'batteryLevel',    label: 'Battery Level' },
    { value: 'fuel',            label: 'Fuel' },
    { value: 'fuelUsed',        label: 'Fuel Used' },
    { value: 'fuelConsumption', label: 'Fuel Consumption' },
    { value: 'distance',        label: 'Distance' },
    { value: 'totalDistance',   label: 'Total Distance' },
    { value: 'rpm',             label: 'RPM' },
    { value: 'throttle',        label: 'Throttle' },
    { value: 'acceleration',    label: 'Acceleration' },
    { value: 'humidity',        label: 'Humidity' },
    { value: 'deviceTemp',      label: 'Device Temperature' },
    { value: 'temp1',           label: 'Temperature 1' },
    { value: 'temp2',           label: 'Temperature 2' },
    { value: 'temp3',           label: 'Temperature 3' },
    { value: 'temp4',           label: 'Temperature 4' },
    { value: 'obdSpeed',        label: 'OBD Speed' },
    { value: 'obdOdometer',     label: 'OBD Odometer' },
    { value: 'drivingTime',     label: 'Driving Time' },
    { value: 'speedLimit',      label: 'Speed Limit' },
];
const typeLabel = (type) => TYPE_OPTIONS.find(t => t.value === type)?.label || type;

const fieldLabelStyle = { display: 'block', fontSize: 11.5, color: '#6b7280', fontWeight: 600, marginBottom: 6 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' };

function MaintenanceModal({ maintenance, onClose, onSaved }) {
    const isNew = !maintenance;
    const [name, setName]       = useState(maintenance?.name || '');
    const [type, setType]       = useState(maintenance?.type || 'totalDistance');
    const [start, setStart]     = useState(maintenance?.start ?? 0);
    const [period, setPeriod]   = useState(maintenance?.period ?? 0);
    const [attributesOpen, setAttributesOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const handleSave = async () => {
        if (!name.trim()) { setError('Name is required.'); return; }
        setSaving(true);
        setError('');
        const payload = { name: name.trim(), type, start: Number(start) || 0, period: Number(period) || 0 };
        try {
            if (isNew) {
                await api.createMaintenance(payload);
            } else {
                await api.updateMaintenance(maintenance.id, payload);
            }
            onSaved();
        } catch (e) {
            setError('Failed to save maintenance.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 420, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{isNew ? 'New Maintenance' : 'Edit Maintenance'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Required</p>

                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle}>Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inputStyle} />
                        </div>
                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle}>Type</label>
                            <select value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}>
                                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                            <label style={fieldLabelStyle}>Start</label>
                            <input type="number" value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={fieldLabelStyle}>Period</label>
                            <input type="number" value={period} onChange={e => setPeriod(e.target.value)} style={inputStyle} />
                        </div>
                    </div>

                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setAttributesOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Attributes
                            <span style={{ transform: attributesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                        </button>
                        {attributesOpen && (
                            <div style={{ padding: 14, borderTop: '1px solid #f1f5f9' }}>
                                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>No additional attributes.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb' };
const TD = { padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #f1f5f9' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 5, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

export default function MaintenancePage() {
    const [maintenances, setMaintenances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');
    const [editing, setEditing] = useState(null); // maintenance object, or 'new'
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchMaintenances = async () => {
        try {
            const res = await api.getMaintenances();
            setMaintenances(res.data);
        } catch (e) {
            setError('Failed to load maintenance reminders.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMaintenances(); }, []);

    const filtered = maintenances.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteMaintenance(id);
            await fetchMaintenances();
        } catch (e) {
            setError('Failed to delete maintenance.');
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', position: 'relative' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Maintenance</h2>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
                    style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
            </div>

            {error && (
                <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead>
                        <tr>
                            <th style={TH}>Name</th>
                            <th style={TH}>Type</th>
                            <th style={TH}>Start</th>
                            <th style={TH}>Period</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data found</td></tr>
                        ) : filtered.map(m => (
                            <tr key={m.id}>
                                <td style={{ ...TD, fontWeight: 500 }}>{m.name}</td>
                                <td style={TD}>{typeLabel(m.type)}</td>
                                <td style={TD}>{m.start}</td>
                                <td style={TD}>{m.period}</td>
                                <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn} title="Edit" onClick={() => setEditing(m)}>✏</button>
                                    <button style={{ ...iconBtn, color: '#ef4444' }} title="Delete" onClick={() => setPendingDeleteId(m.id)}>🗑</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={() => setEditing('new')} title="Add maintenance"
                style={{ position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', fontSize: 26, fontWeight: 400, lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
            </button>

            {editing && (
                <MaintenanceModal
                    maintenance={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchMaintenances(); }}
                />
            )}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Delete maintenance?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
