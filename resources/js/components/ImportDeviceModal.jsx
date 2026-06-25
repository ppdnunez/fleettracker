import { useEffect, useState } from 'react';
import { api } from '../api.js';

/* ── Traccar's known device attribute keys ─────────────────── */
const ATTRIBUTE_DEFS = [
    { key: 'commandChannel',              label: 'Command Channel',                type: 'string'  },
    { key: 'deviceImage',                 label: 'Device Image',                   type: 'string'  },
    { key: 'deviceInactivityPeriod',      label: 'Device Inactivity Period',       type: 'number'  },
    { key: 'deviceInactivityStart',       label: 'Device Inactivity Start',        type: 'number'  },
    { key: 'devicePassword',              label: 'Device Password',                type: 'string'  },
    { key: 'filter.accuracy',             label: 'Filter: Accuracy',               type: 'number'  },
    { key: 'filter.approximate',          label: 'Filter: Approximate',            type: 'boolean' },
    { key: 'filter.dailyLimit',           label: 'Filter: Daily Limit',            type: 'number'  },
    { key: 'filter.dailyLimitInterval',   label: 'Filter: Daily Limit Interval',   type: 'number'  },
    { key: 'filter.distance',             label: 'Filter: Distance',               type: 'number'  },
    { key: 'filter.duplicate',            label: 'Filter: Duplicate',              type: 'boolean' },
    { key: 'filter.future',               label: 'Filter: Future Limit',           type: 'number'  },
    { key: 'filter.invalid',              label: 'Filter: Invalid',                type: 'boolean' },
    { key: 'filter.maxSpeed',             label: 'Filter: Max Speed',              type: 'number'  },
    { key: 'filter.minPeriod',            label: 'Filter: Min Period',             type: 'number'  },
    { key: 'filter.outdated',             label: 'Filter: Outdated',               type: 'boolean' },
    { key: 'filter.past',                 label: 'Filter: Past Limit',             type: 'number'  },
    { key: 'filter.skipAttributes',       label: 'Filter: Skip Attributes',        type: 'string'  },
    { key: 'filter.skipAttributesEnable', label: 'Filter: Skip Attributes Enable', type: 'boolean' },
    { key: 'filter.skipLimit',            label: 'Filter: Skip Limit',             type: 'number'  },
    { key: 'filter.static',               label: 'Filter: Static',                 type: 'boolean' },
    { key: 'filter.zero',                 label: 'Filter: Zero',                   type: 'boolean' },
    { key: 'forward.url',                 label: 'Forward URL',                    type: 'string'  },
    { key: 'fuelDropThreshold',           label: 'Fuel Drop Threshold',            type: 'number'  },
    { key: 'fuelIncreaseThreshold',       label: 'Fuel Increase Threshold',        type: 'number'  },
    { key: 'notificationTokens',          label: 'Notification Tokens',            type: 'string'  },
    { key: 'processing.copyAttributes',   label: 'Processing: Copy Attributes',    type: 'string'  },
    { key: 'proximity.enterDistance',     label: 'Proximity Enter Distance',       type: 'number'  },
    { key: 'proximity.exitDistance',      label: 'Proximity Exit Distance',        type: 'number'  },
    { key: 'report.ignoreOdometer',       label: 'Report: Ignore Odometer',        type: 'boolean' },
    { key: 'speedLimit',                  label: 'Speed Limit',                    type: 'number'  },
    { key: 'time.override',               label: 'Time Override',                  type: 'string'  },
    { key: 'decoder.timezone',            label: 'Timezone',                       type: 'string'  },
    { key: 'unaccompaniedMotionDistance', label: 'Unaccompanied Motion Distance',  type: 'number'  },
    { key: 'web.reportColor',             label: 'Web: Report Color',              type: 'string'  },
];

const CATEGORIES = [
    'default', 'animal', 'bicycle', 'boat', 'bus', 'car', 'crane', 'helicopter', 'motorcycle',
    'offroad', 'person', 'pickup', 'plane', 'ship', 'tractor', 'train', 'tram', 'trolleybus', 'van', 'scooter',
];

/* ── shared field primitives ────────────────────────────────── */
const inputStyle  = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', color: '#111827' };
const selectStyle = { ...inputStyle, background: '#fff', cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23999\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' };

function Field({ label, hint, children }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>{label}</label>
            {children}
            {hint && <p style={{ margin: '5px 2px 0', fontSize: 11.5, color: '#9ca3af', lineHeight: 1.4 }}>{hint}</p>}
        </div>
    );
}

function ChevronSVG({ open }) {
    return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#374151" strokeWidth="1.8" strokeLinecap="round"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.15s' }}>
            <polyline points="2.5,8.5 6.5,4.5 10.5,8.5" />
        </svg>
    );
}

