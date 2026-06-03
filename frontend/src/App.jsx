import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

import Login            from './pages/Login';
import Register         from './pages/Register';
import VerifyEmail      from './pages/VerifyEmail';
import ChangePassword   from './pages/ChangePassword';
import Summary          from './pages/Summary';
import SubscriptionDash from './pages/SubscriptionDashboard';
import PerpetualDash    from './pages/PerpetualDashboard';
import ImplementationDash from './pages/ImplementationDashboard';
import ServiceMADash    from './pages/ServiceMADashboard';
import OutsourceDash    from './pages/OutsourceDashboard';
import ResourcePlanning from './pages/ResourcePlanning';
import ResourceInformation from './pages/ResourceInformation';
import CustomerInformation from './pages/CustomerInformation';
import LicenseDashboard  from './pages/LicenseDashboard';
import ProjectSummary     from './pages/ProjectSummary';
import OfficeBooking      from './pages/OfficeBooking';

import ProjectManagement from './pages/admin/ProjectManagement';
import Customers        from './pages/admin/Customers';
import Resources        from './pages/admin/Resources';
import YearConfigPage   from './pages/admin/YearConfig';
import AppConfigPage    from './pages/admin/AppConfig';
import SmtpPage         from './pages/admin/Smtp';
import UsersPage        from './pages/admin/Users';
import LoginLogsPage    from './pages/admin/LoginLogs';
import LicenseManagement from './pages/admin/LicenseManagement';
import RoleManagement   from './pages/admin/RoleManagement';
import Tenants          from './pages/admin/Tenants';
import TenantUsers      from './pages/admin/TenantUsers';
import PlatformDashboard from './pages/admin/PlatformDashboard';
import PlatformUsers     from './pages/admin/PlatformUsers';

import {
    useAuth, isAdmin, isSuperadmin, isTenantAdmin, isTenantUser,
    isPlatformRole, isAuthenticated, hasMenuAccess
} from './auth';

function RequireAuth({ children }) {
    const { user } = useAuth();
    if (!isAuthenticated(user)) return <Navigate to="/login" replace />;
    return children;
}
function RequireAdmin({ children }) {
    const { user } = useAuth();
    if (!isAuthenticated(user)) return <Navigate to="/login" replace />;
    if (!isAdmin(user))         return <Navigate to="/" replace />;
    return children;
}
function RequireSuper({ children }) {
    const { user } = useAuth();
    if (!isAuthenticated(user)) return <Navigate to="/login" replace />;
    if (!isSuperadmin(user))    return <Navigate to="/" replace />;
    return children;
}
function RequireMenu({ menuKey, children }) {
    const { user } = useAuth();
    if (!isAuthenticated(user)) return <Navigate to="/login" replace />;
    if (!hasMenuAccess(user, menuKey)) return <Navigate to="/" replace />;
    return children;
}
function RequireTenantAdmin({ children }) {
    const { user } = useAuth();
    if (!isAuthenticated(user)) return <Navigate to="/login" replace />;
    if (!isTenantAdmin(user))   return <Navigate to="/" replace />;
    return children;
}
/** TenantAdmin OR TenantUser (read-only platform). */
function RequirePlatform({ children }) {
    const { user } = useAuth();
    if (!isAuthenticated(user))  return <Navigate to="/login" replace />;
    if (!isPlatformRole(user))   return <Navigate to="/" replace />;
    return children;
}

// Platform roles have no tenant -> tenant dashboards would 403. Send them to
// the appropriate platform landing page:
//   TenantUser  -> dashboard only (cannot manage anything)
//   TenantAdmin -> Tenants management
function HomeRedirect() {
    const { user } = useAuth();
    if (isTenantUser(user))  return <Navigate to="/admin/platform-dashboard" replace />;
    if (isTenantAdmin(user)) return <Navigate to="/admin/tenants" replace />;
    if (!hasMenuAccess(user, 'dashboard.summary')) {
        const fallbacks = [
            ['dashboard.project_summary', '/project-summary'],
            ['dashboard.subscription', '/subscription'],
            ['dashboard.perpetual_ma', '/perpetual-ma'],
            ['dashboard.implementation', '/implementation'],
            ['dashboard.service_ma', '/service-ma'],
            ['dashboard.outsource', '/outsource'],
            ['dashboard.office_booking', '/office-booking'],
            ['resource.planning', '/resource-planning'],
            ['admin.projects', '/admin/projects'],
            ['superadmin.users', '/admin/users']
        ];
        const found = fallbacks.find(([key]) => hasMenuAccess(user, key));
        if (found) return <Navigate to={found[1]} replace />;
    }
    return <Summary />;
}

