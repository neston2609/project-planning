const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const db = require('../db');
const { requireAuth, requireRole, requireTenant } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireTenant);

const DEFAULT_CATEGORIES = ['Knowledge', 'Troubleshooting'];
const DEFAULT_PRODUCTS = ['UiPath', 'Kryon'];
const DEFAULT_VERSION_LIMIT = 20;
const AI_CONFIG_KEYS = ['ai_provider', 'ai_api_key', 'ai_endpoint', 'ai_model'];

function cleanString(value, max = 255) {
    return String(value || '').trim().slice(0, max);
}

function cleanStringArray(value, maxItems = 50, maxLen = 500) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(v => cleanString(v, maxLen)).filter(Boolean))].slice(0, maxItems);
}

function stripHtml(value) {
    return String(value || '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function dataUrlToBuffer(dataUrl) {
    const m = String(dataUrl || '').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
    if (!m) return { mime: '', buffer: Buffer.alloc(0), text: '' };
    const mime = String(m[1] || '').toLowerCase();
    const raw = m[3] || '';
    if (m[2]) return { mime, buffer: Buffer.from(raw, 'base64'), text: '' };
    const text = decodeURIComponent(raw);
    return { mime, buffer: Buffer.from(text, 'utf8'), text };
}

function cleanExtractedText(value, max = 120000) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function extractAttachmentText(file = {}) {
    const fileName = String(file.file_name || file.name || '').toLowerCase();
    const mimeType = String(file.mime_type || file.type || '').toLowerCase();
    const { mime, buffer, text } = dataUrlToBuffer(file.data_url);
    const type = mimeType || mime;
    if (!buffer.length && !text) return '';

    try {
        if (type.includes('pdf') || fileName.endsWith('.pdf')) {
            const parsed = await pdfParse(buffer);
            return cleanExtractedText(parsed.text);
        }
        if (
            type.includes('spreadsheet') ||
            type.includes('excel') ||
            fileName.endsWith('.xlsx') ||
            fileName.endsWith('.xls') ||
            fileName.endsWith('.csv')
        ) {
            const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
            const parts = [];
            for (const sheetName of wb.SheetNames) {
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false });
                parts.push(sheetName);
                for (const row of rows) parts.push(row.filter(Boolean).join(' '));
            }
            return cleanExtractedText(parts.join(' '));
        }
        if (type.startsWith('text/') || type.includes('json') || type.includes('xml') || /\.(txt|md|log|json|xml|csv)$/i.test(fileName)) {
            return cleanExtractedText(text || buffer.toString('utf8'));
        }
        if (type.startsWith('image/')) {
            const Tesseract = require('tesseract.js');
            const result = await Tesseract.recognize(buffer, 'eng');
            return cleanExtractedText(result?.data?.text);
        }
    } catch (err) {
        console.error('[kb attachment extract]', fileName || type || 'file', err.message);
    }
    return '';
}

