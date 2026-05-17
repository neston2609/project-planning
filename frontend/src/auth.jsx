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

    const login = async (username, password, tenantId) => {
        const r = await api.post('/auth/login', {
            username,
            password,
            tenant_id: (tenantId == null || tenantId === '') ? null : Number(tenantId)
        });
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
export const isAdmin        = (u) => u && (u.role === 'admin' || u.role === 'superadmin');
export const isSuperadmin   = (u) => u && u.role === 'superadmin';
export const isTenantAdmin  = (u) => u && u.role === 'tenantadmin';
export const isAuthenticated = (u) => !!u;
export const roleLabel = (role) => ({
    user: 'User (View only)',
    admin: 'Admin',
    superadmin: 'Superadmin',
    tenantadmin: 'Tenant Admin (Platform)'
}[role] || role || '');

/**
 * The product name shown across the UI. Each tenant brands the app with its
 * own name, e.g. tenant "Automation Excellence" -> "Automation Excellence
 * Planning". Falls back to "RPA Planning" when there's no tenant context
 * (login screen, or the global TenantAdmin).
 */
export const appTitle = (u) => {
    const name = u && u.tenant_name ? String(u.tenant_name).trim() : '';
    return name ? `${name} Planning` : 'RPA Planning';
};