function Section({ title, open, onToggle, children }) {
    return (
        <div style={{ borderBottom: '8px solid #f1f5f9' }}>
            <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', background: 'none', border: 'none', cursor: 'pointer' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</span>
                <ChevronSVG open={open} />
            </button>
            {open && <div style={{ padding: '0 24px 18px' }}>{children}</div>}
        </div>
    );
}

function AttributeValueInput({ def, value, onChange }) {
    if (def.type === 'boolean') {
        return (
            <select value={value ? 'true' : 'false'} onChange={e => onChange(e.target.value === 'true')} style={selectStyle}>
                <option value="false">False</option>
                <option value="true">True</option>
            </select>
        );
    }
    return (
        <input type={def.type === 'number' ? 'number' : 'text'} value={value ?? ''} onChange={e => onChange(e.target.value)} style={inputStyle} />
    );
}

/* ── "+ ADD" attribute picker dialog ────────────────────────── */
function AddAttributeDialog({ existingKeys, onAdd, onCancel }) {
    const [query,  setQuery]  = useState('');
    const [picked, setPicked] = useState(null);
    const [type,   setType]   = useState('string');

    const matches = ATTRIBUTE_DEFS.filter(d =>
        !existingKeys.includes(d.key) && d.label.toLowerCase().includes(query.toLowerCase())
    );

    const pick = (def) => { setPicked(def); setQuery(def.label); setType(def.type); };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 340, padding: '18px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                <div style={{ position: 'relative', marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 11.5, color: '#3b82f6', fontWeight: 600, marginBottom: 4 }}>Attribute</label>
                    <input autoFocus value={query} onChange={e => { setQuery(e.target.value); setPicked(null); }}
                        style={{ ...inputStyle, borderColor: '#3b82f6' }} />
                    {query && !picked && matches.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10 }}>
                            {matches.map(d => (
                                <div key={d.key} onMouseDown={e => e.preventDefault()} onClick={() => pick(d)}
                                    style={{ padding: '8px 14px', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                                    {d.label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: 18 }}>
                    <label style={{ display: 'block', fontSize: 11.5, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>Type</label>
                    <select value={type} onChange={e => setType(e.target.value)} style={selectStyle}>
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                    </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18 }}>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>CANCEL</button>
                    <button onClick={() => picked && onAdd({ ...picked, type })} disabled={!picked}
                        style={{ background: 'none', border: 'none', color: picked ? '#3b82f6' : '#cbd5e1', fontSize: 13, fontWeight: 700, cursor: picked ? 'pointer' : 'not-allowed' }}>
                        ADD
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── main modal ──────────────────────────────────────────────── */
export default function ImportDeviceModal({ onClose, onCreated }) {
    const [openSections, setOpenSections] = useState({ required: true, extra: true, sensors: true, attributes: true });
    const toggle = (k) => setOpenSections(s => ({ ...s, [k]: !s[k] }));

    const [groups,    setGroups]    = useState([]);
    const [calendars, setCalendars] = useState([]);

    const [form, setForm] = useState({
        name: '', identifier: '',
        groupId: '', phone: '', model: '', contact: '',
        category: 'default', calendarId: '',
        expirationTime: '', disabled: false,
    });
    const [sensors, setSensors] = useState({ fuel: false, temperature: false });
    const [attributes,   setAttributes]   = useState([]); // [{ key, label, type, value }]
    const [showAddAttr,  setShowAddAttr]  = useState(false);
    const [error,        setError]        = useState('');
    const [saving,       setSaving]       = useState(false);

    useEffect(() => {
        api.getTraccarGroups().then(res => setGroups(res.data)).catch(() => {});
        api.getTraccarCalendars().then(res => setCalendars(res.data)).catch(() => {});
    }, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const addAttribute = (def) => {
        setAttributes(a => [...a, { ...def, value: def.type === 'boolean' ? false : '' }]);
        setShowAddAttr(false);
    };
    const updateAttributeValue = (key, value) => setAttributes(a => a.map(at => at.key === key ? { ...at, value } : at));
    const removeAttribute = (key) => setAttributes(a => a.filter(at => at.key !== key));

    const handleSubmit = async () => {
        setError('');
        if (!form.name.trim() || !form.identifier.trim()) {
            setError('Name and Identifier are required.');
            return;
        }
        setSaving(true);
        try {
            const attrObj = {};
            attributes.forEach(a => { attrObj[a.key] = a.type === 'number' ? Number(a.value) : a.value; });

            if (sensors.fuel) {
                attrObj.fuelSensor = true;
                if (attrObj.fuelDropThreshold === undefined)     attrObj.fuelDropThreshold = 15;
                if (attrObj.fuelIncreaseThreshold === undefined) attrObj.fuelIncreaseThreshold = 15;
            }
            if (sensors.temperature) {
                attrObj.temperatureSensor = true;
            }

            await api.createTraccarDevice({
                name:           form.name.trim(),
                uniqueId:       form.identifier.trim(),
                groupId:        form.groupId ? Number(form.groupId) : 0,
                phone:          form.phone || undefined,
                model:          form.model || undefined,
                contact:        form.contact || undefined,
                category:       form.category || undefined,
                calendarId:     form.calendarId ? Number(form.calendarId) : 0,
                expirationTime: form.expirationTime ? new Date(form.expirationTime).toISOString() : undefined,
                disabled:       form.disabled,
                attributes:     attrObj,
            });
            onCreated?.();
            onClose();
        } catch (e) {
            const errors = e.response?.data?.errors;
            setError(errors ? Object.values(errors).flat().join(' ') : (e.response?.data?.message || 'Failed to register device.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Register Device</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22, lineHeight: 1 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <Section title="Required" open={openSections.required} onToggle={() => toggle('required')}>
                        <Field label="Name">
                            <input value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} />
                        </Field>
                        <Field label="Identifier" hint="IMEI, serial number or other id. It has to match the identifier device reports to the server.">
                            <input value={form.identifier} onChange={e => set('identifier', e.target.value)} style={inputStyle} />
                        </Field>
                    </Section>

                    <Section title="Extra" open={openSections.extra} onToggle={() => toggle('extra')}>
                        <Field label="Group">
                            <select value={form.groupId} onChange={e => set('groupId', e.target.value)} style={selectStyle}>
                                <option value="">None</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Phone">
                            <input value={form.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} />
                        </Field>
                        <Field label="Model">
                            <input value={form.model} onChange={e => set('model', e.target.value)} style={inputStyle} />
                        </Field>
                        <Field label="Contact">
                            <input value={form.contact} onChange={e => set('contact', e.target.value)} style={inputStyle} />
                        </Field>
                        <Field label="Category">
                            <select value={form.category} onChange={e => set('category', e.target.value)} style={selectStyle}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
                            </select>
                        </Field>
                        <Field label="Calendar">
                            <select value={form.calendarId} onChange={e => set('calendarId', e.target.value)} style={selectStyle}>
                                <option value="">None</option>
                                {calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Expiration" hint="Leave blank for no expiration. Max year 2038 (MySQL TIMESTAMP limit).">
                            <input type="date" value={form.expirationTime} max="2038-01-19" onChange={e => set('expirationTime', e.target.value)} style={inputStyle} />
                        </Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                            <input type="checkbox" checked={form.disabled} onChange={e => set('disabled', e.target.checked)} style={{ accentColor: '#3b82f6', width: 15, height: 15 }} />
                            Disabled
                        </label>
                    </Section>

                    <Section title="Sensors" open={openSections.sensors} onToggle={() => toggle('sensors')}>
                        <p style={{ margin: '0 0 12px', fontSize: 11.5, color: '#9ca3af', lineHeight: 1.4 }}>
                            Marks this device as sensor-equipped so it's included in the matching reports under Report → Device Statistics.
                        </p>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', marginBottom: 10 }}>
                            <input type="checkbox" checked={sensors.fuel} onChange={e => setSensors(s => ({ ...s, fuel: e.target.checked }))} style={{ accentColor: '#3b82f6', width: 15, height: 15 }} />
                            Fuel Consumption Sensor — ready for Fuel Consumption &amp; Current Fuel Value reports
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                            <input type="checkbox" checked={sensors.temperature} onChange={e => setSensors(s => ({ ...s, temperature: e.target.checked }))} style={{ accentColor: '#3b82f6', width: 15, height: 15 }} />
                            Temperature Sensor — ready for Temperature &amp; Humidity report
                        </label>
                    </Section>

                    <Section title="Attributes" open={openSections.attributes} onToggle={() => toggle('attributes')}>
                        {attributes.map(a => (
                            <div key={a.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ flex: 1 }}>
                                    <Field label={a.label}>
                                        <AttributeValueInput def={a} value={a.value} onChange={v => updateAttributeValue(a.key, v)} />
                                    </Field>
                                </div>
                                <button onClick={() => removeAttribute(a.key)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 18, marginTop: 22 }}>×</button>
                            </div>
                        ))}
                        <button onClick={() => setShowAddAttr(true)} style={{ width: '100%', padding: '9px 0', border: '1.5px solid #3b82f6', borderRadius: 8, background: '#fff', color: '#3b82f6', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                            + ADD
                        </button>
                    </Section>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: '#ef4444' }}>{error}</span>
                    <button onClick={onClose} style={{ padding: '8px 22px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Cancel</button>
                    <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 22px', border: 'none', borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Registering…' : 'Register'}
                    </button>
                </div>
            </div>

            {showAddAttr && (
                <AddAttributeDialog existingKeys={attributes.map(a => a.key)} onAdd={addAttribute} onCancel={() => setShowAddAttr(false)} />
            )}
        </div>
    );
}
