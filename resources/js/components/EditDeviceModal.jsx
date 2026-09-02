import { useState, useEffect } from 'react';
import { api } from '../api.js';

const CATEGORIES = [
    'default', 'animal', 'bicycle', 'boat', 'bus', 'car', 'crane', 'helicopter', 'motorcycle',
    'offroad', 'person', 'pickup', 'plane', 'ship', 'tractor', 'train', 'tram', 'trolleybus', 'van', 'scooter',
];

/* ── shared primitives ─────────────────────────────────────── */

function FInput({ value, onChange, disabled, placeholder }) {
    return (
        <input value={value ?? ''} onChange={onChange} disabled={disabled} placeholder={placeholder}
            style={{ flex: 1, width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #383838', borderRadius: 6, fontSize: 13, color: disabled ? '#5a4e42' : '#f5f0e8', background: disabled ? '#222222' : '#1a1a1a', outline: 'none' }} />
    );
}

function FSelect({ value, onChange, children }) {
    return (
        <select value={value ?? ''} onChange={onChange}
            style={{ flex: 1, width: '100%', padding: '7px 10px', border: '1px solid #383838', borderRadius: 6, fontSize: 13, color: '#f5f0e8', background: '#1a1a1a', outline: 'none', cursor: 'pointer' }}>
            {children}
        </select>
    );
}

function LF({ label, hint, children }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ minWidth: 90, textAlign: 'right', fontSize: 13, color: '#9a8a75', flexShrink: 0 }}>{label}:</span>
                {children}
            </div>
            {hint && <p style={{ margin: '4px 0 0 100px', fontSize: 11, color: '#5a4e42', lineHeight: 1.4 }}>{hint}</p>}
        </div>
    );
}

function Toggle({ checked, onChange }) {
    return (
        <div onClick={onChange} style={{ width: 48, height: 26, borderRadius: 13, background: checked ? '#d97706' : '#383838', cursor: 'pointer', position: 'relative', transition: 'background 0.18s', flexShrink: 0, userSelect: 'none' }}>
            {checked && <span style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>ON</span>}
            <div style={{ position: 'absolute', top: 3, left: checked ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: '#1a1a1a', transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
    );
}

/**
 * Edit a Traccar device.
 *
 * Everything here maps to a field Traccar actually stores, which is why this is a single form
 * rather than tabs — the Customer/Alerts/Sensors/Camera tabs that used to sit alongside were
 * unbacked mock-ups whose values went nowhere on save.
 *
 * Phone is the number Traccar sends SMS commands to, so it is also the one place to set it for the
 * iButton and driving-behaviour panels.
 */
export default function EditDeviceModal({ device, onClose, onSave }) {
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');
    const [groups,    setGroups]    = useState([]);
    const [calendars, setCalendars] = useState([]);
    const [form, setForm] = useState({
        name:           device.name ?? '',
        groupId:        device.groupId ? String(device.groupId) : '',
        phone:          device.phone ?? '',
        model:          device.model ?? '',
        contact:        device.contact ?? '',
        category:       device.category || 'default',
        calendarId:     device.calendarId ? String(device.calendarId) : '',
        expirationTime: device.expirationTime ? device.expirationTime.slice(0, 10) : '',
        disabled:       device.disabled ?? false,
    });

    useEffect(() => {
        api.getTraccarGroups().then(res => setGroups(res.data)).catch(() => {});
        api.getTraccarCalendars().then(res => setCalendars(res.data)).catch(() => {});
    }, []);

    const f = (k) => ({ value: form[k], onChange: e => setForm(p => ({ ...p, [k]: e.target.value })) });

    const handleSave = async () => {
        if (!form.name.trim()) { setError('Name is required.'); return; }

        // Traccar hands this number to the SMS gateway exactly as stored, so it is worth catching
        // an unusable one here rather than after a command silently goes nowhere.
        const phone = form.phone.trim();
        if (phone && !/^\+?[0-9\s\-()]{6,30}$/.test(phone)) {
            setError('Enter a valid phone number, e.g. +6751234567.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            await api.updateTraccarDevice(device.id, {
                name:           form.name.trim(),
                groupId:        form.groupId ? Number(form.groupId) : 0,
                phone:          phone || undefined,
                model:          form.model || undefined,
                contact:        form.contact || undefined,
                category:       form.category || undefined,
                calendarId:     form.calendarId ? Number(form.calendarId) : 0,
                expirationTime: form.expirationTime ? new Date(form.expirationTime).toISOString() : undefined,
                disabled:       form.disabled,
            });
            onSave();
        } catch (e) {
            const errors = e.response?.data?.errors;
            setError(errors ? Object.values(errors).flat().join(' ') : (e.response?.data?.message || 'Failed to save the device.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#1a1a1a', borderRadius: 12, width: '90%', maxWidth: 880, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px 14px', borderBottom: '1px solid #2c2c2c', flexShrink: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f5f0e8' }}>Edit</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a4e42', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 40px', padding: '24px 32px' }}>
                    <LF label="Identifier"><FInput value={device.imei ?? device.id} disabled /></LF>
                    <LF label="Name"><FInput {...f('name')} /></LF>

                    <LF label="Group">
                        <FSelect value={form.groupId} onChange={e => setForm(p => ({ ...p, groupId: e.target.value }))}>
                            <option value="">None</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </FSelect>
                    </LF>
                    <LF label="Phone" hint="Used for SMS commands (iButton, driving behaviour). International form, e.g. +6751234567.">
                        <FInput {...f('phone')} placeholder="+6751234567" />
                    </LF>

                    <LF label="Model"><FInput {...f('model')} /></LF>
                    <LF label="Contact"><FInput {...f('contact')} /></LF>

                    <LF label="Category">
                        <FSelect value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
                        </FSelect>
                    </LF>
                    <LF label="Calendar">
                        <FSelect value={form.calendarId} onChange={e => setForm(p => ({ ...p, calendarId: e.target.value }))}>
                            <option value="">None</option>
                            {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </FSelect>
                    </LF>

                    <LF label="Expiration">
                        <input type="date" value={form.expirationTime} max="2038-01-19" onChange={e => setForm(p => ({ ...p, expirationTime: e.target.value }))}
                            style={{ flex: 1, width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #383838', borderRadius: 6, fontSize: 13, outline: 'none' }} />
                    </LF>
                    <LF label="Disabled">
                        <Toggle checked={form.disabled} onChange={() => setForm(p => ({ ...p, disabled: !p.disabled }))} />
                    </LF>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 28px', borderTop: '1px solid #2c2c2c', flexShrink: 0 }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: '#ef4444' }}>{error}</span>
                    <button onClick={onClose} style={{ padding: '8px 22px', border: '1px solid #383838', borderRadius: 8, background: '#1a1a1a', fontSize: 13, cursor: 'pointer', color: '#d5c9b8' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 22px', border: 'none', borderRadius: 8, background: '#d97706', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}
