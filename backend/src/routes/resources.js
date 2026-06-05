const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult, param } = require('express-validator');
const db = require('../db');
const { requireAuth, requireRole, requireTenant } = require('../middleware/auth');
const { ensureDefaultRoles } = require('../utils/roles');

const router = express.Router();

// All resource routes are tenant-scoped.
router.use(requireAuth, requireTenant);

const AI_CONFIG_KEYS = ['ai_provider', 'ai_api_key', 'ai_endpoint', 'ai_model'];
const WEB_SEARCH_CONFIG_KEYS = ['web_search_provider', 'web_search_api_key', 'web_search_endpoint', 'web_search_cx'];
const AI_PROVIDERS = ['openai', 'anthropic', 'google', 'azure_openai', 'custom'];
const AI_SUGGEST_FIELDS = [
    'first_name', 'last_name', 'nick_name', 'role', 'email', 'mobile_phone',
    'instagram', 'line_id', 'facebook', 'erp_username', 'skill'
];

const RESOURCE_SELECT = `
    SELECT r.*,
           u.username AS mapped_username,
           u.full_name AS mapped_user_full_name,
           u.email AS mapped_user_email,
           u.role AS mapped_user_role,
           u.tenant_role_id AS mapped_tenant_role_id,
           tr.name AS mapped_tenant_role_name
      FROM resources r
      LEFT JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
      LEFT JOIN tenant_roles tr ON tr.id = u.tenant_role_id AND tr.tenant_id = u.tenant_id
`;

async function getResourceWithUser(resourceId, tenantId, client = db) {
    const { rows } = await client.query(
        `${RESOURCE_SELECT} WHERE r.id=$1 AND r.tenant_id=$2`,
        [resourceId, tenantId]
    );
    return rows[0] || null;
}

async function defaultUserRole(tenantId, client = db) {
    const defaults = await ensureDefaultRoles(tenantId, client);
    return defaults.user;
}

async function tenantRoleForActor(tenantId, tenantRoleId, actorRole, client = db) {
    if (!tenantRoleId) return defaultUserRole(tenantId, client);
    await ensureDefaultRoles(tenantId, client);
    const { rows } = await client.query(
        `SELECT * FROM tenant_roles
          WHERE id=$1 AND tenant_id=$2`,
        [tenantRoleId, tenantId]
    );
    const role = rows[0];
    if (!role) return null;
    if (actorRole !== 'superadmin' && role.base_role === 'superadmin') return null;
    return role;
}

function canManageResources(user) {
    return user && (user.role === 'admin' || user.role === 'superadmin');
}

function cleanAiProvider(value) {
    const provider = String(value || '').trim().toLowerCase();
    return AI_PROVIDERS.includes(provider) ? provider : 'openai';
}

function normalizeEndpoint(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function cleanSuggestionValue(value, max = 1000) {
    return String(value || '').trim().slice(0, max);
}

async function getAiConfig(tenantId) {
    const { rows } = await db.query(
        'SELECT key, value FROM tenant_config WHERE tenant_id=$1 AND key = ANY($2)',
        [tenantId, AI_CONFIG_KEYS]
    );
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

async function getWebSearchConfig(tenantId) {
    const { rows } = await db.query(
        'SELECT key, value FROM tenant_config WHERE tenant_id=$1 AND key = ANY($2)',
        [tenantId, WEB_SEARCH_CONFIG_KEYS]
    );
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeout_ms || 10000));
    const { timeout_ms, ...fetchOptions } = options;
    let response;
    try {
        response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!response.ok) {
        const err = new Error(data?.error?.message || data?.error || data?.message || response.statusText || 'AI request failed');
        err.status = response.status;
        throw err;
    }
    return data;
}

