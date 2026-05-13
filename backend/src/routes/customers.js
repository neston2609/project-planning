const express = require('express');
const { body, validationResult, param } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (_req, res) => {
    const { rows } = await db.query('SELECT * FROM customers ORDER BY alias');
    res.json(rows);
});

router.get('/:id', requireAuth, param('id').isInt(), async (req, res) => {
    const { rows } = await db.query('SELECT * FROM customers WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

const customerValidators = [
    body('alias').isString().trim().isLength({ min: 1, max: 64 }),
    body('full_name').optional().isString(),
    body('contact_name').optional().isString(),
    body('contact_email').optional().isString(),
    body('contact_phone').optional().isString(),
    body('account_manager').optional().isString(),
    body('color_hex').optional().matches(/^#[0-9a-fA-F]{6}$/),
    // Logo: data URL up to ~10MB (about 7.5MB raw image after base64 expansion).
    body('logo_data').optional({ nullable: true }).custom((v) => {
        if (v === null || v === '') return true;
        if (typeof v !== 'string') throw new Error('logo_data must be a string or null');
        if (!v.startsWith('data:image/')) throw new Error('logo_data must be a data:image/* URL');
        if (v.length > 10 * 1024 * 1024) throw new Error('logo_data exceeds 10MB');
        return true;
    })
];

router.post('/', requireAuth, customerValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    try {
        const { rows } = await db.query(
            `INSERT INTO customers(alias, full_name, contact_name, contact_email, contact_phone, account_manager, color_hex, logo_data)
             VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'#3b82f6'),$8) RETURNING *`,
            [req.body.alias, req.body.full_name || '', req.body.contact_name || '',
             req.body.contact_email || '', req.body.contact_phone || '',
             req.body.account_manager || '',
             req.body.color_hex || null, req.body.logo_data || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Alias already exists' });
        throw err;
    }
});

router.put('/:id', requireAuth, param('id').isInt(), customerValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    // logo_data semantics:
    //   undefined  → keep existing
    //   null or '' → clear
    //   'data:...' → replace
    const newLogo = (req.body.logo_data === undefined) ? '__KEEP__'
                  : (req.body.logo_data || null);
    const { rows } = await db.query(
        `UPDATE customers SET alias=$1, full_name=$2, contact_name=$3, contact_email=$4,
                              contact_phone=$5, account_manager=$6,
                              color_hex=COALESCE($7, color_hex),
                              logo_data = CASE WHEN $8::text = '__KEEP__' THEN logo_data ELSE NULLIF($9::text, '__NULL__') END
         WHERE id=$10 RETURNING *`,
        [req.body.alias, req.body.full_name || '', req.body.contact_name || '',
         req.body.contact_email || '', req.body.contact_phone || '',
         req.body.account_manager || '',
         req.body.color_hex || null,
         newLogo === '__KEEP__' ? '__KEEP__' : 'replace',
         newLogo === '__KEEP__' ? null : (newLogo === null ? '__NULL__' : newLogo),
         req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
});

router.delete('/:id', requireAuth, param('id').isInt(), async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM customers WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
});

module.exports = router;
