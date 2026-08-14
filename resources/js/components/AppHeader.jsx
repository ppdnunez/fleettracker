/* Slim application header shown above every page: which tenant's data is on screen, and the
   signed-in user chip in the upper-right corner (both used to sit in the sidebar). */
export default function AppHeader({ user }) {
    if (!user) return null;

    const initial = (user.name || '?').trim().charAt(0).toUpperCase();
    // A tenant sees their client name; a platform admin is not scoped to one, and every
    // Traccar call they make runs on the service account that can see the whole fleet.
    const scope = user.client ? user.client.name : 'All Fleets';
    const suspended = user.client && user.client.status !== 'active';

    return (
        <header style={{
            height: 46, flexShrink: 0, background: '#fff', borderBottom: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', gap: 12,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    background: user.client ? '#eff6ff' : '#f1f5f9',
                    color:      user.client ? '#1e40af' : '#475569',
                    border: `1px solid ${user.client ? '#bfdbfe' : '#e2e8f0'}`,
                }}>
                    {scope}
                </span>
                {suspended && (
                    <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                        Suspended
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#fff',
                }}>
                    {initial}
                </div>
                <div style={{ overflow: 'hidden', lineHeight: 1.25 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.name}
                    </p>
                    <p style={{ margin: 0, fontSize: 10.5, color: '#94a3b8', textTransform: 'capitalize' }}>
                        {user.role || 'Administrator'}
                    </p>
                </div>
            </div>
        </header>
    );
}
