import { useState } from 'react';
import { api } from '../api.js';

/**
 * The login fields, with their colours pinned.
 *
 * Only `color` was set here and nothing set a background, so on a machine in dark mode the
 * browser supplied its own dark field behind text explicitly coloured near-black and whatever you
 * typed was invisible. `colorScheme: 'light'` tells the UA not to restyle the control at all;
 * setting background and colour together means the field reads the same under either OS theme.
 */
const INPUT_STYLE = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
    background: '#fff', color: '#0f172a', colorScheme: 'light',
};

/**
 * Autofill is the one case an inline style cannot reach: Chrome paints saved credentials with its
 * own background and text colour at a specificity no inline style beats, which in dark mode is
 * the same unreadable pairing again. A large inset shadow is the long-standing way to repaint the
 * field, and -webkit-text-fill-color the only thing that moves the text with it.
 */
const AUTOFILL_CSS = `
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus {
        -webkit-box-shadow: 0 0 0 1000px #fff inset;
        -webkit-text-fill-color: #0f172a;
        caret-color: #0f172a;
    }
`;

export default function LoginPage({ onLogin }) {
    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [error,    setError]    = useState('');
    const [loading,  setLoading]  = useState(false);

    const handleSubmit = async () => {
        setError('');
        if (!email || !password) { setError('Email and password are required.'); return; }
        setLoading(true);
        try {
            const res = await api.login(email, password);
            onLogin(res.data);
        } catch (err) {
            setError(
                err.response?.data?.errors?.email?.[0] ||
                err.response?.data?.message ||
                'Invalid email or password.'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', position: 'relative' }}>
            <div style={{ position: 'fixed', inset: 0, opacity: 0.06, backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
            <div style={{ background: '#fff', borderRadius: 16, padding: '44px 40px', width: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.4)', position: 'relative', zIndex: 1 }}>
                <style>{AUTOFILL_CSS}</style>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 12px' }}>📡</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Turprotrack</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>GPS Fleet Management System</div>
                </div>

                <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Email</label>
                    <input style={INPUT_STYLE}
                        type="email" value={email} placeholder="admin@fleet.com"
                        onChange={e => setEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                </div>

                <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Password</label>
                    <input style={INPUT_STYLE}
                        type="password" value={password} placeholder="••••••••"
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                </div>

                {error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
                        {error}
                    </div>
                )}

                <button style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
                    onClick={handleSubmit} disabled={loading}>
                    {loading ? 'Signing in…' : 'Sign In'}
                </button>

                <p style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: '#94a3b8' }}>
                    Demo: admin@fleet.com / admin123
                </p>
            </div>
        </div>
    );
}
