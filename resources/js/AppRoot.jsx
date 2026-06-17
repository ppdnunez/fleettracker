import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import LoginPage from './pages/LoginPage.jsx';
import Dashboard from './pages/Dashboard.jsx';

// ── Axios setup ───────────────────────────────────────────────────────────────
axios.defaults.baseURL = '/';
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
const csrfToken = document.head.querySelector('meta[name="csrf-token"]');
if (csrfToken) axios.defaults.headers.common['X-CSRF-TOKEN'] = csrfToken.content;
const savedToken = localStorage.getItem('fleet_token');
if (savedToken) axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;

// ── Auth token helper ─────────────────────────────────────────────────────────
export function setAuthToken(token) {
    if (token) {
        localStorage.setItem('fleet_token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        localStorage.removeItem('fleet_token');
        delete axios.defaults.headers.common['Authorization'];
    }
}

// ── API calls ─────────────────────────────────────────────────────────────────
export const api = {
    login:   (email, password) => axios.post('/api/login', { email, password }),
    logout:  ()                => axios.post('/api/logout'),
    me:      ()                => axios.get('/api/user'),
    getDevices:   ()           => axios.get('/api/devices'),
    createDevice: (data)       => axios.post('/api/devices', data),
    updateDevice: (id, data)   => axios.put(`/api/devices/${id}`, data),
    deleteDevice: (id)         => axios.delete(`/api/devices/${id}`),
};

// ── Root App ──────────────────────────────────────────────────────────────────
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
