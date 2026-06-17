import { useState } from 'react';
import EditDeviceModal   from './EditDeviceModal.jsx';
import ImportDeviceModal from './ImportDeviceModal.jsx';

const ImportSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
        <path d="M6.5 1v7M4 6l2.5 2.5L9 6"/>
        <path d="M1 10v1.5A1.5 1.5 0 0 0 2.5 13h8A1.5 1.5 0 0 0 12 11.5V10"/>
    </svg>
);

/* ── icon SVGs ─────────────────────────────────────────────── */
const EditSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 12 L4 12 L11.5 4.5 L9.5 2.5 Z"/>
        <line x1="9.5" y1="2.5" x2="11.5" y2="4.5"/>
    </svg>
);
const UserSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="7.5" cy="5" r="3"/>
        <path d="M1 14 Q1.5 9.5 7.5 9.5 Q13.5 9.5 14 14"/>
    </svg>
);
const PinSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M7.5 1 C5 1 2.5 3.5 2.5 6.2 C2.5 9.8 7.5 14 7.5 14 C7.5 14 12.5 9.8 12.5 6.2 C12.5 3.5 10 1 7.5 1Z"/>
        <circle cx="7.5" cy="6" r="2" fill="currentColor" stroke="none"/>
    </svg>
);
const ListSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <line x1="5" y1="4"  x2="13" y2="4"/>
        <line x1="5" y1="8"  x2="13" y2="8"/>
        <line x1="5" y1="12" x2="13" y2="12"/>
        <circle cx="2.2" cy="4"  r="1" fill="currentColor" stroke="none"/>
        <circle cx="2.2" cy="8"  r="1" fill="currentColor" stroke="none"/>
        <circle cx="2.2" cy="12" r="1" fill="currentColor" stroke="none"/>
    </svg>
);
const ChevronSVG = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <polyline points="2,3 5,7 8,3"/>
    </svg>
);

/* ── tiny components ───────────────────────────────────────── */
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 5, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

function Btn({ children, primary, onClick }) {
    return (
        <button onClick={onClick} style={{ padding: '6px 13px', borderRadius: 6, border: primary ? 'none' : '1px solid #d1d5db', background: primary ? '#3b82f6' : '#fff', color: primary ? '#fff' : '#374151', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: primary ? 600 : 400 }}>
            {children}
        </button>
    );
}
function DropBtn({ children }) {
    return (
        <button style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 12.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            {children}<ChevronSVG />
        </button>
    );
}
function Sep() {
    return <div style={{ width: 1, height: 24, background: '#e5e7eb', flexShrink: 0 }} />;
}

/* ── table styles ──────────────────────────────────────────── */
const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb' };
const TD = { padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

/* ── main component ────────────────────────────────────────── */
export default function DeviceManagement({ devices, loading, onRefresh }) {
    const [filter,      setFilter]      = useState({ imei: '', name: '', model: '' });
    const [editDevice,  setEditDevice]  = useState(null);
    const [showImport,  setShowImport]  = useState(false);
    const [selected,    setSelected]    = useState(new Set());

    const models = [...new Set(devices.map(d => d.tracker).filter(Boolean))];

    const filtered = devices.filter(d =>
        (!filter.imei  || String(d.imei ?? d.id).includes(filter.imei)) &&
        (!filter.name  || d.name.toLowerCase().includes(filter.name.toLowerCase())) &&
        (!filter.model || d.tracker === filter.model)
    );

    const allChecked = filtered.length > 0 && filtered.every(d => selected.has(d.id));
    const toggleAll  = () => setSelected(allChecked ? new Set() : new Set(filtered.map(d => d.id)));
    const toggleOne  = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
            {/* Page title */}
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Device Management</h2>
            </div>

            {/* Search bar */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                <input value={filter.imei} onChange={e => setFilter(f => ({ ...f, imei: e.target.value }))}
                    placeholder="IMEI(Press Enter for multiple lines)"
                    style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 220 }} />
                <input value={filter.name} onChange={e => setFilter(f => ({ ...f, name: e.target.value }))}
                    placeholder="Device name"
                    style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 150 }} />
                <select value={filter.model} onChange={e => setFilter(f => ({ ...f, model: e.target.value }))}
                    style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', minWidth: 130, background: '#fff', cursor: 'pointer' }}>
                    <option value="">All model</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" /> Sub-account devices
                </label>
                <button onClick={() => {}} style={{ padding: '7px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={() => setFilter({ imei: '', name: '', model: '' })} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
                <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Advanced Search <ChevronSVG />
                </button>
            </div>

            {/* Action buttons row 1 */}
            <div style={{ padding: '8px 20px 4px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                <button onClick={() => setShowImport(true)} style={{ padding: '6px 13px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                    <ImportSVG />Import device
                </button>
                <Btn>Renew</Btn>
                <Btn>Sell/move</Btn>
                <Btn>Update user expiration</Btn>
                <Sep />
                <DropBtn>Send Command</DropBtn>
                <DropBtn>Batch settings</DropBtn>
                <Btn>Bind device</Btn>
                <Sep />
                <Btn>Disable</Btn>
                <Btn>Enable</Btn>
                <DropBtn>Batch operations</DropBtn>
                <Sep />
                <Btn>Set group</Btn>
                <Btn>Allow activation</Btn>
                <div style={{ flex: 1 }} />
                <Btn>Export</Btn>
                <Btn>Export all</Btn>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                    <thead>
                        <tr>
                            <th style={{ ...TH, width: 40 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                            <th style={{ ...TH, width: 50 }}>No.</th>
                            <th style={TH}>Account</th>
                            <th style={TH}>Device name</th>
                            <th style={TH}>IMEI</th>
                            <th style={TH}>Device Model</th>
                            <th style={TH}>Activated time</th>
                            <th style={TH}>Subscription Expiration</th>
                            <th style={TH}>Expiration Date(U)</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={10} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={10} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data found</td></tr>
                        ) : filtered.map((d, i) => (
                            <tr key={d.id} style={{ background: selected.has(d.id) ? '#eff6ff' : '#fff' }}>
                                <td style={TD}><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleOne(d.id)} /></td>
                                <td style={{ ...TD, color: '#6b7280' }}>{i + 1}</td>
                                <td style={TD}>nextgenpng</td>
                                <td style={{ ...TD, fontWeight: 500 }}>{d.name}</td>
                                <td style={{ ...TD, color: '#3b82f6', textAlign: 'center' }}>{d.imei ?? d.id}</td>
                                <td style={{ ...TD, textAlign: 'center' }}>{d.tracker || '—'}</td>
                                <td style={{ ...TD, textAlign: 'center', color: '#94a3b8' }}>—</td>
                                <td style={{ ...TD, textAlign: 'center' }}>12Month</td>
                                <td style={{ ...TD, textAlign: 'center', color: '#94a3b8' }}>—</td>
                                <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn} title="Edit"    onClick={() => setEditDevice(d)}><EditSVG /></button>
                                    <button style={iconBtn} title="Customer"><UserSVG /></button>
                                    <button style={iconBtn} title="Location"><PinSVG /></button>
                                    <button style={iconBtn} title="Detail">  <ListSVG /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editDevice && (
                <EditDeviceModal
                    device={editDevice}
                    onClose={() => setEditDevice(null)}
                    onSave={() => { setEditDevice(null); onRefresh(); }}
                />
            )}
            {showImport && <ImportDeviceModal onClose={() => setShowImport(false)} />}
        </div>
    );
}
