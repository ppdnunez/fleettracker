import { useState } from 'react';
import EditDeviceModal    from './EditDeviceModal.jsx';
import ImportDeviceModal  from './ImportDeviceModal.jsx';
import IButtonConfigModal from './IButtonConfigModal.jsx';
import DrivingBehaviorAlertModal from './DrivingBehaviorAlertModal.jsx';

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
/* Card/fob outline — the iButton (card reader) configuration panel. */
const CardSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.2" y="3" width="12.6" height="9" rx="1.6"/>
        <line x1="1.2" y1="6" x2="13.8" y2="6"/>
        <line x1="3.6" y1="9.3" x2="7" y2="9.3"/>
    </svg>
);
/* Speedometer — the driving-behaviour alert thresholds. */
const GaugeSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.8 11.2a6.2 6.2 0 1 1 11.4 0"/>
        <line x1="7.5" y1="11" x2="10.4" y2="6.6"/>
        <circle cx="7.5" cy="11.2" r="1" fill="currentColor" stroke="none"/>
    </svg>
);
/* ── tiny components ───────────────────────────────────────── */
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', padding: 5, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

/* ── table styles ──────────────────────────────────────────── */
const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#d5c9b8', borderBottom: '2px solid #2c2c2c', whiteSpace: 'nowrap', background: '#222222' };
const TD = { padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #2c2c2c' };

/* ── main component ────────────────────────────────────────── */
export default function DeviceManagement({ devices, loading, onRefresh }) {
    const [filter,      setFilter]      = useState({ imei: '', name: '', model: '' });
    const [editDevice,  setEditDevice]  = useState(null);
    const [showImport,  setShowImport]  = useState(false);
    const [selected,    setSelected]    = useState(new Set());
    // Raw device-command panels. Both are keyed by IMEI rather than the Traccar device id,
    // because the command goes to the device itself.
    const [ibuttonDevice,      setIbuttonDevice]      = useState(null);
    const [drivingAlertDevice, setDrivingAlertDevice] = useState(null);

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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a1a' }}>
            {/* Search bar */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #2c2c2c', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                <input value={filter.imei} onChange={e => setFilter(f => ({ ...f, imei: e.target.value }))}
                    placeholder="IMEI(Press Enter for multiple lines)"
                    style={{ padding: '7px 12px', border: '1px solid #383838', borderRadius: 6, fontSize: 13, outline: 'none', width: 220 }} />
                <input value={filter.name} onChange={e => setFilter(f => ({ ...f, name: e.target.value }))}
                    placeholder="Device name"
                    style={{ padding: '7px 12px', border: '1px solid #383838', borderRadius: 6, fontSize: 13, outline: 'none', width: 150 }} />
                <select value={filter.model} onChange={e => setFilter(f => ({ ...f, model: e.target.value }))}
                    style={{ padding: '7px 12px', border: '1px solid #383838', borderRadius: 6, fontSize: 13, outline: 'none', minWidth: 130, background: '#1a1a1a', cursor: 'pointer' }}>
                    <option value="">All model</option>
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={() => {}} style={{ padding: '7px 20px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
                <button onClick={() => setFilter({ imei: '', name: '', model: '' })} style={{ padding: '7px 14px', background: '#1a1a1a', color: '#d5c9b8', border: '1px solid #383838', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>

            {/* Action buttons row 1 */}
            <div style={{ padding: '8px 20px 4px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                <button onClick={() => setShowImport(true)} style={{ padding: '6px 13px', borderRadius: 6, border: 'none', background: '#d97706', color: '#fff', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                    <ImportSVG />Import device
                </button>
                <div style={{ flex: 1 }} />
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
                            {/* The number SMS commands go to — shown here because a device without
                                one silently cannot be configured from the iButton/alert panels. */}
                            <th style={TH}>Phone (SMS)</th>
                            <th style={TH}>Expiration</th>
                            <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5a4e42' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={9} style={{ ...TD, textAlign: 'center', padding: 48, color: '#5a4e42' }}>No data found</td></tr>
                        ) : filtered.map((d, i) => (
                            <tr key={d.id} style={{ background: selected.has(d.id) ? '#372817' : '#1a1a1a' }}>
                                <td style={TD}><input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleOne(d.id)} /></td>
                                <td style={{ ...TD, color: '#9a8a75' }}>{i + 1}</td>
                                <td style={TD}>nextgenpng</td>
                                <td style={{ ...TD, fontWeight: 500 }}>{d.name}</td>
                                <td style={{ ...TD, color: '#d97706', textAlign: 'center' }}>{d.imei ?? d.id}</td>
                                <td style={{ ...TD, textAlign: 'center' }}>{d.tracker || '—'}</td>
                                {/* Read-only: the number is set through Edit, like every other
                                    Traccar device field. Shown because a device without one cannot
                                    receive the SMS commands the panels below send. */}
                                <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap', color: d.phone ? '#d5c9b8' : '#5a4e42' }}>
                                    {d.phone || '—'}
                                </td>
                                <td style={{ ...TD, textAlign: 'center', color: d.expirationTime ? '#d5c9b8' : '#5a4e42' }}>{d.expirationTime ? new Date(d.expirationTime).toLocaleDateString() : '—'}</td>
                                <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn} title="Edit"        onClick={() => setEditDevice(d)}><EditSVG /></button>
                                    <button style={iconBtn} title="iButton Configuration" onClick={() => setIbuttonDevice(d)}><CardSVG /></button>
                                    <button style={iconBtn} title="Driving Behavior Alerts" onClick={() => setDrivingAlertDevice(d)}><GaugeSVG /></button>
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
            {showImport && <ImportDeviceModal onClose={() => setShowImport(false)} onCreated={onRefresh} />}

            {/* `device` is passed as well as the imei so the panel can add a missing phone number
                in place — without one, SMS delivery cannot work at all. */}
            {ibuttonDevice && (
                <IButtonConfigModal
                    imei={ibuttonDevice.imei ?? String(ibuttonDevice.id)}
                    deviceName={ibuttonDevice.name}
                    device={ibuttonDevice}
                    onClose={() => { setIbuttonDevice(null); onRefresh(); }}
                />
            )}
            {drivingAlertDevice && (
                <DrivingBehaviorAlertModal
                    imei={drivingAlertDevice.imei ?? String(drivingAlertDevice.id)}
                    deviceName={drivingAlertDevice.name}
                    device={drivingAlertDevice}
                    onClose={() => { setDrivingAlertDevice(null); onRefresh(); }}
                />
            )}
        </div>
    );
}
