import { createContext, useContext, useEffect, useState } from 'react';
import api from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('rpa_user') || 'null'); } catch { return null; }
    });

    useEffect(() => {
        // If we still have a token, refresh /me to validate it.
        const t = localStorage.getItem('rpa_token');
        if (!t) return;
        api.get('/auth/me')
            .then(r => { setUser(r.data); localStorage.setItem('rpa_user', JSON.stringify(r.data)); })
            .catch(() => { /* interceptor will redirect on 401 */ });
    }, []);

    const login = async (username, password) => {
        const r = await api.post('/auth/login', { username, password });
        localStorage.setItem('rpa_token', r.data.token);
        localStorage.setItem('rpa_user',  JSON.stringify(r.data.user));
        setUser(r.data.user);
        return r.data.user;
    };

    const logout = () => {
        localStorage.removeItem('rpa_token');
        localStorage.removeItem('rpa_user');
        setUser(null);
    };

    return (
        <AuthCtx.Provider value={{ user, login, logout, setUser }}>
            {children}
        </AuthCtx.Provider>
    );
}

export const useAuth = () => useContext(AuthCtx);
export const isAdmin = (u) => u && (u.role === 'admin' || u.role === 'superadmin');
export const isSuperadmin = (u) => u && u.role === 'superadmin';
