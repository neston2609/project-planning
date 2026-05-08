import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth, isAdmin, isSuperadmin, roleLabel } from '../auth';
import { useYear } from '../YearContext';
import {
    ArrowLeftOnRectangleIcon, KeyIcon, Bars3Icon, XMarkIcon,
    ChartPieIcon, RectangleStackIcon, CubeIcon, WrenchScrewdriverIcon,
    LifebuoyIcon, BriefcaseIcon, UserGroupIcon, BuildingOffice2Icon,
    UsersIcon, IdentificationIcon, CalendarDaysIcon, Cog6ToothIcon,
    EnvelopeIcon, ShieldCheckIcon, DocumentTextIcon, UserCircleIcon
} from '@heroicons/react/24/outline';

const mainNav = [
    { to: '/',                  label: 'Summary',           icon: ChartPieIcon },
    { to: '/subscription',      label: 'Subscription',      icon: RectangleStackIcon },
    { to: '/perpetual-ma',      label: 'Perpetual / SW MA', icon: CubeIcon },
    { to: '/implementation',    label: 'Implementation',    icon: WrenchScrewdriverIcon },
    { to: '/service-ma',        label: 'Service MA',        icon: LifebuoyIcon },
    { to: '/outsource',         label: 'Outsource',         icon: BriefcaseIcon },
    { to: '/resource-planning', label: 'Resource Planning', icon: UserGroupIcon }
];

const adminNav = [
    { to: '/admin/projects',  label: 'Project Management', icon: DocumentTextIcon },
    { to: '/admin/customers', label: 'Customers',          icon: BuildingOffice2Icon },
    { to: '/admin/resources', label: 'Resources',          icon: IdentificationIcon },
    { to: '/admin/year',      label: 'Year Config',        icon: CalendarDaysIcon },
    { to: '/admin/app',       label: 'App Config',         icon: Cog6ToothIcon },
    { to: '/admin/smtp',      label: 'SMTP',               icon: EnvelopeIcon }
];

const superadminNav = [
    { to: '/admin/users',      label: 'Users',      icon: UsersIcon },
    { to: '/admin/login-logs', label: 'Login Logs', icon: ShieldCheckIcon }
];

function NavItem({ to, label, icon: Icon }) {
    return (
        <NavLink to={to} end={to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
            <Icon className="w-5 h-5 shrink-0" />
            <span className="truncate">{label}</span>
        </NavLink>
    );
}

export default function Layout() {
    const { user, logout } = useAuth();
    const { year, setYear } = useYear();
    const nav = useNavigate();
    const [open, setOpen] = useState(false); // mobile

    const years = [];
    const cur = new Date().getFullYear();
    for (let y = cur - 3; y <= cur + 3; y++) years.push(y);

    return (
        <div className="min-h-screen flex">
            {/* ---------- Sidebar ---------- */}
            <aside
                className={`fixed lg:static z-40 inset-y-0 left-0 w-64 transform transition-transform duration-300
                            ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
                            bg-white/70 backdrop-blur-xl border-r border-slate-200/70 flex flex-col`}>
                <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-200/70">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
                         style={{ backgroundImage: 'var(--grad-brand)' }}>
                        <ChartPieIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="text-lg leading-tight brand-mark">RPA Planning</div>
                        <div className="text-[10px] text-slate-400 tracking-wider uppercase">Resource &amp; Revenue</div>
                    </div>
                    <button className="lg:hidden ml-auto text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
                    <div className="nav-section-title">Dashboards</div>
                    {mainNav.map(i => <NavItem key={i.to} {...i} />)}

                    {isAdmin(user) && <>
                        <div className="nav-section-title">Administration</div>
                        {adminNav.map(i => <NavItem key={i.to} {...i} />)}
                    </>}

                    {isSuperadmin(user) && <>
                        <div className="nav-section-title">Superadmin</div>
                        {superadminNav.map(i => <NavItem key={i.to} {...i} />)}
                    </>}
                </nav>

                {/* User box at the bottom */}
                <div className="p-3 border-t border-slate-200/70">
                    {user ? (
                        <div className="rounded-xl p-3 bg-gradient-to-br from-indigo-50 to-pink-50 border border-white">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-bold"
                                     style={{ backgroundImage: 'var(--grad-brand)' }}>
                                    {(user.full_name || user.username).slice(0, 1).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold truncate">{user.full_name || user.username}</div>
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{roleLabel(user.role)}</div>
                                </div>
                            </div>
                            <div className="mt-2 flex gap-1">
                                <button className="btn-ghost flex-1 justify-center !py-1" onClick={() => nav('/change-password')}>
                                    <KeyIcon className="w-4 h-4" />
                                </button>
                                <button className="btn-ghost flex-1 justify-center !py-1" onClick={() => { logout(); nav('/'); }}>
                                    <ArrowLeftOnRectangleIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <Link to="/login" className="btn-primary w-full justify-center">
                            <UserCircleIcon className="w-4 h-4" /> Login
                        </Link>
                    )}
                </div>
            </aside>

            {/* Mobile backdrop */}
            {open && (
                <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />
            )}

            {/* ---------- Main column ---------- */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-slate-200/70">
                    <div className="px-4 lg:px-6 py-3 flex items-center gap-4">
                        <button className="lg:hidden text-slate-600" onClick={() => setOpen(true)}>
                            <Bars3Icon className="w-6 h-6" />
                        </button>
                        <div className="text-sm text-slate-500 hidden sm:block">
                            {user && <>Signed in as <span className="font-semibold text-slate-700">{user.username}</span> · {roleLabel(user.role)}</>}
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <CalendarDaysIcon className="w-5 h-5 text-indigo-500" />
                            <label className="text-sm text-slate-600">Year</label>
                            <select className="input !w-24 !py-1.5 font-semibold !text-indigo-700"
                                    value={year} onChange={(e) => setYear(Number(e.target.value))}>
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                </header>

                <main className="flex-1 px-4 lg:px-6 py-6 fade-in">
                    <Outlet />
                </main>

                <footer className="text-xs text-slate-400 text-center py-3">
                    <span className="brand-mark">RPA Planning Management</span> · v1.0
                </footer>
            </div>
        </div>
    );
}
