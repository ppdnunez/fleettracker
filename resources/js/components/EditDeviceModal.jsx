import { useState, useEffect } from 'react';
import { api } from '../api.js';

const TABS = ['Basic', 'Customer', 'Alerts', 'Sensors', 'Camera'];

const CATEGORIES = [
    'default', 'animal', 'bicycle', 'boat', 'bus', 'car', 'crane', 'helicopter', 'motorcycle',
    'offroad', 'person', 'pickup', 'plane', 'ship', 'tractor', 'train', 'tram', 'trolleybus', 'van', 'scooter',
];

/* ── shared primitives ─────────────────────────────────────── */

function FInput({ value, onChange, disabled, placeholder, suffix }) {
    return (
        <div style={{ position: 'relative', flex: 1 }}>
            <input value={value ?? ''} onChange={onChange} disabled={disabled} placeholder={placeholder}
                style={{ width: '100%', boxSizing: 'border-box', padding: suffix ? '7px 36px 7px 10px' : '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: disabled ? '#9ca3af' : '#111827', background: disabled ? '#f9fafb' : '#fff', outline: 'none' }} />
            {suffix && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af', pointerEvents: 'none' }}>{suffix}</span>}
        </div>
    );
}

function FSelect({ value, onChange, children }) {
    return (
        <select value={value ?? ''} onChange={onChange}
            style={{ flex: 1, width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#111827', background: '#fff', outline: 'none', cursor: 'pointer' }}>
            {children}
        </select>
    );
}

function LF({ label, children }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ minWidth: 155, textAlign: 'right', fontSize: 13, color: '#6b7280', flexShrink: 0 }}>{label}:</span>
            {children}
        </div>
    );
}

function SecHead({ title }) {
    return (
        <>
            <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</h4>
            <hr style={{ margin: '0 0 14px', border: 'none', borderTop: '1px solid #e5e7eb' }} />
        </>
    );
}

function Toggle({ checked, onChange }) {
    return (
        <div onClick={onChange} style={{ width: 48, height: 26, borderRadius: 13, background: checked ? '#3b82f6' : '#d1d5db', cursor: 'pointer', position: 'relative', transition: 'background 0.18s', flexShrink: 0, userSelect: 'none' }}>
            {checked && <span style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>ON</span>}
            <div style={{ position: 'absolute', top: 3, left: checked ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
    );
}

const scrollArea = { overflowY: 'auto', flex: 1 };

/* ── Basic tab ─────────────────────────────────────────────── */
function BasicTab({ device, form, set, groups, calendars }) {
    const f = (k) => ({ value: form[k], onChange: e => set(p => ({ ...p, [k]: e.target.value })) });
    return (
        <div style={{ ...scrollArea, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 40px', padding: '24px 32px' }}>
            <LF label="Identifier"><FInput value={device.imei ?? device.id} disabled /></LF>
            <LF label="Name"><FInput {...f('name')} /></LF>

            <LF label="Group">
                <FSelect value={form.groupId} onChange={e => set(p => ({ ...p, groupId: e.target.value }))}>
                    <option value="">None</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </FSelect>
            </LF>
            <LF label="Phone"><FInput {...f('phone')} /></LF>

            <LF label="Model"><FInput {...f('model')} /></LF>
            <LF label="Contact"><FInput {...f('contact')} /></LF>

            <LF label="Category">
                <FSelect value={form.category} onChange={e => set(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
                </FSelect>
            </LF>
            <LF label="Calendar">
                <FSelect value={form.calendarId} onChange={e => set(p => ({ ...p, calendarId: e.target.value }))}>
                    <option value="">None</option>
                    {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </FSelect>
            </LF>

            <LF label="Expiration">
                <input type="date" value={form.expirationTime} max="2038-01-19" onChange={e => set(p => ({ ...p, expirationTime: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
            </LF>
            <LF label="Disabled">
                <Toggle checked={form.disabled} onChange={() => set(p => ({ ...p, disabled: !p.disabled }))} />
            </LF>
        </div>
    );
}

/* ── Customer tab ──────────────────────────────────────────── */
function CustomerTab() {
    return (
        <div style={{ ...scrollArea, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>
            No customer assignment configured.
        </div>
    );
}

/* ── Alerts tab ────────────────────────────────────────────── */
function AlertsTab({ form, set }) {
    const f = (k) => ({ value: form[k] ?? '', onChange: e => set(p => ({ ...p, [k]: e.target.value })) });
    return (
        <div style={{ ...scrollArea, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
                <SecHead title="Temperature Abnormal Alert" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
                    <LF label="lowest temperature"><FInput {...f('temp_min')} suffix="°C" /></LF>
                    <LF label="Maximum temperature"><FInput {...f('temp_max')} suffix="°C" /></LF>
                </div>
            </div>

            <div>
                <SecHead title="Overspeed Alert" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 40px' }}>
                    <LF label="Speeding"><FInput {...f('speed_limit')} suffix="km/h" /></LF>
                    <LF label="Duration"><FInput {...f('speed_duration')} suffix="sec" /></LF>
                </div>
            </div>

            <div>
                <SecHead title="Maintenance Alert" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                    <input type="checkbox" checked={form.mileage_enabled ?? false} onChange={e => set(p => ({ ...p, mileage_enabled: e.target.checked }))} />
                    Mileage
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ minWidth: 155, textAlign: 'right', fontSize: 13, color: '#6b7280' }}>Current mileage:</span>
                    <input value={form.current_mileage ?? ''} onChange={e => set(p => ({ ...p, current_mileage: e.target.value }))}
                        style={{ width: 100, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>km</span>
                    <button style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', fontSize: 12, cursor: 'pointer', color: '#374151' }}>Calibration</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 155, textAlign: 'right', fontSize: 13, color: '#6b7280' }}>Each trip reaches:</span>
                    <input value={form.trip_mileage ?? ''} onChange={e => set(p => ({ ...p, trip_mileage: e.target.value }))}
                        style={{ width: 80, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>km</span>
                    <span style={{ fontSize: 12, color: '#374151' }}>Will remind</span>
                    <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 8 }}>Total mileage reached:</span>
                    <input value={form.total_mileage ?? ''} onChange={e => set(p => ({ ...p, total_mileage: e.target.value }))}
                        style={{ width: 80, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>km</span>
                    <span style={{ fontSize: 12, color: '#374151' }}>Will remind</span>
                </div>
            </div>
        </div>
    );
}

/* ── Sensors tab ───────────────────────────────────────────── */
function SensorsTab({ form, set }) {
    return (
        <div style={{ ...scrollArea, padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#1e40af' }}>
                <span style={{ flexShrink: 0 }}>ℹ</span>
                <span>Capacitive/ultrasonic fuel sensors have been merged into fuel sensors, and any type of fuel data reported by the device will be processed and displayed compatibly.</span>
            </div>

            <div>
                <SecHead title="Analog Input (ADC)" />
                <LF label="Analog input sensor type">
                    <FSelect value={form.analog_sensor} onChange={e => set(p => ({ ...p, analog_sensor: e.target.value }))}>
                        <option value="">please select</option>
                        <option value="fuel">Fuel sensor</option>
                        <option value="temperature">Temperature sensor</option>
                        <option value="voltage">Voltage sensor</option>
                    </FSelect>
                </LF>
            </div>

            <div>
                <SecHead title="Serial port input" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <LF label="TTL/RS232"><FSelect><option value="">please select</option></FSelect></LF>
                    <LF label="RS485"><FSelect><option value="">please select</option></FSelect></LF>
                </div>
            </div>

            <div>
                <SecHead title="Digital Input (IN1)" />
                <LF label="Digital sensor type"><FSelect><option value="">please select</option></FSelect></LF>
                <div style={{ marginTop: 10, paddingLeft: 169, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" id="dm_showmap" />
                    <label htmlFor="dm_showmap" style={{ fontSize: 13, cursor: 'pointer', color: '#374151' }}>Show on map</label>
                </div>
            </div>

            <div>
                <SecHead title="1-Wire" />
                <LF label="1-wire"><FSelect><option value="">please select</option></FSelect></LF>
            </div>

            <div>
                <SecHead title="Fuel Tank Information" />
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button style={{ padding: '6px 16px', border: '1px solid #3b82f6', borderRadius: 6, color: '#3b82f6', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Add</button>
                    <button style={{ padding: '6px 16px', border: '1px solid #3b82f6', borderRadius: 6, color: '#3b82f6', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Import</button>
                </div>
                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, margin: 0 }}>No data found</p>
            </div>
        </div>
    );
}

/* ── Camera tab ────────────────────────────────────────────── */
function CameraCard({ ch, onToggle, onRename }) {
    const [editing, setEditing] = useState(false);
    const [tmp, setTmp] = useState(ch.name);
    const commit = () => { onRename(tmp); setEditing(false); };
    return (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 18px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>{ch.id}</span>
                <Toggle checked={ch.enabled} onChange={onToggle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: '#6b7280' }}>Nickname:</span>
                {editing ? (
                    <input autoFocus value={tmp} onChange={e => setTmp(e.target.value)}
                        onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()}
                        style={{ border: 'none', borderBottom: '1px solid #3b82f6', outline: 'none', fontSize: 13, color: '#374151', width: 80 }} />
                ) : (
                    <span style={{ color: '#374151' }}>{ch.name}</span>
                )}
                <button onClick={() => { setTmp(ch.name); setEditing(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2, fontSize: 13 }}>✏</button>
            </div>
        </div>
    );
}

function CameraTab({ form, set }) {
    const channels = form.cameras ?? [{ id: 'CH1', name: 'CH1', enabled: true }];
    const update = (i, patch) => set(p => {
        const cams = [...(p.cameras ?? [{ id: 'CH1', name: 'CH1', enabled: true }])];
        cams[i] = { ...cams[i], ...patch };
        return { ...p, cameras: cams };
    });
    return (
        <div style={{ ...scrollArea, padding: '24px 32px' }}>
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#1e40af', marginBottom: 20 }}>
                <span style={{ flexShrink: 0 }}>ℹ</span>
                <span>Please set the number of cameras actually connected to the device</span>
            </div>
            {channels.map((ch, i) => (
                <CameraCard key={ch.id} ch={ch}
                    onToggle={() => update(i, { enabled: !ch.enabled })}
                    onRename={name => update(i, { name })} />
            ))}
        </div>
    );
}

/* ── Modal root ────────────────────────────────────────────── */
export default function EditDeviceModal({ device, onClose, onSave }) {
    const [tab,    setTab]    = useState('Basic');
    const [saving, setSaving] = useState(false);
    const [groups,    setGroups]    = useState([]);
    const [calendars, setCalendars] = useState([]);
    const [form,   setForm]   = useState({
        name:           device.name ?? '',
        groupId:        device.groupId ? String(device.groupId) : '',
        phone:          device.phone ?? '',
        model:          device.model ?? '',
        contact:        device.contact ?? '',
        category:       device.category || 'default',
        calendarId:     device.calendarId ? String(device.calendarId) : '',
        expirationTime: device.expirationTime ? device.expirationTime.slice(0, 10) : '',
        disabled:       device.disabled ?? false,
        temp_min: '', temp_max: '',
        speed_limit: '', speed_duration: '',
        mileage_enabled: false, current_mileage: '', trip_mileage: '', total_mileage: '',
        analog_sensor: '',
        cameras: [{ id: 'CH1', name: 'CH1', enabled: true }],
    });

    useEffect(() => {
        api.getTraccarGroups().then(res => setGroups(res.data)).catch(() => {});
        api.getTraccarCalendars().then(res => setCalendars(res.data)).catch(() => {});
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.updateTraccarDevice(device.id, {
                name:           form.name,
                groupId:        form.groupId ? Number(form.groupId) : 0,
                phone:          form.phone || undefined,
                model:          form.model || undefined,
                contact:        form.contact || undefined,
                category:       form.category || undefined,
                calendarId:     form.calendarId ? Number(form.calendarId) : 0,
                expirationTime: form.expirationTime ? new Date(form.expirationTime).toISOString() : undefined,
                disabled:       form.disabled,
            });
            onSave();
        } catch (e) {
            console.error('Save failed:', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 880, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px 0', flexShrink: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>Edit</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '0 28px', flexShrink: 0, marginTop: 16 }}>
                    {TABS.map(t => (
                        <button key={t} onClick={() => setTab(t)} style={{
                            padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
                            fontSize: 14, fontWeight: tab === t ? 700 : 400,
                            color: tab === t ? '#3b82f6' : '#374151',
                            borderBottom: tab === t ? '2.5px solid #3b82f6' : '2.5px solid transparent',
                            marginBottom: -1,
                        }}>{t}</button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {tab === 'Basic'    && <BasicTab    device={device} form={form} set={setForm} groups={groups} calendars={calendars} />}
                    {tab === 'Customer' && <CustomerTab />}
                    {tab === 'Alerts'   && <AlertsTab   form={form} set={setForm} />}
                    {tab === 'Sensors'  && <SensorsTab  form={form} set={setForm} />}
                    {tab === 'Camera'   && <CameraTab   form={form} set={setForm} />}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 28px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
                    <button onClick={onClose} style={{ padding: '8px 22px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 22px', border: 'none', borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}
