const express = require('express');
const { randomInt } = require('crypto');
const { body, param, validationResult } = require('express-validator');
const db = require('../db');
const { requireAuth, requireTenant } = require('../middleware/auth');
const {
    listProjectAttachments,
    saveProjectAttachmentStream,
    getProjectAttachment,
    deleteProjectAttachment,
    sendProjectAttachment
} = require('../utils/projectAttachments');

const router = express.Router();

// Every project route is tenant-scoped.
router.use(requireAuth, requireTenant);

// ---------- helpers ----------
function pickYear(req) {
    const y = Number(req.query.year);
    return Number.isInteger(y) && y > 1900 ? y : null;
}

async function loadProject(id, tenantId) {
    const { rows: pRows } = await db.query(
        `SELECT p.*, c.alias AS customer_alias, c.full_name AS customer_full_name
           FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
          WHERE p.id=$1 AND p.tenant_id=$2`, [id, tenantId]
    );
    const project = pRows[0];
    if (!project) return null;

    const [sub, perp, sv, impl, out] = await Promise.all([
        db.query('SELECT * FROM project_subscriptions  WHERE project_id=$1', [id]),
        db.query('SELECT * FROM project_perpetual_ma   WHERE project_id=$1 ORDER BY id', [id]),
        db.query('SELECT * FROM project_service_ma     WHERE project_id=$1 ORDER BY id', [id]),
        db.query('SELECT * FROM project_implementation WHERE project_id=$1', [id]),
        db.query('SELECT * FROM project_outsource      WHERE project_id=$1', [id])
    ]);

    let outsourceMonths = [];
    if (out.rows[0]) {
        const r = await db.query(
            'SELECT * FROM project_outsource_monthly WHERE project_outsource_id=$1 ORDER BY year, month',
            [out.rows[0].id]
        );
        outsourceMonths = r.rows;
    }

    return {
        ...project,
        subscription:    sub.rows[0]  || null,
        perpetual_ma:    perp.rows,
        service_ma:      sv.rows,
        implementation:  impl.rows[0] || null,
        outsource:       out.rows[0]  ? { ...out.rows[0], months: outsourceMonths } : null
    };
}

/** True if `projectId` exists inside `tenantId`. */
async function projectInTenant(projectId, tenantId) {
    const r = await db.query(
        'SELECT 1 FROM projects WHERE id=$1 AND tenant_id=$2', [projectId, tenantId]
    );
    return r.rowCount > 0;
}

async function projectCodeInTenant(projectId, tenantId) {
    const r = await db.query(
        'SELECT project_code FROM projects WHERE id=$1 AND tenant_id=$2',
        [projectId, tenantId]
    );
    return r.rows[0]?.project_code || null;
}

/** True if customerId is null/absent, or belongs to `tenantId`. */
async function customerInTenant(customerId, tenantId) {
    if (customerId == null) return true;
    const r = await db.query(
        'SELECT 1 FROM customers WHERE id=$1 AND tenant_id=$2', [customerId, tenantId]
    );
    return r.rowCount > 0;
}

// ---------- list ----------
router.get('/', async (req, res) => {
    const year = pickYear(req);
    const params = [req.tenantId];
    let yearFilter = '';
    if (year) {
        params.push(`${year}-01-01`, `${year}-12-31`);
        yearFilter = `
            AND (
                (p.project_start_date IS NULL AND p.project_end_date IS NULL)
                OR (
                    (p.project_start_date IS NOT NULL OR p.project_end_date IS NOT NULL)
                    AND COALESCE(p.project_start_date, p.project_end_date) <= $3::date
                    AND COALESCE(p.project_end_date, p.project_start_date) >= $2::date
                )
            )`;
    }

    const { rows } = await db.query(
        `SELECT p.*, c.alias AS customer_alias
           FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
          WHERE p.tenant_id=$1
          ${yearFilter}
          ORDER BY p.project_code`,
        params
    );
    res.json(rows);
});

router.get('/dummy-code', async (req, res) => {
    for (let i = 0; i < 100; i += 1) {
        const code = `DUM${String(randomInt(0, 1000000)).padStart(6, '0')}`;
        const existing = await db.query(
            'SELECT 1 FROM projects WHERE tenant_id=$1 AND project_code=$2 LIMIT 1',
            [req.tenantId, code]
        );
        if (!existing.rowCount) return res.json({ project_code: code });
    }
    res.status(409).json({ error: 'Could not generate a unique dummy project code' });
});

router.get('/:id', param('id').isInt(), async (req, res) => {
    const proj = await loadProject(req.params.id, req.tenantId);
    if (!proj) return res.status(404).json({ error: 'Not found' });
    res.json(proj);
});

