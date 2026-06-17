import { useState } from 'react';

/* ── vehicle application icons ─────────────────────────────── */
const APP_ICONS = [
    { key: 'sedan',    label: 'Sedan',        d: 'M3 13V16 M17 13V16 M1 13H19 M4 9H16L18 13H2L4 9Z M4.5 9L6 6H14L16 9 M5 13A2 2 0 0 0 9 13 M11 13A2 2 0 0 0 15 13' },
    { key: 'truck',    label: 'Semi Truck',   d: 'M1 12V16 M17 12V16 M1 8H13V14H1Z M13 10H19V14H13Z M4 14A2 2 0 0 0 8 14 M15 14A1.5 1.5 0 0 0 18 14' },
    { key: 'bus',      label: 'Bus',          d: 'M2 4H18V16H2Z M2 8H18 M6 16A2 2 0 0 0 10 16 M12 16A2 2 0 0 0 16 16 M2 12H18 M5 4V8 M9 4V8 M13 4V8 M17 4V8' },
    { key: 'van',      label: 'Van',          d: 'M2 8H14L17 11V15H2V8Z M4 8V5H12L14 8 M5 15A2 2 0 0 0 9 15 M12 15A2 2 0 0 0 16 15 M5 8H11V12H5Z' },
    { key: 'moto',     label: 'Motorcycle',   d: 'M4 14A4 4 0 0 0 12 14 M16 14A4 4 0 0 0 20 14 M8 14L10 8H14L16 10 M10 8L8 5H12 M4 14H0' },
    { key: 'person',   label: 'Person',       d: 'M10 4A2 2 0 0 0 10 8 M10 8V14 M7 10H13 M8 14L7 19 M12 14L13 19' },
    { key: 'animal',   label: 'Animal',       d: 'M3 10C3 7 5 5 8 5C11 5 14 7 14 10V14H3V10Z M3 12H14 M5 14V17 M12 14V17 M14 8L17 6 M14 9L17 9 M7 5L6 2 M10 5L11 2' },
    { key: 'drone',    label: 'Drone',        d: 'M3 3L7 7 M17 3L13 7 M3 17L7 13 M17 17L13 13 M7 7H13V13H7Z M9 9H11V11H9Z M3 3L1 1 M17 3L19 1 M3 17L1 19 M17 17L19 19' },
    { key: 'taxi',     label: 'Taxi',         d: 'M3 13V16 M17 13V16 M1 13H19 M4 9H16L18 13H2L4 9Z M8 7H12V9H8Z M5 13A2 2 0 0 0 9 13 M11 13A2 2 0 0 0 15 13' },
    { key: 'ev',       label: 'Electric',     d: 'M3 12V15 M15 12V15 M1 12H17 M4 8H14L16 12H2L4 8Z M5 12A2 2 0 0 0 9 12 M11 12A2 2 0 0 0 15 12 M8 3L6 7H9L7 11' },
    { key: 'minibus',  label: 'Minibus',      d: 'M1 9H17V15H1Z M1 12H17 M17 11H20V15H17Z M4 15A2 2 0 0 0 8 15 M12 15A2 2 0 0 0 16 15 M3 9V6H15V9' },
    { key: 'pickup',   label: 'Pickup',       d: 'M1 10H19V15H1Z M1 10L4 5H10V10 M10 10H19V15 M4 15A2 2 0 0 0 8 15 M14 15A2 2 0 0 0 18 15' },
    { key: 'excavator',label: 'Excavator',    d: 'M2 14H14 M2 10H8V14H2Z M8 12H14L16 10L14 8H10L8 10 M14 14V18 M12 14V18 M16 8L18 4 M18 4L20 6 M18 4L16 6' },
    { key: 'ship',     label: 'Ship',         d: 'M1 14H19 M4 14V9H16V14 M10 9V6 M7 6H13 M1 14C1 16 4 18 10 18C16 18 19 16 19 14' },
    { key: 'tractor',  label: 'Tractor',      d: 'M4 13A5 5 0 0 0 14 13 M15 13A3 3 0 0 0 21 13 M4 13H1 M9 7H16V10L14 13 M9 7V13 M9 7L7 5' },
    { key: 'dumptruck',label: 'Dump Truck',   d: 'M1 12H13V16H1Z M13 8H19V16H13Z M3 16A2 2 0 0 0 7 16 M15 16A2 2 0 0 0 19 16 M3 8H11V12H3Z M11 12L13 8' },
    { key: 'schoolbus',label: 'School Bus',   d: 'M1 6H19V15H1Z M1 10H19 M1 13H19 M5 15A2 2 0 0 0 9 15 M13 15A2 2 0 0 0 17 15 M4 6V3H16V6 M8 6V10 M12 6V10' },
    { key: 'transit',  label: 'Transit',      d: 'M2 7H18V15H2Z M2 11H18 M6 15A2 2 0 0 0 10 15 M12 15A2 2 0 0 0 16 15 M18 9H21V15H18' },
    { key: 'heli',     label: 'Helicopter',   d: 'M1 9H19 M5 9V13 M15 9V13 M8 13H12 M10 13V17 M8 17H12 M3 9A2 2 0 0 0 17 9' },
    { key: 'delivery', label: 'Delivery',     d: 'M1 9H15V15H1Z M15 11H19L20 13V15H15Z M4 15A2 2 0 0 0 8 15 M15 15A2 2 0 0 0 19 15 M3 9V7H10V9' },
    { key: 'server',   label: 'Equipment',    d: 'M2 3H18V8H2Z M2 9H18V14H2Z M2 15H18V20H2Z M5 5.5A.5.5 0 0 0 6 5.5 M5 11.5A.5.5 0 0 0 6 11.5 M5 17.5A.5.5 0 0 0 6 17.5 M8 5H16 M8 11H16 M8 17H16' },
    { key: 'cargo',    label: 'Cargo',        d: 'M2 6H18V18H2Z M2 6L10 2L18 6 M6 18V12H14V18 M6 9H14 M10 9V12' },
    { key: 'tracker',  label: 'Tracker',      d: 'M10 1A6 6 0 0 0 4 7C4 11 10 19 10 19C10 19 16 11 16 7A6 6 0 0 0 10 1Z M10 5A2 2 0 0 0 10 9A2 2 0 0 0 10 5' },
    { key: 'plane',    label: 'Airplane',     d: 'M2 12L8 9L10 2L12 9L18 12L12 12L11 16L10 18L9 16L8 12Z' },
];