function parseJsonObjectText(value) {
    const text = String(value || '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function cleanSearchResult(item = {}) {
    const url = cleanSuggestionValue(item.url || item.link || item.href, 1000);
    if (!url || !/^https?:\/\//i.test(url)) return null;
    return {
        title: cleanSuggestionValue(item.title || item.name || url, 255),
        url,
        snippet: cleanSuggestionValue(item.snippet || item.description || item.text || '', 1000)
    };
}

function searchQueryForResource(resource = {}) {
    const name = [resource.first_name, resource.last_name].map(v => cleanSuggestionValue(v, 120)).filter(Boolean).join(' ').trim();
    const extras = [resource.email, resource.erp_username].map(v => cleanSuggestionValue(v, 120)).filter(Boolean);
    return [name, ...extras].filter(Boolean).join(' ');
}

async function runResourceSourceSearch(tenantId, resource) {
    const cfg = await getWebSearchConfig(tenantId);
    const provider = String(cfg.web_search_provider || 'disabled').trim().toLowerCase();
    const apiKey = cfg.web_search_api_key || '';
    const endpoint = normalizeEndpoint(cfg.web_search_endpoint);
    const cx = String(cfg.web_search_cx || '').trim();
    const q = searchQueryForResource(resource);
    if (!q) return { enabled: false, reason: 'Name, email, or ERP Username is required before searching sources', results: [] };
    if (provider === 'disabled') return { enabled: false, reason: 'Web Search is not configured', results: [] };

    let results = [];
    if (provider === 'google_cse') {
        if (!apiKey || !cx) return { enabled: false, reason: 'Google Custom Search is missing API key or Search Engine ID', results: [] };
        const data = await fetchJson(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(q)}&num=5`, { timeout_ms: 12000 });
        results = (data.items || []).map(cleanSearchResult).filter(Boolean);
    } else if (provider === 'bing') {
        if (!apiKey) return { enabled: false, reason: 'Bing Web Search API key is missing', results: [] };
        const data = await fetchJson(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}&count=5`, {
            headers: { 'Ocp-Apim-Subscription-Key': apiKey },
            timeout_ms: 12000
        });
        results = (data.webPages?.value || []).map(cleanSearchResult).filter(Boolean);
    } else if (provider === 'serpapi') {
        if (!apiKey) return { enabled: false, reason: 'SerpAPI key is missing', results: [] };
        const data = await fetchJson(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(apiKey)}&num=5`, { timeout_ms: 12000 });
        results = (data.organic_results || []).map(cleanSearchResult).filter(Boolean);
    } else if (provider === 'custom') {
        if (!endpoint) return { enabled: false, reason: 'Custom search endpoint is missing', results: [] };
        const data = await fetchJson(`${endpoint}?q=${encodeURIComponent(q)}`, {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            timeout_ms: 12000
        });
        const raw = Array.isArray(data) ? data : (data.results || data.items || []);
        results = raw.map(cleanSearchResult).filter(Boolean);
    } else {
        return { enabled: false, reason: 'Unsupported web search provider', results: [] };
    }
    return { enabled: true, query: q, results: results.slice(0, 8) };
}

async function runResourceSuggestionAi(tenantId, resource, sources = []) {
    const cfg = await getAiConfig(tenantId);
    const provider = cleanAiProvider(cfg.ai_provider || 'openai');
    const apiKey = cfg.ai_api_key || '';
    const endpoint = normalizeEndpoint(cfg.ai_endpoint);
    const model = String(cfg.ai_model || '').trim();
    if (!apiKey || !model) {
        return { enabled: false, reason: 'AI configuration is incomplete', suggestions: [] };
    }

    const current = {};
    for (const field of AI_SUGGEST_FIELDS) current[field] = cleanSuggestionValue(resource?.[field] || '');
    const blankFields = AI_SUGGEST_FIELDS.filter(field => !current[field]);
    if (blankFields.length === 0) return { enabled: false, reason: 'No blank fields to suggest', suggestions: [] };

    const cleanSources = (Array.isArray(sources) ? sources : [])
        .map(cleanSearchResult)
        .filter(Boolean)
        .slice(0, 8);
    const sourceText = cleanSources.length
        ? `Selected source results JSON: ${JSON.stringify(cleanSources)}`
        : 'No selected source results were provided.';

    const prompt = `You help an internal admin complete a Resource Management form.
Use only highly confident information. If uncertain, leave the field out.
Use the selected source results if provided. Do not invent private contact details.
Return only valid JSON with this shape:
{"suggestions":[{"field":"role","value":"RPA Developer","confidence":0.82,"source":"inferred from current skill"}]}
Allowed fields: ${blankFields.join(', ')}
Current resource JSON: ${JSON.stringify(current)}
${sourceText}`;

    let content = '';
    if (provider === 'openai') {
        const data = await fetchJson('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.1 }),
            timeout_ms: 12000
        });
        content = data?.choices?.[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
        const data = await fetchJson('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
            timeout_ms: 12000
        });
        content = (data?.content || []).map(part => part.text || '').join('\n');
    } else if (provider === 'google') {
        const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            timeout_ms: 12000
        });
        content = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
    } else if (provider === 'azure_openai') {
        if (!endpoint) return { enabled: false, reason: 'Azure endpoint is missing', suggestions: [] };
        const data = await fetchJson(`${endpoint}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=2024-10-21`, {
            method: 'POST',
            headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature: 0.1 }),
            timeout_ms: 12000
        });
        content = data?.choices?.[0]?.message?.content || '';
    } else {
        if (!endpoint) return { enabled: false, reason: 'Custom endpoint is missing', suggestions: [] };
        const data = await fetchJson(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.1 }),
            timeout_ms: 12000
        });
        content = data?.choices?.[0]?.message?.content || '';
    }

    const parsed = parseJsonObjectText(content);
    const suggestions = (Array.isArray(parsed?.suggestions) ? parsed.suggestions : [])
        .map(item => ({
            field: cleanSuggestionValue(item.field, 80),
            value: cleanSuggestionValue(item.value, item.field === 'skill' ? 1000 : 255),
            confidence: Number(item.confidence || 0),
            source: cleanSuggestionValue(item.source || 'AI suggestion', 255)
        }))
        .filter(item => blankFields.includes(item.field) && item.value)
        .slice(0, 12);
    return { enabled: true, suggestions };
}

router.get('/', async (req, res) => {
    const { rows } = await db.query(
        `${RESOURCE_SELECT}
         WHERE r.tenant_id=$1
         ORDER BY r.first_name, r.last_name`,
        [req.tenantId]
    );
    res.json(rows);
});

router.post('/ai-suggest',
    requireRole('admin', 'superadmin'),
    async (req, res) => {
        try {
            const body = req.body || {};
            const resource = body.resource && typeof body.resource === 'object' ? body.resource : body;
            const result = await runResourceSuggestionAi(req.tenantId, resource, body.sources || []);
            res.json(result);
        } catch (err) {
            console.error('[resource ai suggest]', err.message);
            const message = err.status === 401 || err.status === 403
                ? 'AI provider rejected the API key or credentials'
                : err.name === 'AbortError'
                    ? 'AI suggestion timed out'
                    : err.message || 'AI suggestion failed';
            const status = err.status === 401 || err.status === 403 ? 400 : (err.status >= 500 ? 502 : 400);
            res.status(status).json({ enabled: false, reason: message, suggestions: [] });
        }
    }
);

router.post('/source-search',
    requireRole('admin', 'superadmin'),
    async (req, res) => {
        try {
            const result = await runResourceSourceSearch(req.tenantId, req.body || {});
            res.json(result);
        } catch (err) {
            console.error('[resource source search]', err.message);
            const message = err.status === 401 || err.status === 403
                ? 'Search provider rejected the API key or credentials'
                : err.name === 'AbortError'
                    ? 'Source search timed out'
                    : err.message || 'Source search failed';
            const status = err.status === 401 || err.status === 403 ? 400 : (err.status >= 500 ? 502 : 400);
            res.status(status).json({ enabled: false, reason: message, results: [] });
        }
    }
);

// NOTE: '/assignments/*' routes are declared before '/:id' so the literal
// path wins over the :id param.

// --- Resource assignments (Gantt) ---
// resource_assignments has no own tenant_id; it's scoped through its parent
// resource (and project), both of which carry tenant_id.
router.get('/assignments/all', async (req, res) => {
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const yearStart = `${year}-01-01`;
    const yearEnd   = `${year}-12-31`;
    const { rows } = await db.query(
        `SELECT ra.*, r.first_name, r.last_name, r.nick_name,
                p.project_code, p.description AS project_description,
                c.alias AS customer_alias, c.color_hex AS customer_color
         FROM resource_assignments ra
         JOIN resources r ON r.id = ra.resource_id
         JOIN projects  p ON p.id = ra.project_id
         LEFT JOIN customers c ON c.id = p.customer_id
         WHERE ra.start_date <= $2 AND ra.end_date >= $1
           AND r.tenant_id = $3
         ORDER BY r.first_name, ra.start_date`,
        [yearStart, yearEnd, req.tenantId]
    );
    res.json(rows);
});

// Verify both the resource and the project belong to the caller's tenant.
async function assertResourceAndProjectInTenant(resourceId, projectId, tenantId) {
    const { rows } = await db.query(
        `SELECT
            (SELECT tenant_id FROM resources WHERE id=$1) AS r_tenant,
            (SELECT tenant_id FROM projects  WHERE id=$2) AS p_tenant`,
        [resourceId, projectId]
    );
    const r = rows[0] || {};
    return r.r_tenant === tenantId && r.p_tenant === tenantId;
}

router.post('/assignments',
    body('resource_id').isInt(),
    body('project_id').isInt(),
    body('start_date').isISO8601(),
    body('end_date').isISO8601(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

        const ok = await assertResourceAndProjectInTenant(
            req.body.resource_id, req.body.project_id, req.tenantId
        );
        if (!ok) return res.status(400).json({ error: 'Resource or project not found in your team' });

        const { rows } = await db.query(
            `INSERT INTO resource_assignments(resource_id, project_id, start_date, end_date, note)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [req.body.resource_id, req.body.project_id, req.body.start_date,
             req.body.end_date, req.body.note || '']
        );
        res.status(201).json(rows[0]);
    }
);