async function getTenantConfigMap(tenantId, keys, client = db) {
    const { rows } = await client.query(
        'SELECT key, value FROM tenant_config WHERE tenant_id=$1 AND key = ANY($2)',
        [tenantId, keys]
    );
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function cleanAiProvider(value) {
    const provider = String(value || '').trim().toLowerCase();
    return ['openai', 'anthropic', 'google', 'azure_openai', 'custom'].includes(provider) ? provider : 'openai';
}

function normalizeEndpoint(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const { timeout_ms, ...fetchOptions } = options;
    const timeout = setTimeout(() => controller.abort(), Number(timeout_ms || 8000));
    let response;
    try {
        response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
    const responseText = await response.text();
    let data = null;
    try { data = responseText ? JSON.parse(responseText) : null; } catch { data = { raw: responseText }; }
    if (!response.ok) {
        const message = data?.error?.message || data?.error || data?.message || response.statusText || 'AI request failed';
        throw new Error(message);
    }
    return data;
}

function parseJsonArrayText(value) {
    const text = String(value || '').trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function expandSearchTermsWithAi(tenantId, queryText) {
    try {
        const cfg = await getTenantConfigMap(tenantId, AI_CONFIG_KEYS);
        const provider = cleanAiProvider(cfg.ai_provider || 'openai');
        const apiKey = cfg.ai_api_key || '';
        const endpoint = normalizeEndpoint(cfg.ai_endpoint);
        const model = String(cfg.ai_model || '').trim();
        if (!apiKey || !model || !queryText) return { enabled: false, terms: [], reason: 'AI configuration is incomplete' };

        const prompt = `Return only a JSON array of 5 to 12 short search keywords or phrases related to this knowledge base query. Include synonyms, product terms, error wording, and likely troubleshooting phrases. Query: ${queryText}`;
        let content = '';
        if (provider === 'openai') {
            const data = await fetchJson('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.1 })
            });
            content = data?.choices?.[0]?.message?.content || '';
        } else if (provider === 'anthropic') {
            const data = await fetchJson('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
            });
            content = (data?.content || []).map(part => part.text || '').join('\n');
        } else if (provider === 'google') {
            const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            content = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
        } else if (provider === 'azure_openai') {
            if (!endpoint) return { enabled: false, terms: [], reason: 'Azure endpoint is missing' };
            const data = await fetchJson(`${endpoint}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=2024-10-21`, {
                method: 'POST',
                headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], temperature: 0.1 })
            });
            content = data?.choices?.[0]?.message?.content || '';
        } else {
            if (!endpoint) return { enabled: false, terms: [], reason: 'Custom endpoint is missing' };
            const data = await fetchJson(`${endpoint}/chat/completions`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.1 })
            });
            content = data?.choices?.[0]?.message?.content || '';
        }
        const terms = cleanStringArray(parseJsonArrayText(content), 12, 80)
            .filter(term => term.toLowerCase() !== queryText.toLowerCase());
        return { enabled: true, terms };
    } catch (err) {
        console.error('[kb ai search]', err.message);
        return { enabled: false, terms: [], reason: err.name === 'AbortError' ? 'AI search timed out' : (err.message || 'AI search failed') };
    }
}

function isAdminRole(user) {
    return user && (user.role === 'admin' || user.role === 'superadmin');
}

async function ensureDefaults(tenantId, client = db) {
    const categorySeed = await client.query(
        "SELECT value FROM tenant_config WHERE tenant_id=$1 AND key='kb_categories_seeded'",
        [tenantId]
    );
    const productSeed = await client.query(
        "SELECT value FROM tenant_config WHERE tenant_id=$1 AND key='kb_products_seeded'",
        [tenantId]
    );
    if (categorySeed.rows[0]?.value !== 'true') {
        for (const name of DEFAULT_CATEGORIES) {
            await client.query(
                `INSERT INTO kb_categories(tenant_id, name, is_system)
                 VALUES ($1,$2,TRUE)
                 ON CONFLICT (tenant_id, name) DO NOTHING`,
                [tenantId, name]
            );
        }
        await client.query(
            `INSERT INTO tenant_config(tenant_id, key, value)
             VALUES ($1,'kb_categories_seeded','true')
             ON CONFLICT (tenant_id, key) DO UPDATE SET value='true', updated_at=NOW()`,
            [tenantId]
        );
    }
    if (productSeed.rows[0]?.value !== 'true') {
        for (const name of DEFAULT_PRODUCTS) {
            await client.query(
                `INSERT INTO kb_products(tenant_id, name, is_system)
                 VALUES ($1,$2,TRUE)
                 ON CONFLICT (tenant_id, name) DO NOTHING`,
                [tenantId, name]
            );
        }
        await client.query(
            `INSERT INTO tenant_config(tenant_id, key, value)
             VALUES ($1,'kb_products_seeded','true')
             ON CONFLICT (tenant_id, key) DO UPDATE SET value='true', updated_at=NOW()`,
            [tenantId]
        );
    }
    await client.query(
        `INSERT INTO tenant_config(tenant_id, key, value)
         VALUES ($1,'kb_version_limit',$2)
         ON CONFLICT (tenant_id, key) DO NOTHING`,
        [tenantId, String(DEFAULT_VERSION_LIMIT)]
    );
}

async function versionLimit(tenantId, client = db) {
    const { rows } = await client.query(
        "SELECT value FROM tenant_config WHERE tenant_id=$1 AND key='kb_version_limit'",
        [tenantId]
    );
    const n = Number(rows[0]?.value || DEFAULT_VERSION_LIMIT);
    return Number.isInteger(n) && n >= 0 ? n : DEFAULT_VERSION_LIMIT;
}

