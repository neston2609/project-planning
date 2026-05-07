import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    timeout: 30_000
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('rpa_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (resp) => resp,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('rpa_token');
            localStorage.removeItem('rpa_user');
            // Reload to drop into View-Only mode rather than crash on a broken token.
            if (!window.location.pathname.startsWith('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(err);
    }
);

export default api;
