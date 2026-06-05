const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const ROOT = path.resolve(__dirname, '..', '..', 'uploads', 'project_attachments');

function cleanFileName(value) {
    return String(value || 'attachment')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 255) || 'attachment';
}

function attachmentPath(row) {
    return path.join(ROOT, String(row.tenant_id), String(row.project_id), row.stored_name);
}

async function ensureProjectInTenant(db, projectId, tenantId) {
    const { rows } = await db.query(
        'SELECT id FROM projects WHERE id=$1 AND tenant_id=$2',
        [projectId, tenantId]
    );
    return rows[0] || null;
}

async function listProjectAttachments(db, projectId, tenantId) {
    const { rows } = await db.query(
        `SELECT a.id, a.project_id, a.document_type_id,
                COALESCE(t.name, 'General') AS document_type_name,
                a.original_name, a.mime_type, a.file_size, a.created_at
           FROM project_attachments a
           LEFT JOIN project_attachment_types t
             ON t.id = a.document_type_id AND t.tenant_id = a.tenant_id
          WHERE a.project_id=$1 AND a.tenant_id=$2
          ORDER BY a.created_at DESC, a.id DESC`,
        [projectId, tenantId]
    );
    return rows;
}

async function attachmentTypeInTenant(db, typeId, tenantId) {
    if (!typeId) {
        const { rows } = await db.query(
            `INSERT INTO project_attachment_types(tenant_id, name, is_system)
             VALUES ($1,'General',TRUE)
             ON CONFLICT (tenant_id, name) DO UPDATE SET name=EXCLUDED.name
             RETURNING id`,
            [tenantId]
        );
        return rows[0]?.id || null;
    }
    const { rows } = await db.query(
        'SELECT id FROM project_attachment_types WHERE id=$1 AND tenant_id=$2',
        [typeId, tenantId]
    );
    return rows[0]?.id || null;
}

async function saveProjectAttachmentStream(db, { tenantId, projectId, userId, documentTypeId, originalName, mimeType, stream }) {
    const project = await ensureProjectInTenant(db, projectId, tenantId);
    if (!project) return null;
    const typeId = await attachmentTypeInTenant(db, documentTypeId, tenantId);
    const fileName = cleanFileName(originalName);
    const storedName = `${randomUUID()}${path.extname(fileName) || ''}`;
    const dir = path.join(ROOT, String(tenantId), String(projectId));
    await fsp.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, storedName);
    let size = 0;
    const counter = new Transform({
        transform(chunk, _encoding, callback) {
            size += chunk.length;
            callback(null, chunk);
        }
    });
    try {
        await pipeline(stream, counter, fs.createWriteStream(filePath));
        const { rows } = await db.query(
            `INSERT INTO project_attachments(
                tenant_id, project_id, document_type_id, original_name, stored_name, mime_type, file_size, uploaded_by
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING id, project_id, document_type_id, original_name, mime_type, file_size, created_at`,
            [
                tenantId,
                projectId,
                typeId,
                fileName,
                storedName,
                String(mimeType || 'application/octet-stream').slice(0, 255),
                size,
                userId || null
            ]
        );
        return rows[0];
    } catch (err) {
        try { await fsp.unlink(filePath); } catch {}
        throw err;
    }
}

async function getProjectAttachment(db, attachmentId, tenantId) {
    const { rows } = await db.query(
        `SELECT *
           FROM project_attachments
          WHERE id=$1 AND tenant_id=$2`,
        [attachmentId, tenantId]
    );
    return rows[0] || null;
}

async function deleteProjectAttachment(db, attachmentId, tenantId) {
    const row = await getProjectAttachment(db, attachmentId, tenantId);
    if (!row) return false;
    await db.query('DELETE FROM project_attachments WHERE id=$1 AND tenant_id=$2', [attachmentId, tenantId]);
    try {
        await fsp.unlink(attachmentPath(row));
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('[project attachment delete]', err.message);
    }
    return true;
}

function contentDispositionName(name) {
    return encodeURIComponent(name);
}

function sendProjectAttachment(res, row, inline = false) {
    const filePath = attachmentPath(row);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', String(row.file_size || 0));
    res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${contentDispositionName(row.original_name)}`
    );
    fs.createReadStream(filePath).pipe(res);
}

module.exports = {
    ensureProjectInTenant,
    listProjectAttachments,
    saveProjectAttachmentStream,
    getProjectAttachment,
    deleteProjectAttachment,
    sendProjectAttachment
};
