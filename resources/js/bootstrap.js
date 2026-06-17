import axios from 'axios';

axios.defaults.baseURL = '/';
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.withCredentials = true;

const csrfToken = document.head.querySelector('meta[name="csrf-token"]');
if (csrfToken) {
    axios.defaults.headers.common['X-CSRF-TOKEN'] = csrfToken.content;
}

const bearerToken = localStorage.getItem('fleet_token');
if (bearerToken) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${bearerToken}`;
}

window.axios = axios;