router.put('/assignments/:id', param('id').isInt(), async (req, res) => {
    // The assignment must belong to the caller's tenant (via its resource).
    const existing = await db.query(
        `SELECT ra.* FROM resource_assignments ra
           JOIN resources r ON r.id = ra.resource_id
          WHERE ra.id=$1 AND r.tenant_id=$2`,
        [req.params.id, req.tenantId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });

    // If reassigning to a different resource/project, verify those too.
    const nextResource = req.body.resource_id || existing.rows[0].resource_id;
    const nextProject  = req.body.project_id  || existing.rows[0].project_id;
    const ok = await assertResourceAndProjectInTenant(nextResource, nextProject, req.tenantId);
    if (!ok) return res.status(400).json({ error: 'Resource or project not found in your team' });

    const { rows } = await db.query(
        `UPDATE resource_assignments
            SET resource_id=COALESCE($1, resource_id),
                project_id =COALESCE($2, project_id),
                start_date =COALESCE($3, start_date),
                end_date   =COALESCE($4, end_date),
                note       =COALESCE($5, note)
          WHERE id=$6 RETURNING *`,
        [req.body.resource_id || null, req.body.project_id || null,
         req.body.start_date || null,  req.body.end_date || null,
         req.body.note ?? null, req.params.id]
    );
    res.json(rows[0]);
});

