import DeviceStatusIcons, { alarmLabel } from './DeviceStatusIcons.jsx';

function CollapseArrow({ open }) {
    return (
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {open
                ? <polyline points="5.5,1 1.5,5.5 5.5,10"/>
                : <polyline points="1.5,1 5.5,5.5 1.5,10"/>
            }
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#94a3b8" strokeWidth="1.7">
            <circle cx="6" cy="6" r="4.5"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>
        </svg>
    );
}

function SignalBars({ pct, online }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
            {[25, 50, 75, 100].map((t, i) => (
                <span key={i} style={{ width: 3, height: 4 + i * 2.5, borderRadius: 1, background: online && pct >= t ? '#3b82f6' : '#24344f', display: 'block' }} />
            ))}
            <span style={{ fontSize: 10, color: online ? '#3b82f6' : '#5e7094', marginLeft: 2, lineHeight: 1 }}>{pct}%</span>
        </span>
    );
}

export default function DeviceList({ devices, selected, onSelect, search, setSearch, loading, open, onToggle }) {
    return (
        <div style={{ display: 'flex', flexShrink: 0 }}>
            {/* Panel — width collapses to 0, content stays 260 and clips */}
            <div style={{
                width: open ? 260 : 0,
                minWidth: open ? 260 : 0,
                overflow: 'hidden',
                background: '#111c33',
                borderRight: open ? '1px solid #1e2c46' : 'none',
                transition: 'width 0.22s ease, min-width 0.22s ease',
                display: 'flex',
                flexDirection: 'column',
            }}>
                <div style={{ width: 260, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Header — no hamburger */}
                    <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid #1e2c46', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#5e7094', letterSpacing: 1.2 }}>DEVICES</span>
                    </div>

                    {/* Search */}
                    <div style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><SearchIcon /></span>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search device..."
                                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 32px', border: '1.5px solid #1e2c46', borderRadius: 8, fontSize: 13, outline: 'none', background: '#16233c', color: '#eaeff9' }} />
                        </div>
                    </div>

                    {/* List */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {loading ? (
                            <p style={{ textAlign: 'center', color: '#5e7094', fontSize: 12, paddingTop: 32 }}>Loading devices…</p>
                        ) : devices.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#5e7094', fontSize: 12, paddingTop: 32 }}>No devices found.</p>
                        ) : devices.map(d => (
                            <div key={d.id} onClick={() => onSelect(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #1e2c46', background: selected === d.id ? '#152a4a' : 'transparent', borderLeft: `3px solid ${selected === d.id ? '#3b82f6' : 'transparent'}` }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: selected === d.id ? '#1c3a63' : '#16233c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>⚙</div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#eaeff9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 36 }}>
                                        <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.tracker}</span>
                                        <span style={{ flexShrink: 0 }}>
                                            <SignalBars pct={d.signal || 0} online={d.status === 'ONLINE'} />
                                        </span>
                                    </div>
                                    <div style={{ paddingLeft: 36, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: d.status === 'ONLINE' ? '#22c55e' : '#5e7094' }}>● {d.status}</span>
                                        {/* Named, not just flagged: a red dot alone does not tell an
                                            operator whether to call the driver or the police. */}
                                        {alarmLabel(d.alarm) && (
                                            <span style={{ fontSize: 10, fontWeight: 700, color: '#fca5a5' }}>{alarmLabel(d.alarm)}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Alarm / ignition / battery in their own column at the right edge,
                                    centred against the whole row — the same arrangement Traccar
                                    uses, and it keeps the icons in one scannable line down the
                                    list instead of jumping with each device's name length.
                                    flexShrink:0 is what stops the signal reading from riding over
                                    the icons when a name runs long. */}
                                <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                                    <DeviceStatusIcons device={d} size={15} />
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right-side collapse strip */}
            <button onClick={onToggle} title={open ? 'Collapse' : 'Expand'} style={{
                width: 13, background: '#1e2c46', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#9daec9', flexShrink: 0, transition: 'background 0.15s',
                borderRight: '1px solid #24344f',
            }}>
                <CollapseArrow open={open} />
            </button>
        </div>
    );
}