async function assertLookup(table, id, tenantId, client = db) {
    if (!id) return null;
    const { rows } = await client.query(
        `SELECT id FROM ${table} WHERE id=$1 AND tenant_id=$2`,
        [id, tenantId]
    );
    return rows[0]?.id || null;
}

async function articleSnapshot(articleId, tenantId, client = db) {
    const articleRows = await client.query(
        `SELECT a.*
           FROM kb_articles a
          WHERE a.id=$1 AND a.tenant_id=$2`,
        [articleId, tenantId]
    );
    const article = articleRows.rows[0];
    if (!article) return null;
    const attachments = await client.query(
        `SELECT file_name, mime_type, file_size, data_url
           FROM kb_attachments
          WHERE article_id=$1 AND tenant_id=$2
          ORDER BY id`,
        [articleId, tenantId]
    );
    const related = await client.query(
        `SELECT related_article_id
           FROM kb_article_related
          WHERE article_id=$1
          ORDER BY related_article_id`,
        [articleId]
    );
    return {
        ...article,
        attachments: attachments.rows,
        related_ids: related.rows.map(r => r.related_article_id)
    };
}

function changeSummary(prev, next) {
    const checks = [
        ['title', 'Title'],
        ['content', 'Content'],
        ['category_id', 'Category'],
        ['product_id', 'Product'],
        ['tags', 'Tags'],
        ['reference_urls', 'Reference URLs'],
        ['attachments', 'Attachments'],
        ['related_ids', 'Related Articles']
    ];
    const changed = checks.filter(([key]) => JSON.stringify(prev[key] || null) !== JSON.stringify(next[key] || null))
        .map(([, label]) => label);
    return changed.length ? `Changed: ${changed.join(', ')}` : 'Saved without field changes';
}

