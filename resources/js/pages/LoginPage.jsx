import { useState } from 'react';
import { api } from '../api.js';
import Logo from '../components/Logo.jsx';

/**
 * Sign-in, on the industrial palette the rest of the app uses.
 *
 * This was a white card on a gradient — the last light surface left once the modules were
 * repainted, and the first thing anyone sees. It is charcoal and amber now, so the product does
 * not change character between the login screen and the dashboard behind it.
 */

const AMBER      = '#d97706';
const SURFACE    = '#1a1a1a';
const SURFACE_2  = '#222222';
const BORDER     = '#2c2c2c';
const TEXT       = '#f5f0e8';
const TEXT_MUTED = '#9a8a75';
const TEXT_FAINT = '#5a4e42';

/**
 * The credential fields.
 *
 * `colorScheme: 'dark'` is doing real work: it tells the browser this control is dark, which fixes
 * the caret and the placeholder without either being styled by hand. It is also the inverse of the
 * bug this file had before — a field with a colour but no background, which a machine in dark mode
 * filled with its own dark grey behind near-black text.
 */
const INPUT_STYLE = {
    width: '100%', padding: '10px 14px', border: `1px solid ${BORDER}`, borderRadius: 8,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
    background: SURFACE_2, color: TEXT, colorScheme: 'dark',
};

/**
 * Autofill is the one case an inline style cannot reach: Chrome paints saved credentials with its
 * own background and text colour at a specificity no inline style beats — white on pale yellow,
 * which on this card would be the only light rectangle on screen. A large inset shadow is the
 * long-standing way to repaint the field, and -webkit-text-fill-color the only thing that moves
 * the text with it.
 *
 * The focus ring is here for the same reason: `outline: none` on the fields would otherwise leave
 * a keyboard user with no idea which one they are in.
 */
const LOGIN_CSS = `
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus {
        -webkit-box-shadow: 0 0 0 1000px ${SURFACE_2} inset;
        -webkit-text-fill-color: ${TEXT};
        caret-color: ${TEXT};
    }
    .login-field:focus {
        border-color: ${AMBER};
        box-shadow: 0 0 0 3px rgba(217,119,6,0.15);
    }
    .login-submit:hover:not(:disabled) { background: #f59e0b; }
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

    const label = {
        display: 'block', marginBottom: 6,
        fontFamily: "Oswald, 'Barlow Condensed', system-ui, sans-serif",
        fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: TEXT_MUTED,
    };

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0f0f0f', position: 'relative', padding: 20,
        }}>
            {/* A faint amber wash off one corner, so a full-screen charcoal page has some
                direction to it rather than reading as an unpainted surface. */}
            <div style={{
                position: 'fixed', inset: 0, pointerEvents: 'none',
                background: 'radial-gradient(1100px 620px at 18% 12%, rgba(217,119,6,0.10), transparent 60%)',
            }} />
            {/* Survey grid. Amber rather than white: at 4% a white grid on charcoal reads grey and
                slightly dirty, where the amber keeps the page one colour temperature. */}
            <div style={{
                position: 'fixed', inset: 0, pointerEvents: 'none', opacity: 0.045,
                backgroundImage: 'linear-gradient(#f59e0b 1px,transparent 1px),linear-gradient(90deg,#f59e0b 1px,transparent 1px)',
                backgroundSize: '44px 44px',
            }} />

            <div style={{
                background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16,
                padding: '40px 40px 32px', width: 390, position: 'relative', zIndex: 1,
                boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
            }}>
                <style>{LOGIN_CSS}</style>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                    <Logo size="lg" subtitle="Fleet · GPS · Operations" />
                </div>

                {/* A rule under the lockup, amber fading out — the same device the module headers
                    use to separate a title from its content. */}
                <div style={{
                    height: 1, margin: '18px 0 24px',
                    background: `linear-gradient(90deg, transparent, ${AMBER}, transparent)`,
                    opacity: 0.55,
                }} />

                <div style={{ marginBottom: 14 }}>
                    <label style={label}>Email</label>
                    <input className="login-field" style={INPUT_STYLE}
                        type="email" value={email} placeholder="admin@fleet.com"
                        onChange={e => setEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={label}>Password</label>
                    <input className="login-field" style={INPUT_STYLE}
                        type="password" value={password} placeholder="••••••••"
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                </div>

                {error && (
                    <div style={{
                        background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8,
                        padding: '10px 14px', fontSize: 13, color: '#fca5a5', marginBottom: 14,
                    }}>
                        {error}
                    </div>
                )}

                <button className="login-submit" onClick={handleSubmit} disabled={loading}
                    style={{
                        width: '100%', padding: 12, borderRadius: 8, border: 'none',
                        background: AMBER, color: '#141414',
                        fontFamily: "Oswald, 'Barlow Condensed', system-ui, sans-serif",
                        fontSize: 15, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        cursor: loading ? 'default' : 'pointer',
                        opacity: loading ? 0.7 : 1,
                        transition: 'background 0.15s',
                    }}>
                    {loading ? 'Signing in…' : 'Sign In'}
                </button>

                <p style={{
                    textAlign: 'center', marginTop: 20, fontSize: 11,
                    fontFamily: "Oswald, 'Barlow Condensed', system-ui, sans-serif",
                    letterSpacing: '0.1em', textTransform: 'uppercase', color: TEXT_FAINT,
                }}>
                    Demo: admin@fleet.com / admin123
                </p>
            </div>
        </div>
    );
}
