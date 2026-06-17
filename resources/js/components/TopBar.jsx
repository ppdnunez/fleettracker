const TalkSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 2.5 Q2 1 3.5 1 H9.5 Q11 1 11 2.5 V7.5 Q11 9 9.5 9 H7L4.5 12 V9 H3.5 Q2 9 2 7.5 Z"/>
    </svg>
);
const LocationSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6.5 1 C4 1 2 3 2 5.5 C2 8.5 6.5 13 6.5 13 C6.5 13 11 8.5 11 5.5 C11 3 9 1 6.5 1 Z"/>
        <circle cx="6.5" cy="5.5" r="1.8" fill="currentColor" stroke="none"/>
    </svg>
);

export default function TopBar({ onlineCount, total, mapMode, setMapMode, selectedDevice }) {
    const isVideo = mapMode === 'Video';

    return (
        <header style={{ height: 52, background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0, gap: 12 }}>

            {/* Mode tabs */}
            <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                {[['Map', '🗺', 'Map Mode'], ['Video', '📹', 'Video Mode']].map(([key, icon, label]) => {
                    const active = mapMode === key;
                    return (
                        <button key={key} onClick={() => setMapMode(key)} style={{
                            height: '100%', padding: '0 14px', border: 'none',
                            borderBottom: active ? '2.5px solid #3b82f6' : '2.5px solid transparent',
                            background: 'none', cursor: 'pointer',
                            color: active ? '#3b82f6' : '#64748b',
                            fontSize: 12, fontWeight: active ? 700 : 500,
                            display: 'flex', alignItems: 'center', gap: 5,
                            transition: 'color 0.15s, border-color 0.15s',
                            marginBottom: -1,
                        }}>
                            <span>{icon}</span>{label}
                        </button>
                    );
                })}
            </div>

            {/* Center: selected device info (Video mode only) */}
            {isVideo && (
                <div style={{ flex: 1, textAlign: 'center', fontSize: 13 }}>
                    {selectedDevice ? (
                        <>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>{selectedDevice.name}</span>
                            <span style={{ color: '#475569' }}>({selectedDevice.tracker})</span>
                            <span style={{ color: selectedDevice.status === 'ONLINE' ? '#16a34a' : '#94a3b8', marginLeft: 2 }}>
                                [{selectedDevice.status === 'ONLINE' ? 'Online' : 'Offline'}]
                            </span>
                        </>
                    ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>No device selected</span>
                    )}
                </div>
            )}

            {/* Right side */}
            {isVideo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button style={{ padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Start All
                    </button>
                    <button style={{ padding: '6px 14px', background: '#fff', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Stop All
                    </button>
                    <button style={{ padding: '6px 12px', background: '#fff', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <TalkSVG /> Talk
                    </button>
                    <button style={{ padding: '6px 12px', background: '#fff', color: '#475569', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <LocationSVG /> Location
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', letterSpacing: 1 }}>DEVICE LIST</span>
                        <span style={{ background: '#eff6ff', color: '#1e40af', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, border: '1px solid #bfdbfe' }}>{onlineCount}/{total}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                        <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>LIVE</span>
                    </div>
                </div>
            )}
        </header>
    );
}