// ---------- create / update master record ----------
const projValidators = [
    body('project_code').isString().trim().isLength({ min: 1, max: 64 }),
    body('description').optional().isString(),
    body('customer_id').optional({ nullable: true }).isInt(),
    body('project_start_date').optional({ nullable: true }).isISO8601(),
    body('project_end_date').optional({ nullable: true }).isISO8601(),
    body('status').optional().isIn(['Win','Loss','Pipeline','Backlog']),
    body('pipeline_target_date').optional({ nullable: true }).isISO8601(),
    body('note').optional().isString()
];

router.post('/', projValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const b = req.body;
    if (!await customerInTenant(b.customer_id || null, req.tenantId)) {
        return res.status(400).json({ error: 'Customer not found in your team' });
    }
    try {
        const { rows } = await db.query(
            `INSERT INTO projects(tenant_id, project_code, description, customer_id, project_start_date,
                                  project_end_date, status, pipeline_target_date, note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [req.tenantId, b.project_code, b.description || '', b.customer_id || null,
             b.project_start_date || null, b.project_end_date || null,
             b.status || 'Pipeline', b.pipeline_target_date || null, b.note || '']
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Project code already exists' });
        throw err;
    }
});

router.put('/:id', param('id').isInt(), projValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const b = req.body;
    if (!await customerInTenant(b.customer_id || null, req.tenantId)) {
        return res.status(400).json({ error: 'Customer not found in your team' });
    }
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `UPDATE projects SET project_code=$1, description=$2, customer_id=$3,
                                 project_start_date=$4, project_end_date=$5,
                                 status=$6, pipeline_target_date=$7, note=$8
              WHERE id=$9 AND tenant_id=$10 RETURNING *`,
            [b.project_code, b.description || '', b.customer_id || null,
             b.project_start_date || null, b.project_end_date || null,
             b.status || 'Pipeline', b.pipeline_target_date || null, b.note || '',
             req.params.id, req.tenantId]
        );
        if (!rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Not found' });
        }
        const projectCode = rows[0].project_code;
        await client.query('UPDATE project_subscriptions SET erp_code=$1 WHERE project_id=$2', [projectCode, req.params.id]);
        await client.query('UPDATE project_perpetual_ma SET erp_code=$1 WHERE project_id=$2', [projectCode, req.params.id]);
        await client.query('UPDATE project_service_ma SET erp_code=$1 WHERE project_id=$2', [projectCode, req.params.id]);
        await client.query('UPDATE project_implementation SET erp_code=$1 WHERE project_id=$2', [projectCode, req.params.id]);
        await client.query('UPDATE project_outsource SET erp_code=$1 WHERE project_id=$2', [projectCode, req.params.id]);
        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') return res.status(409).json({ error: 'Project code already exists' });
        throw err;
    } finally {
        client.release();
    }
});

router.delete('/:id', param('id').isInt(), async (req, res) => {
    const { rowCount } = await db.query(
        'DELETE FROM projects WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

router.get('/:id/attachments', param('id').isInt(), async (req, res) => {
    if (!await projectInTenant(req.params.id, req.tenantId)) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.json(await listProjectAttachments(db, req.params.id, req.tenantId));
});

router.post('/:id/attachments',
    param('id').isInt(),
    async (req, res) => {
        const errs = validationResult(req);
        if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
        const saved = await saveProjectAttachmentStream(db, {
            tenantId: req.tenantId,
            projectId: req.params.id,
            userId: req.user?.uid,
            documentTypeId: Number(req.query.document_type_id || req.headers['x-document-type-id'] || 0) || null,
            originalName: req.query.filename || req.headers['x-file-name'],
            mimeType: req.headers['x-file-type'] || req.headers['content-type'],
            stream: req
        });
        if (!saved) return res.status(404).json({ error: 'Not found' });
        res.status(201).json(saved);
    }
);

router.get('/attachments/:attachmentId/download', param('attachmentId').isInt(), async (req, res) => {
    const row = await getProjectAttachment(db, req.params.attachmentId, req.tenantId);
    if (!row) return res.status(404).json({ error: 'Attachment not found' });
    sendProjectAttachment(res, row, false);
});

router.get('/attachments/:attachmentId/preview', param('attachmentId').isInt(), async (req, res) => {
    const row = await getProjectAttachment(db, req.params.attachmentId, req.tenantId);
    if (!row) return res.status(404).json({ error: 'Attachment not found' });
    sendProjectAttachment(res, row, true);
});

router.delete('/attachments/:attachmentId', param('attachmentId').isInt(), async (req, res) => {
    const ok = await deleteProjectAttachment(db, req.params.attachmentId, req.tenantId);
    if (!ok) return res.status(404).json({ error: 'Attachment not found' });
    res.json({ ok: true });
});

// ---------- Subscription tab ----------
router.put('/:id/subscription', param('id').isInt(), async (req, res) => {
    const b = req.body || {};
    const pid = req.params.id;
    const projectCode = await projectCodeInTenant(pid, req.tenantId);
    if (!projectCode) return res.status(404).json({ error: 'Not found' });

    const { rows: existing } = await db.query('SELECT id FROM project_subscriptions WHERE project_id=$1', [pid]);
    if (existing[0]) {
        const { rows } = await db.query(
            `UPDATE project_subscriptions SET license_name=$1, license_start_date=$2,
                license_end_date=$3, license_revenue=$4, license_cost=$5, erp_code=$6
              WHERE project_id=$7 RETURNING *`,
            [b.license_name || '', b.license_start_date || null, b.license_end_date || null,
             b.license_revenue || 0, b.license_cost || 0, projectCode, pid]
        );
        return res.json(rows[0]);
    }
    const { rows } = await db.query(
        `INSERT INTO project_subscriptions(project_id, license_name, license_start_date,
            license_end_date, license_revenue, license_cost, erp_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [pid, b.license_name || '', b.license_start_date || null, b.license_end_date || null,
         b.license_revenue || 0, b.license_cost || 0, projectCode]
    );
    res.status(201).json(rows[0]);
});
router.delete('/:id/subscription', param('id').isInt(), async (req, res) => {
    if (!await projectInTenant(req.params.id, req.tenantId)) return res.status(404).json({ error: 'Not found' });
    await db.query('DELETE FROM project_subscriptions WHERE project_id=$1', [req.params.id]);
    res.json({ ok: true });
});

// ---------- Perpetual / SW MA tab (multi rows) ----------
router.post('/:id/perpetual-ma', param('id').isInt(), async (req, res) => {
    const b = req.body || {};
    const projectCode = await projectCodeInTenant(req.params.id, req.tenantId);
    if (!projectCode) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query(
        `INSERT INTO project_perpetual_ma(project_id, item_name, item_type, start_date,
                                          end_date, revenue, cost, erp_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.params.id, b.item_name || '', b.item_type || 'License',
         b.start_date || null, b.end_date || null,
         b.revenue || 0, b.cost || 0, projectCode]
    );
    res.status(201).json(rows[0]);
});
router.put('/perpetual-ma/:rowId', param('rowId').isInt(), async (req, res) => {
    const b = req.body || {};
    const { rows } = await db.query(
        `UPDATE project_perpetual_ma
            SET item_name=$1, item_type=$2, start_date=$3, end_date=$4,
                revenue=$5, cost=$6,
                erp_code=(SELECT project_code FROM projects WHERE id=project_perpetual_ma.project_id)
          WHERE id=$7
            AND project_id IN (SELECT id FROM projects WHERE tenant_id=$8)
          RETURNING *`,
        [b.item_name || '', b.item_type || 'License',
         b.start_date || null, b.end_date || null,
         b.revenue || 0, b.cost || 0, req.params.rowId, req.tenantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});
router.delete('/perpetual-ma/:rowId', param('rowId').isInt(), async (req, res) => {
    const { rowCount } = await db.query(
        `DELETE FROM project_perpetual_ma
          WHERE id=$1 AND project_id IN (SELECT id FROM projects WHERE tenant_id=$2)`,
        [req.params.rowId, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

// ---------- Service MA tab (multi rows) ----------
router.post('/:id/service-ma', param('id').isInt(), async (req, res) => {
    const b = req.body || {};
    const projectCode = await projectCodeInTenant(req.params.id, req.tenantId);
    if (!projectCode) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query(
        `INSERT INTO project_service_ma(project_id, description, start_date, end_date,
                                        revenue, cost, erp_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.params.id, b.description || '', b.start_date || null, b.end_date || null,
         b.revenue || 0, b.cost || 0, projectCode]
    );
    res.status(201).json(rows[0]);
});
router.put('/service-ma/:rowId', param('rowId').isInt(), async (req, res) => {
    const b = req.body || {};
    const { rows } = await db.query(
        `UPDATE project_service_ma SET description=$1, start_date=$2, end_date=$3,
                                       revenue=$4, cost=$5,
                                       erp_code=(SELECT project_code FROM projects WHERE id=project_service_ma.project_id)
          WHERE id=$6
            AND project_id IN (SELECT id FROM projects WHERE tenant_id=$7)
          RETURNING *`,
        [b.description || '', b.start_date || null, b.end_date || null,
         b.revenue || 0, b.cost || 0, req.params.rowId, req.tenantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});
router.delete('/service-ma/:rowId', param('rowId').isInt(), async (req, res) => {
    const { rowCount } = await db.query(
        `DELETE FROM project_service_ma
          WHERE id=$1 AND project_id IN (SELECT id FROM projects WHERE tenant_id=$2)`,
        [req.params.rowId, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

// ---------- Implementation tab ----------
router.put('/:id/implementation', param('id').isInt(), async (req, res) => {
    const b = req.body || {};
    const pid = req.params.id;
    const projectCode = await projectCodeInTenant(pid, req.tenantId);
    if (!projectCode) return res.status(404).json({ error: 'Not found' });

    const { rows: existing } = await db.query('SELECT id FROM project_implementation WHERE project_id=$1', [pid]);
    if (existing[0]) {
        const { rows } = await db.query(
            `UPDATE project_implementation
                SET description=$1, progress_last_year_pct=$2, progress_this_year_pct=$3,
                    revenue=$4, cost=$5, erp_code=$6
              WHERE project_id=$7 RETURNING *`,
            [b.description || '', b.progress_last_year_pct || 0, b.progress_this_year_pct || 0,
             b.revenue || 0, b.cost || 0, projectCode, pid]
        );
        return res.json(rows[0]);
    }
    const { rows } = await db.query(
        `INSERT INTO project_implementation(project_id, description, progress_last_year_pct,
            progress_this_year_pct, revenue, cost, erp_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [pid, b.description || '', b.progress_last_year_pct || 0, b.progress_this_year_pct || 0,
         b.revenue || 0, b.cost || 0, projectCode]
    );
    res.status(201).json(rows[0]);
});
router.delete('/:id/implementation', param('id').isInt(), async (req, res) => {
    if (!await projectInTenant(req.params.id, req.tenantId)) return res.status(404).json({ error: 'Not found' });
    await db.query('DELETE FROM project_implementation WHERE project_id=$1', [req.params.id]);
    res.json({ ok: true });
});

// ---------- Outsource tab ----------
router.put('/:id/outsource', param('id').isInt(), async (req, res) => {
    const pid = req.params.id;
    const b = req.body || {};
    if (!['Man-Month','Man-Year'].includes(b.outsource_type)) {
        return res.status(400).json({ error: 'outsource_type must be Man-Month or Man-Year' });
    }
    const projectCode = await projectCodeInTenant(pid, req.tenantId);
    if (!projectCode) return res.status(404).json({ error: 'Not found' });

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const { rows: existing } = await client.query('SELECT id FROM project_outsource WHERE project_id=$1', [pid]);
        let outsourceId;
        if (existing[0]) {
            outsourceId = existing[0].id;
            await client.query(
                `UPDATE project_outsource
                    SET outsource_type=$1, description=$2, start_date=$3, end_date=$4,
                        revenue=$5, cost=$6, erp_code=$7
                  WHERE id=$8`,
                [b.outsource_type, b.description || '', b.start_date || null, b.end_date || null,
                 b.outsource_type === 'Man-Year' ? (b.revenue || 0) : 0,
                 b.outsource_type === 'Man-Year' ? (b.cost    || 0) : 0,
                 projectCode, outsourceId]
            );
        } else {
            const { rows: ins } = await client.query(
                `INSERT INTO project_outsource(project_id, outsource_type, description,
                    start_date, end_date, revenue, cost, erp_code)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
                [pid, b.outsource_type, b.description || '', b.start_date || null, b.end_date || null,
                 b.outsource_type === 'Man-Year' ? (b.revenue || 0) : 0,
                 b.outsource_type === 'Man-Year' ? (b.cost    || 0) : 0,
                 projectCode]
            );
            outsourceId = ins[0].id;
        }

        await client.query('DELETE FROM project_outsource_monthly WHERE project_outsource_id=$1', [outsourceId]);
        if (b.outsource_type === 'Man-Month' && Array.isArray(b.months)) {
            for (const m of b.months) {
                if (!m || !m.year || !m.month) continue;
                await client.query(
                    `INSERT INTO project_outsource_monthly(project_outsource_id, year, month, revenue, cost)
                     VALUES ($1,$2,$3,$4,$5)
                     ON CONFLICT (project_outsource_id, year, month) DO UPDATE
                       SET revenue=EXCLUDED.revenue, cost=EXCLUDED.cost`,
                    [outsourceId, Number(m.year), Number(m.month), m.revenue || 0, m.cost || 0]
                );
            }
        }
        await client.query('COMMIT');

        const proj = await loadProject(pid, req.tenantId);
        res.json(proj.outsource);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
});

router.delete('/:id/outsource', param('id').isInt(), async (req, res) => {
    if (!await projectInTenant(req.params.id, req.tenantId)) return res.status(404).json({ error: 'Not found' });
    await db.query('DELETE FROM project_outsource WHERE project_id=$1', [req.params.id]);
    res.json({ ok: true });
});

module.exports = { router, loadProject };
