import { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
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
    EnvelopeIcon, DocumentTextIcon, UserCircleIcon, UserIcon, ClipboardDocumentListIcon,
    MoonIcon, SunIcon, BookOpenIcon, ChatBubbleLeftRightIcon, ClockIcon, SparklesIcon
} from '@heroicons/react/24/outline';
import Modal from './Modal';

const mainNav = [
    { key: 'dashboard.summary',        to: '/',                  label: 'Summary',           icon: ChartPieIcon },
    { key: 'dashboard.project_summary',to: '/project-summary',   label: 'Project Summary',   icon: ClipboardDocumentListIcon },
    { key: 'dashboard.pipeline',       to: '/pipeline-dashboard', label: 'Pipeline Dashboard', icon: ChartPieIcon },
    { key: 'dashboard.subscription',   to: '/subscription',      label: 'Subscription',      icon: RectangleStackIcon },
    { key: 'dashboard.perpetual_ma',   to: '/perpetual-ma',      label: 'Perpetual / SW MA', icon: CubeIcon },
    { key: 'dashboard.implementation', to: '/implementation',    label: 'Implementation',    icon: WrenchScrewdriverIcon },
    { key: 'dashboard.service_ma',     to: '/service-ma',        label: 'Service MA',        icon: LifebuoyIcon },
    { key: 'dashboard.outsource',      to: '/outsource',            label: 'Outsource',            icon: BriefcaseIcon },
    { key: 'dashboard.office_booking', to: '/office-booking',       label: 'Office Booking',       icon: CalendarDaysIcon },
    { key: 'dashboard.post_it_board',  to: '/post-it-board',        label: 'Post-It Board',        icon: ChatBubbleLeftRightIcon },
    { key: 'knowledge.base',           to: '/knowledge-base',       label: 'Knowledge Base',       icon: BookOpenIcon },
    { key: 'resource.planning',        to: '/resource-planning',    label: 'Resource Planning',    icon: UserGroupIcon },
    { key: 'resource.information',     to: '/resource-information', label: 'Resource Information', icon: UserIcon },
    { key: 'customer.information',     to: '/customer-information', label: 'Customer Information', icon: BuildingOfficeIcon },
    { key: 'license.dashboard',        to: '/license-dashboard',    label: 'License Dashboard',    icon: KeyIcon }
];

const adminNav = [
    { key: 'admin.projects',  to: '/admin/projects',  label: 'Project Management', icon: DocumentTextIcon },
    { key: 'admin.pipeline',  to: '/admin/pipeline',  label: 'Pipeline Management', icon: ClipboardDocumentListIcon },
    { key: 'admin.pipeline_ai_prompt', to: '/admin/pipeline-ai-prompt', label: 'Pipeline AI Prompt', icon: SparklesIcon },
    { key: 'admin.customers', to: '/admin/customers', label: 'Customers',          icon: BuildingOffice2Icon },
    { key: 'admin.resources', to: '/admin/resources', label: 'Resources',          icon: IdentificationIcon },
    { key: 'admin.licenses',  to: '/admin/licenses',  label: 'License Management', icon: KeyIcon },
    { key: 'admin.year',      to: '/admin/year',      label: 'Year Config',        icon: CalendarDaysIcon },
    { key: 'admin.app',       to: '/admin/app',       label: 'App Config',         icon: Cog6ToothIcon },
    { key: 'admin.smtp',      to: '/admin/smtp',      label: 'SMTP',               icon: EnvelopeIcon },
    { key: 'admin.kb_config', to: '/admin/kb-config', label: 'KB Configure',       icon: BookOpenIcon }
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

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || div.innerText || '';
}

function hashString(value) {
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return String(hash);
}

