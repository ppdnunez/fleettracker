import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { api, setAuthToken } from './api.js';
import './bootstrap.js';
import LoginPage from './pages/LoginPage.jsx';
import Dashboard from './pages/Dashboard.jsx';

function App() {
    const [user,    setUser]    = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('fleet_token');
        if (token) {
            setAuthToken(token);
            api.me()
                .then(res => setUser(res.data))
                .catch(() => setAuthToken(null))
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const handleLogin = ({ user, token }) => {
        setAuthToken(token);
        setUser(user);
    };

    const handleLogout = async () => {
        try { await api.logout(); } catch (_) {}
        setAuthToken(null);
        setUser(null);
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
                <p style={{ color: '#94a3b8', fontSize: 14 }}>Loading FleetTrack…</p>
            </div>
        );
    }

    return user
        ? <Dashboard user={user} onLogout={handleLogout} />
        : <LoginPage onLogin={handleLogin} />;
}

createRoot(document.getElementById('app')).render(<App />);