router.delete('/assignments/:id', param('id').isInt(), async (req, res) => {
    const { rowCount } = await db.query(
        `DELETE FROM resource_assignments ra
          USING resources r
          WHERE ra.id=$1 AND ra.resource_id = r.id AND r.tenant_id=$2`,
        [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

// --- Resource CRUD (the :id route is declared after the literal /assignments paths) ---
router.get('/roles', requireRole('admin', 'superadmin'), async (req, res) => {
    await ensureDefaultRoles(req.tenantId);
    const { rows } = await db.query(
        `SELECT id, name, base_role, is_system
           FROM tenant_roles
          WHERE tenant_id=$1
            AND ($2 = 'superadmin' OR base_role <> 'superadmin')
          ORDER BY is_system DESC, base_role, name`,
        [req.tenantId, req.user.role]
    );
    res.json(rows);
});

router.get('/users', requireRole('admin', 'superadmin'), async (req, res) => {
    const { rows } = await db.query(
        `SELECT u.id, u.username, u.full_name, u.email, u.role,
                u.tenant_role_id, tr.name AS tenant_role_name,
                r.id AS mapped_resource_id,
                CONCAT_WS(' ', NULLIF(r.first_name, ''), NULLIF(r.last_name, '')) AS mapped_resource_name
           FROM users u
           LEFT JOIN tenant_roles tr ON tr.id = u.tenant_role_id AND tr.tenant_id = u.tenant_id
           LEFT JOIN resources r ON r.user_id = u.id AND r.tenant_id = u.tenant_id
          WHERE u.tenant_id=$1
            AND u.role IN ('user','admin','superadmin')
            AND ($2 = 'superadmin' OR u.role <> 'superadmin')
          ORDER BY u.username`,
        [req.tenantId, req.user.role]
    );
    res.json(rows);
});

router.post('/:id/map-user',
    requireRole('admin', 'superadmin'),
    param('id').isInt(),
    body('user_id').isInt(),
    body('tenant_role_id').optional({ nullable: true, checkFalsy: true }).isInt(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

        const userId = Number(req.body.user_id);
        const tenantRole = await tenantRoleForActor(req.tenantId, req.body.tenant_role_id, req.user.role);
        if (!tenantRole) return res.status(400).json({ error: 'Invalid role for this team' });
        const existingUser = await db.query(
            `SELECT id FROM users
              WHERE id=$1 AND tenant_id=$2 AND role IN ('user','admin','superadmin')
                AND ($3 = 'superadmin' OR role <> 'superadmin')`,
            [userId, req.tenantId, req.user.role]
        );
        if (!existingUser.rows[0]) return res.status(404).json({ error: 'User not found in this team' });

        const existingMap = await db.query(
            `SELECT id FROM resources
              WHERE tenant_id=$1 AND user_id=$2 AND id<>$3`,
            [req.tenantId, userId, req.params.id]
        );
        if (existingMap.rows[0]) return res.status(409).json({ error: 'This user is already linked to another resource' });

        const client = await db.getClient();
        let rows;
        try {
            await client.query('BEGIN');
            await client.query(
                'UPDATE users SET role=$1, tenant_role_id=$2 WHERE id=$3 AND tenant_id=$4',
                [tenantRole.base_role, tenantRole.id, userId, req.tenantId]
            );
            const updated = await client.query(
                'UPDATE resources SET user_id=$1 WHERE id=$2 AND tenant_id=$3 RETURNING id',
                [userId, req.params.id, req.tenantId]
            );
            if (!updated.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Resource not found' });
            }
            rows = updated.rows;
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
        res.json(await getResourceWithUser(req.params.id, req.tenantId));
    }
);

router.post('/:id/create-user',
    requireRole('admin', 'superadmin'),
    param('id').isInt(),
    body('tenant_role_id').optional({ nullable: true, checkFalsy: true }).isInt(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const { rows: resourceRows } = await client.query(
                'SELECT * FROM resources WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
                [req.params.id, req.tenantId]
            );
            const resource = resourceRows[0];
            if (!resource) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Resource not found' });
            }
            if (resource.user_id) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'This resource already has a linked user' });
            }

            const username = String(resource.erp_username || '').trim();
            const password = String(resource.emp_id || '').trim();
            if (!username) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'ERP Username is required before creating a user' });
            }
            if (username.length > 64) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'ERP Username must be 64 characters or fewer to be used as username' });
            }
            if (!password) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Emp ID is required as the default password' });
            }
            const duplicateUsername = await client.query(
                `SELECT 1 FROM users
                  WHERE tenant_id=$1 AND LOWER(username)=LOWER($2)
                  LIMIT 1`,
                [req.tenantId, username]
            );
            if (duplicateUsername.rowCount) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Username already exists in this team' });
            }

            const role = await tenantRoleForActor(req.tenantId, req.body.tenant_role_id, req.user.role, client);
            if (!role) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Invalid role for this team' });
            }
            const hash = await bcrypt.hash(password, 10);
            const fullName = [resource.first_name, resource.last_name].filter(Boolean).join(' ').trim()
                || resource.nick_name
                || username;
            const { rows: userRows } = await client.query(
                `INSERT INTO users(tenant_id, username, password_hash, full_name, email, phone_number, role, tenant_role_id, must_change_password)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
                 RETURNING id`,
                [req.tenantId, username, hash, fullName, resource.email || '', resource.mobile_phone || '', role.base_role, role.id]
            );

            await client.query(
                'UPDATE resources SET user_id=$1 WHERE id=$2 AND tenant_id=$3',
                [userRows[0].id, req.params.id, req.tenantId]
            );
            const linked = await getResourceWithUser(req.params.id, req.tenantId, client);
            await client.query('COMMIT');
            res.status(201).json(linked);
        } catch (err) {
            await client.query('ROLLBACK');
            if (err.code === '23505') {
                return res.status(409).json({ error: 'Username already exists in this team or user is already linked' });
            }
            throw err;
        } finally {
            client.release();
        }
    }
);