/* ── styles ──────────────────────────────────────────────────── */
const sel = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', cursor: 'pointer', color: '#111827', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23999\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' };
const LF = ({ label, required, children }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
        <span style={{ minWidth: 120, textAlign: 'right', fontSize: 14, color: required ? '#111827' : '#6b7280', paddingTop: 9, flexShrink: 0 }}>
            {required && <span style={{ color: '#ef4444', marginRight: 3 }}>*</span>}{label}:
        </span>
        <div style={{ flex: 1 }}>{children}</div>
    </div>
);

export default function ImportDeviceModal({ onClose }) {
    const [form, setForm]       = useState({ model: '', service: '', account: 'NextGen PNG', remarks: '', allowBind: true });
    const [selected, setSelected] = useState(new Set());

    const toggleIcon = (key) => setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 580, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Import device</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 22, lineHeight: 1 }}>×</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 8px' }}>
                    <LF label="Device Model" required>
                        <div style={{ position: 'relative' }}>
                            <select value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} style={sel}>
                                <option value="">Please select</option>
                                <option value="VL863">VL863</option>
                                <option value="VL502">VL502</option>
                                <option value="VG502">VG502</option>
                            </select>
                        </div>
                    </LF>

                    <LF label="Service type" required>
                        <select value={form.service} onChange={e => setForm(f => ({ ...f, service: e.target.value }))} style={sel}>
                            <option value="">Please select</option>
                            <option value="gps">GPS Tracking</option>
                            <option value="fleet">Fleet Management</option>
                        </select>
                    </LF>

                    <LF label="unit price">
                        <span style={{ color: '#3b82f6', fontSize: 14, cursor: 'pointer' }}>Select price</span>
                    </LF>

                    <LF label="To account" required>
                        <select value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} style={sel}>
                            <option value="NextGen PNG">NextGen PNG</option>
                        </select>
                    </LF>

                    <LF label="Remarks">
                        <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                            rows={4} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
                    </LF>

                    <LF label="Application">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {APP_ICONS.map(({ key, label, d }) => (
                                <button key={key} title={label} onClick={() => toggleIcon(key)} style={{
                                    width: 36, height: 36, borderRadius: 6, border: `1.5px solid ${selected.has(key) ? '#3b82f6' : '#e2e8f0'}`,
                                    background: selected.has(key) ? '#eff6ff' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={selected.has(key) ? '#1e40af' : '#334155'} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d={d} />
                                    </svg>
                                </button>
                            ))}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                            <input type="checkbox" checked={form.allowBind} onChange={e => setForm(f => ({ ...f, allowBind: e.target.checked }))}
                                style={{ accentColor: '#3b82f6', width: 15, height: 15 }} />
                            Allow to be bound by APP account
                        </label>
                    </LF>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: '#374151', marginRight: 'auto' }}>Total: <span style={{ color: '#3b82f6', fontWeight: 600 }}>0 Mi Coins</span></span>
                    <button onClick={onClose} style={{ padding: '8px 22px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>Cancel</button>
                    <button style={{ padding: '8px 22px', border: 'none', borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
                </div>
            </div>
        </div>
    );
}
