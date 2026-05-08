import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';

import Login            from './pages/Login';
import ChangePassword   from './pages/ChangePassword';
import Summary          from './pages/Summary';
import SubscriptionDash from './pages/SubscriptionDashboard';
import PerpetualDash    from './pages/PerpetualDashboard';
import ImplementationDash from './pages/ImplementationDashboard';
import ServiceMADash    from './pages/ServiceMADashboard';
import OutsourceDash    from './pages/OutsourceDashboard';
import ResourcePlanning from './pages/ResourcePlanning';
import ResourceInformation from './pages/ResourceInformation';

import ProjectManagement from './pages/admin/ProjectManagement';
import Customers        from './pages/admin/Customers';
import Resources        from './pages/admin/Resources';
import YearConfigPage   from './pages/admin/YearConfig';
import AppConfigPage    from './pages/admin/AppConfig';
import SmtpPage         from './pages/admin/Smtp';
import UsersPage        from './pages/admin/Users';
import LoginLogsPage    from './pages/admin/LoginLogs';

import { useAuth, isAdmin, isSuperadmin, isAuthenticated } from './auth';

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

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
                <Route index element={<Summary />} />
                <Route path="subscription"      element={<SubscriptionDash />} />
                <Route path="perpetual-ma"      element={<PerpetualDash />} />
                <Route path="implementation"    element={<ImplementationDash />} />
                <Route path="service-ma"        element={<ServiceMADash />} />
                <Route path="outsource"         element={<OutsourceDash />} />
                <Route path="resource-planning"    element={<ResourcePlanning />} />
                <Route path="resource-information" element={<ResourceInformation />} />
                <Route path="change-password"      element={<ChangePassword />} />

                <Route path="admin/projects"   element={<RequireAdmin><ProjectManagement /></RequireAdmin>} />
                <Route path="admin/customers"  element={<RequireAdmin><Customers /></RequireAdmin>} />
                <Route path="admin/resources"  element={<RequireAdmin><Resources /></RequireAdmin>} />
                <Route path="admin/year"       element={<RequireAdmin><YearConfigPage /></RequireAdmin>} />
                <Route path="admin/app"        element={<RequireAdmin><AppConfigPage /></RequireAdmin>} />
                <Route path="admin/smtp"       element={<RequireAdmin><SmtpPage /></RequireAdmin>} />

                <Route path="admin/users"      element={<RequireSuper><UsersPage /></RequireSuper>} />
                <Route path="admin/login-logs" element={<RequireSuper><LoginLogsPage /></RequireSuper>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
