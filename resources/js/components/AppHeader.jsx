/* Application header shown above every page: where you are, whose data is on screen, and the
   signed-in user chip in the upper-right corner.

   Dark to match the sidebar rather than the content below it — the two together read as the app's
   chrome, with the page itself framed inside them. */
export default function AppHeader({ user, title }) {
    if (!user) return null;

    const initial = (user.name || '?').trim().charAt(0).toUpperCase();
    const suspended = user.client && user.client.status !== 'active';

    return (
        <header style={{
            height: 58, flexShrink: 0, background: '#141414', borderBottom: '1px solid #2c2c2c',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: 12,
        }}>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: '#5a4e42', textTransform: 'uppercase' }}>
                    Fleet Operations
                </div>
                <div style={{
                    fontSize: 15, fontWeight: 700, color: '#f5f0e8', lineHeight: 1.25,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {title || 'Dashboard'}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {/* Only a tenant's company name is worth the space. A platform administrator's
                    "All Fleets" said nothing they did not already know, so it is not shown; for a
                    tenant this is still the one place that names whose fleet is on screen. */}
                {user.client && (
                    <span style={{
                        padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        background: '#222222', color: '#f59e0b', border: '1px solid #78440a',
                    }}>
                        {user.client.name}
                    </span>
                )}
                {suspended && (
                    <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#3b1418', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
                        Suspended
                    </span>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg,#d97706,#b45309)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13.5, fontWeight: 700, color: '#04211d',
                    }}>
                        {initial}
                    </div>
                    <div style={{ overflow: 'hidden', lineHeight: 1.25 }}>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#f5f0e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {user.name}
                        </p>
                        <p style={{ margin: 0, fontSize: 10.5, color: '#5a4e42', textTransform: 'capitalize' }}>
                            {user.role || 'Administrator'}
                        </p>
                    </div>
                </div>
            </div>
        </header>
    );
}
