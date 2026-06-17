import axios from 'axios';

export function setAuthToken(token) {
    if (token) {
        localStorage.setItem('fleet_token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        localStorage.removeItem('fleet_token');
        delete axios.defaults.headers.common['Authorization'];
    }
}

export const api = {
    login:   (email, password) => axios.post('/api/login', { email, password }),
    logout:  ()                => axios.post('/api/logout'),
    me:      ()                => axios.get('/api/user'),

    getDevices:   ()          => axios.get('/api/devices'),
    createDevice: (data)      => axios.post('/api/devices', data),
    updateDevice: (id, data)  => axios.put(`/api/devices/${id}`, data),
    deleteDevice: (id)        => axios.delete(`/api/devices/${id}`),

    getTraccarDevices:  ()             => axios.get('/api/traccar/devices'),
    getLatestPositions: ()             => axios.get('/api/traccar/positions'),
    getPositionHistory: (id, from, to) => axios.get(`/api/traccar/devices/${id}/positions`, { params: { from, to } }),
};