function hasAnnouncementContent(html) {
    return Boolean(stripHtml(html).trim() || /<img[\s>]/i.test(String(html || '')));
}

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
    const { user, logout, setThemeMode } = useAuth();
    const { year, setYear } = useYear();
    const nav = useNavigate();
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const [footerText, setFooterText] = useState(DEFAULT_FOOTER_TEXT);
    const [announcementContent, setAnnouncementContent] = useState('');
    const [announcementOpen, setAnnouncementOpen] = useState(false);
    const [expiringPostIts, setExpiringPostIts] = useState([]);
    const [postItAlertOpen, setPostItAlertOpen] = useState(false);

    const tenantAdmin = isTenantAdmin(user);
    const tenantUser  = isTenantUser(user);
    const platform    = isPlatformRole(user);
    const title = appTitle(user);
    const visibleMainNav = mainNav.filter(i => hasMenuAccess(user, i.key));
    const visibleAdminNav = adminNav.filter(i => hasMenuAccess(user, i.key));
    const visibleSuperadminNav = superadminNav.filter(i => hasMenuAccess(user, i.key));
    const darkMode = user?.theme_mode === 'dark';

    useEffect(() => { document.title = title; }, [title]);

    useEffect(() => {
        if (platform) {
            setFooterText(DEFAULT_FOOTER_TEXT);
            setAnnouncementContent('');
            setAnnouncementOpen(false);
            return;
        }
        api.get('/admin/app-config')
            .then(r => {
                const config = r.data || {};
                setFooterText(config.footer_text || DEFAULT_FOOTER_TEXT);
                const enabled = String(config.announcement_enabled || 'false') === 'true';
                const content = config.announcement_content || '';
                setAnnouncementContent(content);
                if (enabled && hasAnnouncementContent(content)) {
                    const loginNonce = sessionStorage.getItem(`login_nonce_${user.id}`) || 'session';
                    const sessionKey = `announcement_seen_${user.id}_${user.tenant_id}_${loginNonce}_${hashString(content)}`;
                    if (sessionStorage.getItem(sessionKey) !== '1') {
                        setAnnouncementOpen(true);
                        sessionStorage.setItem(sessionKey, '1');
                    }
                }
            })
            .catch(() => setFooterText(DEFAULT_FOOTER_TEXT));
    }, [platform, user?.id, user?.tenant_id]);

    useEffect(() => {
        if (platform || !user?.tenant_id || !hasMenuAccess(user, 'dashboard.post_it_board')) return;
        const sessionKey = `post_it_expiry_alert_${user.id}_${new Date().toISOString().slice(0, 10)}`;
        if (sessionStorage.getItem(sessionKey) === '1') return;
        api.get('/post-its/mine/expiring')
            .then(r => {
                const rows = r.data || [];
                if (rows.length > 0) {
                    setExpiringPostIts(rows);
                    setPostItAlertOpen(true);
                    sessionStorage.setItem(sessionKey, '1');
                }
            })
            .catch(() => {});
    }, [platform, user?.id, user?.tenant_id]);

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

    async function toggleTheme() {
        try {
            await setThemeMode(darkMode ? 'light' : 'dark');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not save theme');
        }
    }

    async function extendPostIt(note) {
        try {
            await api.post(`/post-its/${note.id}/extend`);
            setExpiringPostIts(prev => prev.filter(item => item.id !== note.id));
            toast.success('Post-It extended');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not extend Post-It');
        }
    }

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
                        <div className="ml-auto flex items-center gap-2">
                            <button type="button"
                                    className={`theme-toggle ${darkMode ? 'theme-toggle-dark' : ''}`}
                                    onClick={toggleTheme}
                                    title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                                    aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                                <span className="theme-toggle-thumb">
                                    {darkMode
                                        ? <MoonIcon className="w-4 h-4" />
                                        : <SunIcon className="w-4 h-4" />}
                                </span>
                            </button>
                            <span className="hidden sm:inline text-sm font-semibold text-slate-600">
                                {darkMode ? 'Dark' : 'Light'}
                            </span>
                            {!platform && (
                                <>
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
                                </>
                            )}
                        </div>
                    </div>
                </header>

                <main className="flex-1 px-4 lg:px-6 py-6 fade-in">
                    <Outlet />
                </main>

                <footer className="text-xs text-slate-400 text-center py-3">
                    {footerText}
                </footer>
            </div>
            <Modal open={postItAlertOpen}
                   onClose={() => setPostItAlertOpen(false)}
                   title="Post-It Expiring Soon"
                   size="lg"
                   footer={<>
                       <button className="btn-ghost" onClick={() => setPostItAlertOpen(false)}>Close</button>
                       <button className="btn-primary" onClick={() => { setPostItAlertOpen(false); nav('/post-it-board'); }}>
                           Open Board
                       </button>
                   </>}>
                <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                        Some of your Post-It notes will expire within 7 days. You can extend them now.
                    </p>
                    {expiringPostIts.map(note => (
                        <div key={note.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <div className="flex items-start gap-3">
                                <ClockIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-slate-800 line-clamp-2">{stripHtml(note.content)}</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        Expires on {new Date(note.expires_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <button className="btn-ghost !py-1.5" onClick={() => extendPostIt(note)}>
                                    Extend
                                </button>
                            </div>
                        </div>
                    ))}
                    {expiringPostIts.length === 0 && (
                        <div className="text-sm text-slate-500">All expiring Post-It notes have been extended.</div>
                    )}
                </div>
            </Modal>
            <Modal open={announcementOpen}
                   onClose={() => setAnnouncementOpen(false)}
                   title="Announcement"
                   size="xl"
                   footer={<button className="btn-primary" onClick={() => setAnnouncementOpen(false)}>OK</button>}>
                <div className="kb-article-content max-w-none rounded-lg border border-slate-200 bg-white p-4 text-sm"
                     dangerouslySetInnerHTML={{ __html: announcementContent }} />
            </Modal>
        </div>
    );
}