async function insertAttachments(articleId, tenantId, attachments, client = db) {
    for (const f of Array.isArray(attachments) ? attachments : []) {
        const fileName = cleanString(f.file_name || f.name, 255);
        const dataUrl = String(f.data_url || '');
        if (!fileName || !dataUrl.startsWith('data:')) continue;
        if (dataUrl.length > 10 * 1024 * 1024) continue;
        const extractedText = await extractAttachmentText({
            file_name: fileName,
            mime_type: f.mime_type || f.type,
            data_url: dataUrl
        });
        await client.query(
            `INSERT INTO kb_attachments(tenant_id, article_id, file_name, mime_type, file_size, data_url, extracted_text)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [tenantId, articleId, fileName, cleanString(f.mime_type || f.type, 255), Number(f.file_size || f.size || 0), dataUrl, extractedText]
        );
    }
}

async function hydrateMissingAttachmentText(tenantId, client = db) {
    const { rows } = await client.query(
        `SELECT id, file_name, mime_type, data_url
           FROM kb_attachments
          WHERE tenant_id=$1
            AND extracted_text IS NULL
          ORDER BY id
          LIMIT 25`,
        [tenantId]
    );
    for (const row of rows) {
        const extractedText = await extractAttachmentText(row);
        await client.query(
            'UPDATE kb_attachments SET extracted_text=$1 WHERE id=$2 AND tenant_id=$3',
            [extractedText, row.id, tenantId]
        );
    }
}

async function insertRelated(articleId, tenantId, relatedIds, client = db) {
    const ids = [...new Set((Array.isArray(relatedIds) ? relatedIds : []).map(Number).filter(Boolean))]
        .filter(id => id !== Number(articleId));
    if (ids.length === 0) return;
    const valid = await client.query(
        `SELECT id FROM kb_articles WHERE tenant_id=$1 AND id = ANY($2::int[])`,
        [tenantId, ids]
    );
    for (const row of valid.rows) {
        await client.query(
            `INSERT INTO kb_article_related(article_id, related_article_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [articleId, row.id]
        );
    }
}

const articleSelect = `
    SELECT a.*,
           c.name AS category_name,
           p.name AS product_name,
           au.username AS author_username,
           au.full_name AS author_name,
           lu.username AS last_updated_by_username,
           lu.full_name AS last_updated_by_name,
           COALESCE(att.n, 0)::int AS attachment_count
      FROM kb_articles a
      LEFT JOIN kb_categories c ON c.id = a.category_id
      LEFT JOIN kb_products p ON p.id = a.product_id
      LEFT JOIN users au ON au.id = a.author_id
      LEFT JOIN users lu ON lu.id = a.last_updated_by
      LEFT JOIN (
        SELECT article_id, COUNT(*) AS n FROM kb_attachments GROUP BY article_id
      ) att ON att.article_id = a.id
`;

router.get('/config', async (req, res) => {
    await ensureDefaults(req.tenantId);
    const [categories, products, limitRows] = await Promise.all([
        db.query('SELECT id, name, is_system FROM kb_categories WHERE tenant_id=$1 ORDER BY name', [req.tenantId]),
        db.query('SELECT id, name, is_system FROM kb_products WHERE tenant_id=$1 ORDER BY name', [req.tenantId]),
        db.query("SELECT value FROM tenant_config WHERE tenant_id=$1 AND key='kb_version_limit'", [req.tenantId])
    ]);
    res.json({
        categories: categories.rows,
        products: products.rows,
        version_limit: Number(limitRows.rows[0]?.value || DEFAULT_VERSION_LIMIT)
    });
});

router.put('/config/version-limit',
    requireRole('admin', 'superadmin'),
    body('value').isInt({ min: 0, max: 500 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const { rows } = await db.query(
            `INSERT INTO tenant_config(tenant_id, key, value)
             VALUES ($1,'kb_version_limit',$2)
             ON CONFLICT (tenant_id, key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
             RETURNING value`,
            [req.tenantId, String(Number(req.body.value))]
        );
        res.json({ version_limit: Number(rows[0].value) });
    }
);

for (const [path, table] of [['categories', 'kb_categories'], ['products', 'kb_products']]) {
    router.post(`/config/${path}`,
        requireRole('admin', 'superadmin'),
        body('name').isString().trim().notEmpty().isLength({ max: 128 }),
        async (req, res) => {
            const errs = validationResult(req);
            if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
            try {
                const { rows } = await db.query(
                    `INSERT INTO ${table}(tenant_id, name, is_system)
                     VALUES ($1,$2,FALSE)
                     RETURNING id, name, is_system`,
                    [req.tenantId, cleanString(req.body.name, 128)]
                );
                res.status(201).json(rows[0]);
            } catch (err) {
                if (err.code === '23505') return res.status(409).json({ error: 'Name already exists' });
                throw err;
            }
        }
    );
    router.put(`/config/${path}/:id`,
        requireRole('admin', 'superadmin'),
        param('id').isInt(),
        body('name').isString().trim().notEmpty().isLength({ max: 128 }),
        async (req, res) => {
            const errs = validationResult(req);
            if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
            try {
                const { rows } = await db.query(
                    `UPDATE ${table}
                        SET name=$1, updated_at=NOW()
                      WHERE id=$2 AND tenant_id=$3
                      RETURNING id, name, is_system`,
                    [cleanString(req.body.name, 128), req.params.id, req.tenantId]
                );
                if (!rows[0]) return res.status(404).json({ error: 'Not found' });
                res.json(rows[0]);
            } catch (err) {
                if (err.code === '23505') return res.status(409).json({ error: 'Name already exists' });
                throw err;
            }
        }
    );
    router.delete(`/config/${path}/:id`,
        requireRole('admin', 'superadmin'),
        param('id').isInt(),
        async (req, res) => {
            const { rowCount } = await db.query(
                `DELETE FROM ${table} WHERE id=$1 AND tenant_id=$2`,
                [req.params.id, req.tenantId]
            );
            if (!rowCount) return res.status(404).json({ error: 'Not found' });
            res.json({ ok: true });
        }
    );
}

router.get('/articles',
    query('search').optional().isString(),
    async (req, res) => {
        await ensureDefaults(req.tenantId);
        const q = cleanString(req.query.search, 255);
        const useAi = String(req.query.ai || '').toLowerCase() === 'true';
        let ai = { enabled: false, terms: [] };
        let searchTerms = q ? [q] : [];
        if (q) {
            try {
                await hydrateMissingAttachmentText(req.tenantId);
            } catch (err) {
                console.error('[kb attachment hydrate]', err.message);
            }
            if (useAi) {
                ai = await expandSearchTermsWithAi(req.tenantId, q);
                searchTerms = [...new Set([q, ...(ai.terms || [])].map(term => cleanString(term, 80)).filter(Boolean))].slice(0, 12);
            }
        }
        const params = [req.tenantId];
        let where = 'WHERE a.tenant_id=$1';
        const scoreParts = [];
        if (searchTerms.length > 0) {
            const orParts = [];
            for (const term of searchTerms) {
                params.push(`%${term.toLowerCase()}%`);
                const idx = params.length;
                const part = `(
                    LOWER(a.title) LIKE $${idx}
                    OR LOWER(COALESCE(a.content,'')) LIKE $${idx}
                    OR LOWER(COALESCE(c.name,'')) LIKE $${idx}
                    OR LOWER(COALESCE(p.name,'')) LIKE $${idx}
                    OR EXISTS (SELECT 1 FROM unnest(a.tags) tag WHERE LOWER(tag) LIKE $${idx})
                    OR EXISTS (SELECT 1 FROM unnest(a.reference_urls) ref WHERE LOWER(ref) LIKE $${idx})
                    OR EXISTS (
                        SELECT 1 FROM kb_attachments sx
                         WHERE sx.article_id=a.id
                           AND sx.tenant_id=a.tenant_id
                           AND (
                                LOWER(COALESCE(sx.file_name,'')) LIKE $${idx}
                                OR LOWER(COALESCE(sx.extracted_text,'')) LIKE $${idx}
                           )
                    )
                )`;
                orParts.push(part);
                scoreParts.push(`CASE WHEN ${part} THEN ${idx === 2 ? 6 : 2} ELSE 0 END`);
            }
            where += ` AND (${orParts.join(' OR ')})`;
        }
        const { rows } = await db.query(
            `${articleSelect}
              ${where}
              ORDER BY ${scoreParts.length ? `(${scoreParts.join(' + ')}) DESC,` : ''} a.updated_at DESC, a.title`,
            params
        );
        if (useAi) {
            return res.json({
                articles: rows,
                ai: {
                    enabled: ai.enabled,
                    terms: ai.terms || [],
                    reason: ai.reason || null
                }
            });
        }
        res.json(rows);
    }
);

router.get('/articles/:id', param('id').isInt(), async (req, res) => {
    const articleRows = await db.query(
        `${articleSelect}
          WHERE a.id=$1 AND a.tenant_id=$2`,
        [req.params.id, req.tenantId]
    );
    const article = articleRows.rows[0];
    if (!article) return res.status(404).json({ error: 'Article not found' });
    const [attachments, related, history] = await Promise.all([
        db.query(
            `SELECT id, file_name, mime_type, file_size, data_url, created_at
               FROM kb_attachments
              WHERE article_id=$1 AND tenant_id=$2
              ORDER BY id`,
            [req.params.id, req.tenantId]
        ),
        db.query(
            `${articleSelect}
              JOIN kb_article_related rel ON rel.related_article_id = a.id
             WHERE rel.article_id=$1 AND a.tenant_id=$2
             ORDER BY a.title`,
            [req.params.id, req.tenantId]
        ),
        db.query(
            `SELECT v.id, v.version, v.change_summary, v.changed_at,
                    u.username AS changed_by_username, u.full_name AS changed_by_name
               FROM kb_article_versions v
               LEFT JOIN users u ON u.id = v.changed_by
              WHERE v.article_id=$1 AND v.tenant_id=$2
              ORDER BY v.version DESC`,
            [req.params.id, req.tenantId]
        )
    ]);
    res.json({ ...article, attachments: attachments.rows, related_articles: related.rows, history: history.rows });
});

router.post('/articles',
    body('title').isString().trim().notEmpty().isLength({ max: 255 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await ensureDefaults(req.tenantId, client);
            const categoryId = await assertLookup('kb_categories', req.body.category_id, req.tenantId, client);
            const productId = await assertLookup('kb_products', req.body.product_id, req.tenantId, client);
            const { rows } = await client.query(
                `INSERT INTO kb_articles(tenant_id, title, content, category_id, product_id, tags, reference_urls, author_id, last_updated_by, version)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,1)
                 RETURNING id`,
                [
                    req.tenantId,
                    cleanString(req.body.title, 255),
                    String(req.body.content || ''),
                    categoryId,
                    productId,
                    cleanStringArray(req.body.tags, 50, 80),
                    cleanStringArray(req.body.reference_urls, 30, 1000),
                    req.user.uid
                ]
            );
            await insertAttachments(rows[0].id, req.tenantId, req.body.attachments, client);
            await insertRelated(rows[0].id, req.tenantId, req.body.related_ids, client);
            await client.query('COMMIT');
            const created = await db.query(`${articleSelect} WHERE a.id=$1 AND a.tenant_id=$2`, [rows[0].id, req.tenantId]);
            res.status(201).json(created.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
);

router.put('/articles/:id',
    param('id').isInt(),
    body('title').isString().trim().notEmpty().isLength({ max: 255 }),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await ensureDefaults(req.tenantId, client);
            const prev = await articleSnapshot(req.params.id, req.tenantId, client);
            if (!prev) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Article not found' });
            }
            const categoryId = await assertLookup('kb_categories', req.body.category_id, req.tenantId, client);
            const productId = await assertLookup('kb_products', req.body.product_id, req.tenantId, client);
            const nextSnapshot = {
                title: cleanString(req.body.title, 255),
                content: String(req.body.content || ''),
                category_id: categoryId,
                product_id: productId,
                tags: cleanStringArray(req.body.tags, 50, 80),
                reference_urls: cleanStringArray(req.body.reference_urls, 30, 1000),
                attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
                related_ids: Array.isArray(req.body.related_ids) ? req.body.related_ids.map(Number).filter(Boolean) : []
            };
            await client.query(
                `INSERT INTO kb_article_versions(
                    tenant_id, article_id, version, title, content, category_id, product_id,
                    tags, reference_urls, attachments, related_ids, changed_by, change_summary
                 )
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
                [
                    req.tenantId,
                    prev.id,
                    prev.version,
                    prev.title,
                    prev.content,
                    prev.category_id,
                    prev.product_id,
                    prev.tags || [],
                    prev.reference_urls || [],
                    JSON.stringify(prev.attachments || []),
                    prev.related_ids || [],
                    req.user.uid,
                    changeSummary(prev, nextSnapshot)
                ]
            );
            await client.query(
                `UPDATE kb_articles
                    SET title=$1, content=$2, category_id=$3, product_id=$4,
                        tags=$5, reference_urls=$6,
                        last_updated_by=$7, version=version + 1, updated_at=NOW()
                  WHERE id=$8 AND tenant_id=$9`,
                [
                    nextSnapshot.title,
                    nextSnapshot.content,
                    nextSnapshot.category_id,
                    nextSnapshot.product_id,
                    nextSnapshot.tags,
                    nextSnapshot.reference_urls,
                    req.user.uid,
                    req.params.id,
                    req.tenantId
                ]
            );
            await client.query('DELETE FROM kb_attachments WHERE article_id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
            await insertAttachments(req.params.id, req.tenantId, nextSnapshot.attachments, client);
            await client.query('DELETE FROM kb_article_related WHERE article_id=$1', [req.params.id]);
            await insertRelated(req.params.id, req.tenantId, nextSnapshot.related_ids, client);

            const limit = await versionLimit(req.tenantId, client);
            if (limit === 0) {
                await client.query('DELETE FROM kb_article_versions WHERE article_id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
            } else {
                await client.query(
                    `DELETE FROM kb_article_versions
                      WHERE id IN (
                        SELECT id FROM kb_article_versions
                         WHERE article_id=$1 AND tenant_id=$2
                         ORDER BY version DESC
                         OFFSET $3
                      )`,
                    [req.params.id, req.tenantId, limit]
                );
            }
            await client.query('COMMIT');
            const updated = await db.query(`${articleSelect} WHERE a.id=$1 AND a.tenant_id=$2`, [req.params.id, req.tenantId]);
            res.json(updated.rows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
);

router.delete('/articles/:id',
    requireRole('admin', 'superadmin'),
    param('id').isInt(),
    async (req, res) => {
        const { rowCount } = await db.query(
            'DELETE FROM kb_articles WHERE id=$1 AND tenant_id=$2',
            [req.params.id, req.tenantId]
        );
        if (!rowCount) return res.status(404).json({ error: 'Article not found' });
        res.json({ ok: true });
    }
);

module.exports = router;
