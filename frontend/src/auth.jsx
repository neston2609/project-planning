import { createContext, useContext, useEffect, useState } from 'react';
import api from './api';
import { DEFAULT_MENU_KEYS } from './menuRegistry';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('rpa_user') || 'null'); } catch { return null; }
    });

    useEffect(() => {
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
export const isTenantUser   = (u) => u && u.role === 'tenantuser';
/** Any platform-level role: 'tenantadmin' (full) or 'tenantuser' (dashboard-only). */
export const isPlatformRole = (u) => u && (u.role === 'tenantadmin' || u.role === 'tenantuser');
export const isAuthenticated = (u) => !!u;
export const hasMenuAccess = (u, key) => {
    if (!u || !key) return false;
    if (isPlatformRole(u)) return true;
    const permissions = Array.isArray(u.menu_permissions)
        ? u.menu_permissions
        : (DEFAULT_MENU_KEYS[u.role] || DEFAULT_MENU_KEYS.user);
    return permissions.includes(key);
};
export const roleLabel = (role) => ({
    user: 'User (View only)',
    admin: 'Admin',
    superadmin: 'Superadmin',
    tenantadmin: 'Tenant Admin (Platform)',
    tenantuser:  'Tenant User (Platform read-only)'
}[role] || role || '');

/**
 * The product name shown across the UI. Each tenant brands the app with its
 * own name, e.g. tenant "Automation Excellence" -> "Automation Excellence
 * Planning". Platform users without a tenant see the BSM Summary brand.
 */
export const appTitle = (u) => {
    if (isPlatformRole(u)) return 'BSM Summary';
    const name = u && u.tenant_name ? String(u.tenant_name).trim() : '';
    return name ? `${name} Planning` : 'RPA Planning';
};
