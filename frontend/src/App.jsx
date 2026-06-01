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

import ProjectManagement from './pages/admin/ProjectManagement';
import Customers        from './pages/admin/Customers';
import Resources        from './pages/admin/Resources';
import YearConfigPage   from './pages/admin/YearConfig';
import AppConfigPage    from './pages/admin/AppConfig';
import SmtpPage         from './pages/admin/Smtp';
import UsersPage        from './pages/admin/Users';
import LoginLogsPage    from './pages/admin/LoginLogs';
import LicenseManagement from './pages/admin/LicenseManagement';
import Tenants          from './pages/admin/Tenants';
import TenantUsers      from './pages/admin/TenantUsers';
import PlatformDashboard from './pages/admin/PlatformDashboard';
import PlatformUsers     from './pages/admin/PlatformUsers';

import {
    useAuth, isAdmin, isSuperadmin, isTenantAdmin, isTenantUser,
    isPlatformRole, isAuthenticated
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
                <Route path="project-summary"   element={<ProjectSummary />} />
                <Route path="subscription"      element={<SubscriptionDash />} />
                <Route path="perpetual-ma"      element={<PerpetualDash />} />
                <Route path="implementation"    element={<ImplementationDash />} />
                <Route path="service-ma"        element={<ServiceMADash />} />
                <Route path="outsource"         element={<OutsourceDash />} />
                <Route path="resource-planning"    element={<ResourcePlanning />} />
                <Route path="resource-information" element={<ResourceInformation />} />
                <Route path="customer-information" element={<CustomerInformation />} />
                <Route path="license-dashboard"    element={<LicenseDashboard />} />
                <Route path="change-password"      element={<ChangePassword />} />

                <Route path="admin/projects"   element={<RequireAdmin><ProjectManagement /></RequireAdmin>} />
                <Route path="admin/customers"  element={<RequireAdmin><Customers /></RequireAdmin>} />
                <Route path="admin/resources"  element={<RequireAdmin><Resources /></RequireAdmin>} />
                <Route path="admin/year"       element={<RequireAdmin><YearConfigPage /></RequireAdmin>} />
                <Route path="admin/app"        element={<RequireAdmin><AppConfigPage /></RequireAdmin>} />
                <Route path="admin/smtp"       element={<RequireAdmin><SmtpPage /></RequireAdmin>} />
                <Route path="admin/licenses"   element={<RequireAdmin><LicenseManagement /></RequireAdmin>} />

                <Route path="admin/users"      element={<RequireSuper><UsersPage /></RequireSuper>} />
                <Route path="admin/login-logs" element={<RequireSuper><LoginLogsPage /></RequireSuper>} />

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
