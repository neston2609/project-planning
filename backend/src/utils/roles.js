const db = require('../db');
const { defaultMenuKeysForRole } = require('./menuRegistry');

const DEFAULT_ROLE_NAMES = {
    user: 'User',
    admin: 'Admin',
    superadmin: 'Superadmin'
};

async function ensureDefaultRoles(tenantId, client = db) {
    const out = {};
    for (const baseRole of ['user', 'admin', 'superadmin']) {
        const name = DEFAULT_ROLE_NAMES[baseRole];
        const { rows } = await client.query(
            `INSERT INTO tenant_roles(tenant_id, name, base_role, is_system)
             VALUES ($1,$2,$3,TRUE)
             ON CONFLICT (tenant_id, name) DO UPDATE
                SET base_role=EXCLUDED.base_role, is_system=TRUE, updated_at=NOW()
             RETURNING *`,
            [tenantId, name, baseRole]
        );
        const role = rows[0];
        out[baseRole] = role;
        for (const key of defaultMenuKeysForRole(baseRole)) {
            await client.query(
                `INSERT INTO tenant_role_permissions(tenant_role_id, menu_key)
                 VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                [role.id, key]
            );
        }
    }
    await client.query(
        `UPDATE users u
            SET tenant_role_id = r.id
           FROM tenant_roles r
          WHERE u.tenant_id=$1
            AND r.tenant_id=$1
            AND r.base_role=u.role
            AND r.is_system=TRUE
            AND u.tenant_role_id IS NULL`,
        [tenantId]
    );
    return out;
}

async function permissionsForUser(userId, tenantId, baseRole) {
    if (!tenantId) return [];
    await ensureDefaultRoles(tenantId);
    const { rows } = await db.query(
        `SELECT tr.id AS tenant_role_id, tr.name AS tenant_role_name, tr.base_role,
                COALESCE(array_agg(trp.menu_key ORDER BY trp.menu_key)
                    FILTER (WHERE trp.menu_key IS NOT NULL), ARRAY[]::text[]) AS menu_permissions
           FROM users u
           LEFT JOIN tenant_roles tr ON tr.id = u.tenant_role_id AND tr.tenant_id = u.tenant_id
           LEFT JOIN tenant_role_permissions trp ON trp.tenant_role_id = tr.id
          WHERE u.id=$1 AND u.tenant_id=$2
          GROUP BY tr.id, tr.name, tr.base_role`,
        [userId, tenantId]
    );
    const r = rows[0] || {};
    return {
        tenant_role_id: r.tenant_role_id || null,
        tenant_role_name: r.tenant_role_name || DEFAULT_ROLE_NAMES[baseRole] || baseRole,
        menu_permissions: r.menu_permissions || defaultMenuKeysForRole(baseRole)
    };
}

module.exports = { ensureDefaultRoles, permissionsForUser, DEFAULT_ROLE_NAMES };