export default function App() {
    return (
        <Routes>
            <Route path="/login"         element={<Login />} />
            <Route path="/register"      element={<Register />} />
            <Route path="/verify-email"  element={<VerifyEmail />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
                <Route index element={<HomeRedirect />} />
                <Route path="project-summary"   element={<RequireMenu menuKey="dashboard.project_summary"><ProjectSummary /></RequireMenu>} />
                <Route path="subscription"      element={<RequireMenu menuKey="dashboard.subscription"><SubscriptionDash /></RequireMenu>} />
                <Route path="perpetual-ma"      element={<RequireMenu menuKey="dashboard.perpetual_ma"><PerpetualDash /></RequireMenu>} />
                <Route path="implementation"    element={<RequireMenu menuKey="dashboard.implementation"><ImplementationDash /></RequireMenu>} />
                <Route path="service-ma"        element={<RequireMenu menuKey="dashboard.service_ma"><ServiceMADash /></RequireMenu>} />
                <Route path="outsource"         element={<RequireMenu menuKey="dashboard.outsource"><OutsourceDash /></RequireMenu>} />
                <Route path="office-booking"    element={<RequireMenu menuKey="dashboard.office_booking"><OfficeBooking /></RequireMenu>} />
                <Route path="resource-planning"    element={<RequireMenu menuKey="resource.planning"><ResourcePlanning /></RequireMenu>} />
                <Route path="resource-information" element={<RequireMenu menuKey="resource.information"><ResourceInformation /></RequireMenu>} />
                <Route path="customer-information" element={<RequireMenu menuKey="customer.information"><CustomerInformation /></RequireMenu>} />
                <Route path="license-dashboard"    element={<RequireMenu menuKey="license.dashboard"><LicenseDashboard /></RequireMenu>} />
                <Route path="change-password"      element={<ChangePassword />} />

                <Route path="admin/projects"   element={<RequireAdmin><RequireMenu menuKey="admin.projects"><ProjectManagement /></RequireMenu></RequireAdmin>} />
                <Route path="admin/customers"  element={<RequireAdmin><RequireMenu menuKey="admin.customers"><Customers /></RequireMenu></RequireAdmin>} />
                <Route path="admin/resources"  element={<RequireAdmin><RequireMenu menuKey="admin.resources"><Resources /></RequireMenu></RequireAdmin>} />
                <Route path="admin/year"       element={<RequireAdmin><RequireMenu menuKey="admin.year"><YearConfigPage /></RequireMenu></RequireAdmin>} />
                <Route path="admin/app"        element={<RequireAdmin><RequireMenu menuKey="admin.app"><AppConfigPage /></RequireMenu></RequireAdmin>} />
                <Route path="admin/smtp"       element={<RequireAdmin><RequireMenu menuKey="admin.smtp"><SmtpPage /></RequireMenu></RequireAdmin>} />
                <Route path="admin/licenses"   element={<RequireAdmin><RequireMenu menuKey="admin.licenses"><LicenseManagement /></RequireMenu></RequireAdmin>} />
                <Route path="admin/roles"      element={<RequireAdmin><RequireMenu menuKey="admin.roles"><RoleManagement /></RequireMenu></RequireAdmin>} />

                <Route path="admin/users"      element={<RequireSuper><RequireMenu menuKey="superadmin.users"><UsersPage /></RequireMenu></RequireSuper>} />
                <Route path="admin/login-logs" element={<RequireSuper><RequireMenu menuKey="superadmin.login_logs"><LoginLogsPage /></RequireMenu></RequireSuper>} />

                {/* Platform — TenantAdmin only */}
                <Route path="admin/tenants"    element={<RequireTenantAdmin><Tenants /></RequireTenantAdmin>} />
                <Route path="admin/tenants/:tenantId/users"
                       element={<RequireTenantAdmin><TenantUsers /></RequireTenantAdmin>} />
                <Route path="admin/platform-users"
                       element={<RequireTenantAdmin><PlatformUsers /></RequireTenantAdmin>} />

                {/* Platform — TenantAdmin AND TenantUser */}
                <Route path="admin/platform-dashboard"
                       element={<RequirePlatform><PlatformDashboard /></RequirePlatform>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
