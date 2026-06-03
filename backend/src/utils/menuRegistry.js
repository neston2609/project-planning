const MENU_REGISTRY = [
    { key: 'dashboard.summary', label: 'Summary', group: 'Dashboards', min_role: 'user' },
    { key: 'dashboard.project_summary', label: 'Project Summary', group: 'Dashboards', min_role: 'user' },
    { key: 'dashboard.subscription', label: 'Subscription', group: 'Dashboards', min_role: 'user' },
    { key: 'dashboard.perpetual_ma', label: 'Perpetual / SW MA', group: 'Dashboards', min_role: 'user' },
    { key: 'dashboard.implementation', label: 'Implementation', group: 'Dashboards', min_role: 'user' },
    { key: 'dashboard.service_ma', label: 'Service MA', group: 'Dashboards', min_role: 'user' },
    { key: 'dashboard.outsource', label: 'Outsource', group: 'Dashboards', min_role: 'user' },
    { key: 'dashboard.office_booking', label: 'Office Booking', group: 'Dashboards', min_role: 'user' },
    { key: 'knowledge.base', label: 'Knowledge Base', group: 'Dashboards', min_role: 'user' },
    { key: 'resource.planning', label: 'Resource Planning', group: 'Dashboards', min_role: 'user' },
    { key: 'resource.information', label: 'Resource Information', group: 'Dashboards', min_role: 'user' },
    { key: 'customer.information', label: 'Customer Information', group: 'Dashboards', min_role: 'user' },
    { key: 'license.dashboard', label: 'License Dashboard', group: 'Dashboards', min_role: 'user' },

    { key: 'admin.projects', label: 'Project Management', group: 'Administration', min_role: 'admin' },
    { key: 'admin.customers', label: 'Customers', group: 'Administration', min_role: 'admin' },
    { key: 'admin.resources', label: 'Resources', group: 'Administration', min_role: 'admin' },
    { key: 'admin.licenses', label: 'License Management', group: 'Administration', min_role: 'admin' },
    { key: 'admin.year', label: 'Year Config', group: 'Administration', min_role: 'admin' },
    { key: 'admin.app', label: 'App Config', group: 'Administration', min_role: 'admin' },
    { key: 'admin.smtp', label: 'SMTP', group: 'Administration', min_role: 'admin' },
    { key: 'admin.kb_config', label: 'KB Configure', group: 'Administration', min_role: 'admin' },

    { key: 'admin.roles', label: 'Role Management', group: 'Superadmin', min_role: 'superadmin' },
    { key: 'superadmin.booking_config', label: 'Booking Config', group: 'Superadmin', min_role: 'superadmin' },
    { key: 'superadmin.users', label: 'Users', group: 'Superadmin', min_role: 'superadmin' },
    { key: 'superadmin.login_logs', label: 'Login Logs', group: 'Superadmin', min_role: 'superadmin' }
];

const ROLE_RANK = { user: 1, admin: 2, superadmin: 3 };

function defaultMenuKeysForRole(role) {
    const rank = ROLE_RANK[role] || ROLE_RANK.user;
    return MENU_REGISTRY
        .filter(item => rank >= (ROLE_RANK[item.min_role] || ROLE_RANK.user))
        .map(item => item.key);
}

module.exports = { MENU_REGISTRY, defaultMenuKeysForRole };