router.delete('/:id/user', requireRole('admin', 'superadmin'), param('id').isInt(), async (req, res) => {
    const { rows } = await db.query(
        'UPDATE resources SET user_id=NULL WHERE id=$1 AND tenant_id=$2 RETURNING id',
        [req.params.id, req.tenantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Resource not found' });
    res.json(await getResourceWithUser(req.params.id, req.tenantId));
});

router.get('/:id', param('id').isInt(), async (req, res) => {
    const row = await getResourceWithUser(req.params.id, req.tenantId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
});

const resourceValidators = [
    body('first_name').optional().isString(),
    body('last_name').optional().isString(),
    body('nick_name').optional().isString(),
    body('emp_id').optional().isString(),
    body('role').optional().isString(),
    body('email').optional().isString(),
    body('mobile_phone').optional().isString(),
    body('instagram').optional().isString(),
    body('line_id').optional().isString(),
    body('facebook').optional().isString(),
    body('erp_username').optional().isString(),
    body('skill').optional().isString(),
    body('picture_data').optional({ nullable: true }).custom((v) => {
        if (v === null || v === '') return true;
        if (typeof v !== 'string') throw new Error('picture_data must be a string or null');
        if (!v.startsWith('data:image/')) throw new Error('picture_data must be a data:image/* URL');
        if (v.length > 10 * 1024 * 1024) throw new Error('picture_data exceeds 10MB');
        return true;
    })
];

router.post('/', resourceValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const b = req.body;
    try {
        const { rows } = await db.query(
            `INSERT INTO resources(tenant_id, emp_id, first_name, last_name, nick_name, role, email, mobile_phone, instagram, line_id, facebook, erp_username, skill, picture_data)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
            [req.tenantId, b.emp_id || null, b.first_name || '', b.last_name || '', b.nick_name || '',
             b.role || '', b.email || '', b.mobile_phone || '', b.instagram || '', b.line_id || '', b.facebook || '',
             b.erp_username || '', b.skill || '',
             b.picture_data || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Emp ID already exists' });
        throw err;
    }
});

router.put('/:id', param('id').isInt(), resourceValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });

    const b = req.body;
    try {
        const existingRows = await db.query(
            'SELECT * FROM resources WHERE id=$1 AND tenant_id=$2',
            [req.params.id, req.tenantId]
        );
        const existing = existingRows.rows[0];
        if (!existing) return res.status(404).json({ error: 'Not found' });

        const isManager = canManageResources(req.user);
        if (!isManager && Number(existing.user_id) !== Number(req.user.uid)) {
            return res.status(403).json({ error: 'You can only edit your own mapped resource information' });
        }

        // picture_data semantics: undefined -> keep, null/empty -> clear, string -> replace.
        const newPic = (b.picture_data === undefined) ? '__KEEP__' : (b.picture_data || null);
        const next = {
            emp_id: isManager && b.emp_id !== undefined ? b.emp_id : existing.emp_id,
            first_name: b.first_name !== undefined ? b.first_name : existing.first_name,
            last_name: b.last_name !== undefined ? b.last_name : existing.last_name,
            nick_name: b.nick_name !== undefined ? b.nick_name : existing.nick_name,
            role: b.role !== undefined ? b.role : existing.role,
            email: b.email !== undefined ? b.email : existing.email,
            mobile_phone: b.mobile_phone !== undefined ? b.mobile_phone : existing.mobile_phone,
            instagram: b.instagram !== undefined ? b.instagram : existing.instagram,
            line_id: b.line_id !== undefined ? b.line_id : existing.line_id,
            facebook: b.facebook !== undefined ? b.facebook : existing.facebook,
            erp_username: isManager && b.erp_username !== undefined ? b.erp_username : existing.erp_username,
            skill: b.skill !== undefined ? b.skill : existing.skill
        };

        const { rows } = await db.query(
            `UPDATE resources SET emp_id=$1, first_name=$2, last_name=$3, nick_name=$4,
                                  role=$5, email=$6, mobile_phone=$7, instagram=$8, line_id=$9, facebook=$10,
                                  erp_username=$11, skill=$12,
                                  picture_data = CASE WHEN $13::text = '__KEEP__' THEN picture_data
                                                      ELSE NULLIF($14::text, '__NULL__') END
             WHERE id=$15 AND tenant_id=$16 RETURNING *`,
            [next.emp_id || null, next.first_name || '', next.last_name || '', next.nick_name || '',
             next.role || '', next.email || '', next.mobile_phone || '', next.instagram || '', next.line_id || '', next.facebook || '',
             next.erp_username || '', next.skill || '',
             newPic === '__KEEP__' ? '__KEEP__' : 'replace',
             newPic === '__KEEP__' ? null : (newPic === null ? '__NULL__' : newPic),
             req.params.id, req.tenantId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Not found' });

        // Keep the linked login display name aligned, but never fail saving the
        // resource because of a secondary user-profile sync.
        try {
            if (rows[0].user_id) {
                const fullName = [rows[0].first_name, rows[0].last_name].filter(Boolean).join(' ').trim()
                    || rows[0].nick_name
                    || rows[0].erp_username
                    || '';
                await db.query(
                    `UPDATE users
                        SET full_name=$1,
                            phone_number=$2
                      WHERE id=$3 AND tenant_id=$4`,
                    [fullName, rows[0].mobile_phone || '', rows[0].user_id, req.tenantId]
                );
            }
        } catch (syncErr) {
            console.error('[resources] linked user sync failed:', syncErr.message);
        }
        res.json(await getResourceWithUser(req.params.id, req.tenantId));
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Emp ID already exists' });
        throw err;
    }
});

router.delete('/:id', param('id').isInt(), async (req, res) => {
    const { rowCount } = await db.query(
        'DELETE FROM resources WHERE id=$1 AND tenant_id=$2',
        [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

module.exports = router;
