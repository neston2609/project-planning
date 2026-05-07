const express = require('express');
const { body, validationResult, param } = require('express-validator');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (_req, res) => {
    const { rows } = await db.query('SELECT * FROM customers ORDER BY alias');
    res.json(rows);
});

router.get('/:id', param('id').isInt(), async (req, res) => {
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
    body('color_hex').optional().matches(/^#[0-9a-fA-F]{6}$/)
];

router.post('/', requireAuth, customerValidators, async (req, res) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    try {
        const { rows } = await db.query(
            `INSERT INTO customers(alias, full_name, contact_name, contact_email, contact_phone, color_hex)
             VALUES ($1,$2,$3,$4,$5,COALESCE($6,'#3b82f6')) RETURNING *`,
            [req.body.alias, req.body.full_name || '', req.body.contact_name || '',
             req.body.contact_email || '', req.body.contact_phone || '', req.body.color_hex || null]
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
    const { rows } = await db.query(
        `UPDATE customers SET alias=$1, full_name=$2, contact_name=$3, contact_email=$4,
                              contact_phone=$5, color_hex=COALESCE($6, color_hex)
         WHERE id=$7 RETURNING *`,
        [req.body.alias, req.body.full_name || '', req.body.contact_name || '',
         req.body.contact_email || '', req.body.contact_phone || '',
         req.body.color_hex || null, req.params.id]
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
