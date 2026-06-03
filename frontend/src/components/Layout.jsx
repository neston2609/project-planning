import { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
    useAuth, isAdmin, isSuperadmin, isTenantAdmin, isTenantUser,
    isPlatformRole, roleLabel, appTitle, hasMenuAccess
} from '../auth';
import { useYear } from '../YearContext';
import api from '../api';
import {
    ArrowLeftOnRectangleIcon, KeyIcon, Bars3Icon, XMarkIcon,
    ChartPieIcon, RectangleStackIcon, CubeIcon, WrenchScrewdriverIcon,
    LifebuoyIcon, BriefcaseIcon, UserGroupIcon, BuildingOffice2Icon,
    BuildingOfficeIcon, PresentationChartLineIcon, ShieldCheckIcon,
    UsersIcon, IdentificationIcon, CalendarDaysIcon, Cog6ToothIcon,
    EnvelopeIcon, DocumentTextIcon, UserCircleIcon, UserIcon, ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';

const mainNav = [
    { key: 'dashboard.summary',        to: '/',                  label: 'Summary',           icon: ChartPieIcon },
    { key: 'dashboard.project_summary',to: '/project-summary',   label: 'Project Summary',   icon: ClipboardDocumentListIcon },
    { key: 'dashboard.subscription',   to: '/subscription',      label: 'Subscription',      icon: RectangleStackIcon },
    { key: 'dashboard.perpetual_ma',   to: '/perpetual-ma',      label: 'Perpetual / SW MA', icon: CubeIcon },
    { key: 'dashboard.implementation', to: '/implementation',    label: 'Implementation',    icon: WrenchScrewdriverIcon },
    { key: 'dashboard.service_ma',     to: '/service-ma',        label: 'Service MA',        icon: LifebuoyIcon },
    { key: 'dashboard.outsource',      to: '/outsource',            label: 'Outsource',            icon: BriefcaseIcon },
    { key: 'dashboard.office_booking', to: '/office-booking',       label: 'Office Booking',       icon: CalendarDaysIcon },
    { key: 'resource.planning',        to: '/resource-planning',    label: 'Resource Planning',    icon: UserGroupIcon },
    { key: 'resource.information',     to: '/resource-information', label: 'Resource Information', icon: UserIcon },
    { key: 'customer.information',     to: '/customer-information', label: 'Customer Information', icon: BuildingOfficeIcon },
    { key: 'license.dashboard',        to: '/license-dashboard',    label: 'License Dashboard',    icon: KeyIcon }
];

const adminNav = [
    { key: 'admin.projects',  to: '/admin/projects',  label: 'Project Management', icon: DocumentTextIcon },
    { key: 'admin.customers', to: '/admin/customers', label: 'Customers',          icon: BuildingOffice2Icon },
    { key: 'admin.resources', to: '/admin/resources', label: 'Resources',          icon: IdentificationIcon },
    { key: 'admin.licenses',  to: '/admin/licenses',  label: 'License Management', icon: KeyIcon },
    { key: 'admin.year',      to: '/admin/year',      label: 'Year Config',        icon: CalendarDaysIcon },
    { key: 'admin.app',       to: '/admin/app',       label: 'App Config',         icon: Cog6ToothIcon },
    { key: 'admin.smtp',      to: '/admin/smtp',      label: 'SMTP',               icon: EnvelopeIcon }
];

const superadminNav = [
    { key: 'admin.roles',           to: '/admin/roles',      label: 'Role Management', icon: ShieldCheckIcon },
    { key: 'superadmin.booking_config', to: '/admin/booking-config', label: 'Booking Config', icon: Cog6ToothIcon },
    { key: 'superadmin.users',      to: '/admin/users',      label: 'Users',      icon: UsersIcon },
    { key: 'superadmin.login_logs', to: '/admin/login-logs', label: 'Login Logs', icon: ShieldCheckIcon }
];

// TenantAdmin sees platform management; TenantUser sees read-only platform pages.
const tenantAdminNav = [
    { to: '/admin/platform-dashboard', label: 'BSM Dashboard',      icon: PresentationChartLineIcon },
    { to: '/project-summary',          label: 'Project Summary',    icon: ClipboardDocumentListIcon },
    { to: '/admin/tenants',            label: 'Tenants',            icon: BuildingOffice2Icon },
    { to: '/admin/platform-users',     label: 'Platform Users',     icon: ShieldCheckIcon }
];
const tenantUserNav = [
    { to: '/admin/platform-dashboard', label: 'BSM Dashboard',      icon: PresentationChartLineIcon },
    { to: '/project-summary',          label: 'Project Summary',    icon: ClipboardDocumentListIcon }
];

const DEFAULT_FOOTER_TEXT = 'Implemented and Maintain by BSM RPA Team. For Internal use only';

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
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const [footerText, setFooterText] = useState(DEFAULT_FOOTER_TEXT);

    const tenantAdmin = isTenantAdmin(user);
    const tenantUser  = isTenantUser(user);
    const platform    = isPlatformRole(user);
    const title = appTitle(user);
    const visibleMainNav = mainNav.filter(i => hasMenuAccess(user, i.key));
    const visibleAdminNav = adminNav.filter(i => hasMenuAccess(user, i.key));
    const visibleSuperadminNav = superadminNav.filter(i => hasMenuAccess(user, i.key));

    useEffect(() => { document.title = title; }, [title]);

    useEffect(() => {
        if (platform) {
            setFooterText(DEFAULT_FOOTER_TEXT);
            return;
        }
        api.get('/admin/app-config')
            .then(r => setFooterText(r.data?.footer_text || DEFAULT_FOOTER_TEXT))
            .catch(() => setFooterText(DEFAULT_FOOTER_TEXT));
    }, [platform, user?.tenant_id]);

    // Platform roles can only use platform pages.
    // TenantUser is further restricted to the platform dashboard only.
    useEffect(() => {
        if (!platform) return;
        const p = location.pathname;
        if (p === '/change-password') return;

        if (tenantUser) {
            if (p !== '/admin/platform-dashboard' && p !== '/project-summary') {
                nav('/admin/platform-dashboard', { replace: true });
            }
        } else {
            // tenantadmin
            const allowedPrefixes = ['/admin/tenants', '/admin/platform-dashboard', '/admin/platform-users', '/project-summary'];
            if (!allowedPrefixes.some(pref => p === pref || p.startsWith(pref + '/'))) {
                nav('/admin/tenants', { replace: true });
            }
        }
    }, [platform, tenantUser, location.pathname, nav]);

    const years = [];
    const cur = new Date().getFullYear();
    for (let y = cur - 3; y <= cur + 3; y++) years.push(y);

    return (
        <div className="min-h-screen flex">
            <aside
                className={`fixed lg:static z-40 inset-y-0 left-0 w-64 transform transition-transform duration-300
                            ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
                            bg-white/70 backdrop-blur-xl border-r border-slate-200/70 flex flex-col`}>
                <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-200/70">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
                         style={{ backgroundImage: 'var(--grad-brand)' }}>
                        <ChartPieIcon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-lg leading-tight brand-mark truncate" title={title}>{title}</div>
                        <div className="text-[10px] text-slate-400 tracking-wider uppercase">
                            {tenantAdmin ? 'Platform Administration'
                              : tenantUser ? 'Platform (Read-only)'
                              : 'Resource & Revenue'}
                        </div>
                    </div>
                    <button className="lg:hidden ml-auto text-slate-400 hover:text-slate-600" onClick={() => setOpen(false)}>
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
                    {tenantAdmin && (
                        <>
                            <div className="nav-section-title">Platform</div>
                            {tenantAdminNav.map(i => <NavItem key={i.to} {...i} />)}
                        </>
                    )}
                    {tenantUser && (
                        <>
                            <div className="nav-section-title">Platform</div>
                            {tenantUserNav.map(i => <NavItem key={i.to} {...i} />)}
                        </>
                    )}
                    {!platform && (
                        <>
                            <div className="nav-section-title">Dashboards</div>
                            {visibleMainNav.map(i => <NavItem key={i.to} {...i} />)}

                            {isAdmin(user) && visibleAdminNav.length > 0 && <>
                                <div className="nav-section-title">Administration</div>
                                {visibleAdminNav.map(i => <NavItem key={i.to} {...i} />)}
                            </>}

                            {isSuperadmin(user) && visibleSuperadminNav.length > 0 && <>
                                <div className="nav-section-title">Superadmin</div>
                                {visibleSuperadminNav.map(i => <NavItem key={i.to} {...i} />)}
                            </>}
                        </>
                    )}
                </nav>

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

            {open && (
                <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />
            )}

            <div className="flex-1 flex flex-col min-w-0">
                <header className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-slate-200/70">
                    <div className="px-4 lg:px-6 py-3 flex items-center gap-4">
                        <button className="lg:hidden text-slate-600" onClick={() => setOpen(true)}>
                            <Bars3Icon className="w-6 h-6" />
                        </button>
                        <div className="text-sm text-slate-500 hidden sm:block">
                            {user && <>Signed in as <span className="font-semibold text-slate-700">{user.username}</span> · {roleLabel(user.role)}
                                {user.tenant_name && <> · <span className="font-semibold text-indigo-600">{user.tenant_name}</span></>}
                            </>}
                        </div>
                        {!platform && (
                            <div className="ml-auto flex items-center gap-2">
                                <CalendarDaysIcon className="w-5 h-5 text-indigo-500" />
                                <label className="text-sm text-slate-600">Year</label>
                                <select className="input !w-24 !py-1.5 font-semibold !text-indigo-700"
                                        value={year} onChange={(e) => setYear(Number(e.target.value))}>
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <button className="btn-ghost !py-1.5"
                                        disabled={year === cur}
                                        onClick={() => setYear(cur)}>
                                    This Year
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                <main className="flex-1 px-4 lg:px-6 py-6 fade-in">
                    <Outlet />
                </main>

                <footer className="text-xs text-slate-400 text-center py-3">
                    {footerText}
                </footer>
            </div>
        </div>
    );
}
