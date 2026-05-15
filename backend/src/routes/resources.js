const express = require('express');
const { body, validationResult, param } = require('express-validator');
const db = require('../db');
const { requireAuth, requireTenant } = require('../middleware/auth');

const router = express.Router();

// All resource routes are tenant-scoped.
router.use(requireAuth, requireTenant);

router.get('/', async (req, res) => {
    const { rows } = await db.query(
        'SELECT * FROM resources WHERE tenant_id=$1 ORDER BY first_name, last_name',
        [req.tenantId]
    );
    res.json(rows);
});

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
router.get('/:id', param('id').isInt(), async (req, res) => {
    const { rows } = await db.query(
        'SELECT * FROM resources WHERE id=$1 AND tenant_id=$2',
        [req.params.id, req.tenantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

const resourceValidators = [
    body('first_name').optional().isString(),
    body('last_name').optional().isString(),
    body('nick_name').optional().isString(),
    body('emp_id').optional().isString(),
    body('role').optional().isString(),
    body('email').optional().isString(),
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
            `INSERT INTO resources(tenant_id, emp_id, first_name, last_name, nick_name, role, email, erp_username, skill, picture_data)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [req.tenantId, b.emp_id || null, b.first_name || '', b.last_name || '', b.nick_name || '',
             b.role || '', b.email || '', b.erp_username || '', b.skill || '',
             b.picture_data || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Emp ID already exists' });
        throw err;
    }
});

router.put('/:id', param('id').isInt(), resourceValidators, async (req, res) => {
    const b = req.body;
    // picture_data semantics: undefined -> keep, null/empty -> clear, string -> replace.
    const newPic = (b.picture_data === undefined) ? '__KEEP__' : (b.picture_data || null);
    try {
        const { rows } = await db.query(
            `UPDATE resources SET emp_id=$1, first_name=$2, last_name=$3, nick_name=$4,
                                  role=$5, email=$6, erp_username=$7, skill=$8,
                                  picture_data = CASE WHEN $9::text = '__KEEP__' THEN picture_data
                                                      ELSE NULLIF($10::text, '__NULL__') END
             WHERE id=$11 AND tenant_id=$12 RETURNING *`,
            [b.emp_id || null, b.first_name || '', b.last_name || '', b.nick_name || '',
             b.role || '', b.email || '', b.erp_username || '', b.skill || '',
             newPic === '__KEEP__' ? '__KEEP__' : 'replace',
             newPic === '__KEEP__' ? null : (newPic === null ? '__NULL__' : newPic),
             req.params.id, req.tenantId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
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
