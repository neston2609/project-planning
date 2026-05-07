import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth, isAdmin, isSuperadmin } from '../auth';
import { useYear } from '../YearContext';
import { ArrowLeftOnRectangleIcon, KeyIcon } from '@heroicons/react/24/outline';

const mainNav = [
    { to: '/',                    label: 'Summary' },
    { to: '/subscription',        label: 'Subscription' },
    { to: '/perpetual-ma',        label: 'Perpetual / SW MA' },
    { to: '/implementation',      label: 'Implementation' },
    { to: '/service-ma',          label: 'Service MA' },
    { to: '/outsource',           label: 'Outsource' },
    { to: '/resource-planning',   label: 'Resource Planning' }
];

const adminNav = [
    { to: '/admin/projects',  label: 'Project Management' },
    { to: '/admin/customers', label: 'Customers' },
    { to: '/admin/resources', label: 'Resources' },
    { to: '/admin/year',      label: 'Year Config' },
    { to: '/admin/app',       label: 'App Config' },
    { to: '/admin/smtp',      label: 'SMTP' }
];

const superadminNav = [
    { to: '/admin/users',     label: 'Users' },
    { to: '/admin/login-logs',label: 'Login Logs' }
];

export default function Layout() {
    const { user, logout } = useAuth();
    const { year, setYear } = useYear();
    const nav = useNavigate();

    const years = [];
    const cur = new Date().getFullYear();
    for (let y = cur - 3; y <= cur + 3; y++) years.push(y);

    return (
        <div className="min-h-screen flex flex-col">
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
                    <Link to="/" className="text-lg font-bold text-brand-700">RPA Planning</Link>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">v1.0</span>

                    <div className="ml-auto flex items-center gap-3">
                        <label className="text-sm text-slate-600">Year</label>
                        <select className="input !w-24 !py-1" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        {user ? (
                            <>
                                <span className="text-sm text-slate-600">{user.username} ({user.role})</span>
                                <button className="btn-ghost" onClick={() => nav('/change-password')} title="Change password">
                                    <KeyIcon className="w-4 h-4" /> Password
                                </button>
                                <button className="btn-ghost" onClick={() => { logout(); nav('/'); }}>
                                    <ArrowLeftOnRectangleIcon className="w-4 h-4" /> Logout
                                </button>
                            </>
                        ) : (
                            <Link to="/login" className="btn-primary">Login</Link>
                        )}
                    </div>
                </div>

                <nav className="max-w-7xl mx-auto px-4 pb-2 flex flex-wrap gap-1">
                    {mainNav.map(i => (
                        <NavLink key={i.to} to={i.to} end={i.to==='/'}
                            className={({ isActive }) =>
                                `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                            {i.label}
                        </NavLink>
                    ))}
                    {isAdmin(user) && (
                        <span className="border-l border-slate-200 mx-1" />
                    )}
                    {isAdmin(user) && adminNav.map(i => (
                        <NavLink key={i.to} to={i.to}
                            className={({ isActive }) =>
                                `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                            {i.label}
                        </NavLink>
                    ))}
                    {isSuperadmin(user) && superadminNav.map(i => (
                        <NavLink key={i.to} to={i.to}
                            className={({ isActive }) =>
                                `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                            {i.label}
                        </NavLink>
                    ))}
                </nav>
            </header>

            <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
                <Outlet />
            </main>

            <footer className="text-xs text-slate-400 text-center py-3">RPA Planning Management</footer>
        </div>
    );
}
