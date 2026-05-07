const jwt = require('jsonwebtoken');

function getSecret() {
    return process.env.JWT_SECRET || 'dev-secret-change-me';
}

/**
 * Soft auth — populates req.user when a valid token is present, but does NOT
 * reject anonymous requests. Used on read-only endpoints that are publicly
 * viewable but want to know who is logged in.
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

function signToken(payload) {
    return jwt.sign(payload, getSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
}

module.exports = { softAuth, requireAuth, requireRole, signToken };
