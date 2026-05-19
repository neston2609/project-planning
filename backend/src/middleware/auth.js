const jwt = require('jsonwebtoken');

function getSecret() {
    return process.env.JWT_SECRET || 'dev-secret-change-me';
}

/**
 * Soft auth — populates req.user when a valid token is present, but does NOT
 * reject anonymous requests. Used on read-only endpoints that want to know
 * who is logged in.
 *
 * The JWT payload carries: { uid, username, role, tenant_id }.
 * tenant_id is null for the global 'tenantadmin' / 'tenantuser' roles.
 */
function softAuth(req, _res, next) {
    const header = req.headers.authorization || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) return next();
    try {
        req.user = jwt.verify(m[1], getSecret());
    } catch { /* ignore expired/invalid token on soft auth */ }
    next();
}

/** Hard auth — requires a valid token. */
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'Authentication required' });
    try {
        req.user = jwt.verify(m[1], getSecret());
        return next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/** Role check — usage:  router.post('/', requireAuth, requireRole('superadmin'), handler) */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}

/** Only the global platform 'tenantadmin' role. */
function requireTenantAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'tenantadmin') {
        return res.status(403).json({ error: 'Forbidden — TenantAdmin only' });
    }
    next();
}

/** Any platform-level role: 'tenantadmin' (full) or 'tenantuser' (read-only platform dashboard). */
function requirePlatformRole(req, res, next) {
    const role = req.user && req.user.role;
    if (role !== 'tenantadmin' && role !== 'tenantuser') {
        return res.status(403).json({ error: 'Forbidden — platform-level role required' });
    }
    next();
}

/**
 * Ensures the request is bound to a tenant. Used on every tenant-scoped
 * business route so a token without a tenant (the global tenantadmin/tenantuser,
 * or a malformed token) can never read or write tenant data.
 */
function requireTenant(req, res, next) {
    const tid = tenantOf(req);
    if (!tid) {
        return res.status(403).json({
            error: 'This action requires a team (tenant) context.'
        });
    }
    req.tenantId = tid;
    next();
}

/** Effective tenant id for the current request, or null. */
function tenantOf(req) {
    const t = req.user && req.user.tenant_id;
    return Number.isInteger(t) && t > 0 ? t : null;
}

function signToken(payload) {
    return jwt.sign(payload, getSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
}

module.exports = {
    softAuth, requireAuth, requireRole, requireTenantAdmin, requirePlatformRole,
    requireTenant, tenantOf, signToken
};
