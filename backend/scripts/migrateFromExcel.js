#!/usr/bin/env node
/**
 * RPA SV Summary 2026 → PostgreSQL migration.
 *
 * USAGE:
 *   node scripts/migrateFromExcel.js [path-to-xlsx] [--out=migration.sql]
 *
 * The script does NOT touch the database. It reads the Excel file and emits:
 *   1) ./sql/migration.sql            — INSERT statements to load into Postgres
 *   2) ./sql/migration_report.md      — what was matched cleanly vs. needs review
 *
 * Then run:
 *   psql -h <host> -U postgres -d rpa_planning -f sql/schema.sql
 *   psql -h <host> -U postgres -d rpa_planning -f sql/migration.sql
 */

const path = require('path');
const fs   = require('fs');
const XLSX = require('xlsx');

const argv = process.argv.slice(2);
const xlsxPath = argv.find(a => !a.startsWith('-')) || path.resolve(__dirname, '..', '..', '..', 'uploads', 'RPA SV Summary - 2026.xlsx');
const outArg = argv.find(a => a.startsWith('--out='));
const outSql = outArg ? outArg.slice(6) : path.resolve(__dirname, '..', 'sql', 'migration.sql');
const outRpt = path.resolve(__dirname, '..', 'sql', 'migration_report.md');
const planningYear = Number((argv.find(a => a.startsWith('--year=')) || '--year=2026').slice(7));

if (!fs.existsSync(xlsxPath)) {
    console.error('Excel file not found:', xlsxPath);
    process.exit(1);
}
console.log('[migrate] reading', xlsxPath);

const wb = XLSX.readFile(xlsxPath, { cellDates: true });

const report = [];
const sql = [];

// ---------- helpers ----------
const SQ = (s) => s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
const num = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const dateLit = (v) => {
    if (!v) return 'NULL';
    if (v instanceof Date && !isNaN(v)) return SQ(v.toISOString().slice(0, 10));
    if (typeof v === 'string') {
        const d = new Date(v);
        if (!isNaN(d)) return SQ(d.toISOString().slice(0, 10));
    }
    return 'NULL';
};
const pickStatus = (v) => {
    const s = String(v || '').toLowerCase();
    if (s.includes('pipe')) return 'Pipeline';
    if (s.includes('loss')) return 'Loss';
    if (s.includes('back')) return 'Backlog';
    return 'Win';
};

function colorFromAlias(alias) {
    // Stable hex color from string hash
    let h = 0;
    for (let i = 0; i < alias.length; i++) h = (h * 31 + alias.charCodeAt(i)) | 0;
    const palette = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
    return palette[Math.abs(h) % palette.length];
}

function sheetRows(sheetName, headerRow = 1) {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: headerRow });
}

// ---------- Customer registry ----------
const customers = new Map();   // alias → {alias, full_name}
function ensureCustomer(alias, fullName = '') {
    if (!alias) return null;
    const k = String(alias).trim();
    if (!k) return null;
    if (!customers.has(k)) customers.set(k, { alias: k, full_name: fullName || k });
    else if (fullName && !customers.get(k).full_name) customers.get(k).full_name = fullName;
    return k;
}

// ---------- Project registry ----------
// Multiple sheets reference the same project, but sometimes via ERP code,
// sometimes via free text. We index by either project_code (preferred) or
// by a synthetic "alias|description" key.
const projects = new Map(); // project_code → record
function ensureProject({ project_code, customer_alias, description, status, project_start, project_end, pipeline_target }) {
    if (!project_code) {
        // Synthesize a deterministic code so we don't duplicate the same row.
        const sanitized = (description || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'PROJ';
        project_code = `SYN-${(customer_alias || 'X').slice(0, 8)}-${sanitized}`;
        report.push(`- ⚠️  Synthetic project code created: \`${project_code}\` (source row had no ERP code; description: "${description}")`);
    }
    if (!projects.has(project_code)) {
        projects.set(project_code, {
            project_code,
            description: description || '',
            customer_alias: customer_alias || null,
            status: status || 'Pipeline',
            project_start_date: project_start || null,
            project_end_date:   project_end   || null,
            pipeline_target_date: pipeline_target || null
        });
    } else {
        const p = projects.get(project_code);
        if (description && !p.description) p.description = description;
        if (customer_alias && !p.customer_alias) p.customer_alias = customer_alias;
        if (status && !p.status) p.status = status;
        if (project_start && !p.project_start_date) p.project_start_date = project_start;
        if (project_end   && !p.project_end_date)   p.project_end_date = project_end;
        if (pipeline_target && !p.pipeline_target_date) p.pipeline_target_date = pipeline_target;
    }
    return project_code;
}

// ---------- Implementation sheet ----------
function processImplementation() {
    // headers occupy rows 1 & 2; data starts row 3.
    const ws = wb.Sheets['Implementation'];
    if (!ws) return;
    const arr = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const implRows = [];
    let mapped = 0, syn = 0;
    for (let i = 2; i < arr.length; i++) {
        const r = arr[i];
        const customer = r[0]; const projectName = r[1]; const erp = r[2]; const status = pickStatus(r[4]);
        const pipelineTarget = r[5];
        const last  = num(r[6]);
        const cur   = num(r[7]);
        const rev   = num(r[10]);
        const cost  = num(r[11]);
        if (!customer && !projectName && !erp) continue;
        if (!projectName) continue;

        const alias = ensureCustomer(customer);
        const code = ensureProject({
            project_code: erp ? String(erp) : null,
            customer_alias: alias, description: projectName, status,
            pipeline_target: pipelineTarget
        });
        if (!erp) syn++; else mapped++;
        implRows.push({
            project_code: code, description: projectName,
            progress_last_year_pct: last, progress_this_year_pct: cur,
            revenue: rev, cost, erp_code: erp || ''
        });
    }
    report.push(`### Implementation\n- Rows: ${implRows.length}, ERP-matched: ${mapped}, synthetic codes: ${syn}`);
    return implRows;
}

// ---------- Subscription MA sheet ----------
// Row layout (after headers):
// 0=Customer, 1=Description,
// 2..11 = 2025 block: ERP, LicRev, LicCost, SVRev, SVCost, Start, End, %Recogn, SWRecogn, SVRecogn
// 12..22 = 2026 block: ERP, (placeholder), LicRev, LicCost, SVRev, SVCost, Start, End, %Recogn, SWRecogn, SVRecogn
// We use the 2026 block (cols 12..22) since planningYear defaults to 2026.
function processSubscriptionMA() {
    const ws = wb.Sheets['Subscription MA'];
    if (!ws) return { subs: [], svc: [] };
    const arr = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const subs = [], svc = [];
    let mapped = 0, syn = 0;
    for (let i = 2; i < arr.length; i++) {
        const r = arr[i];
        const customer = r[0]; const desc = r[1];
        if (!customer && !desc) continue;
        const erp2026 = r[12];
        const licRev  = num(r[14]); const licCost = num(r[15]);
        const svcRev  = num(r[16]); const svcCost = num(r[17]);
        const start   = r[18]; const end = r[19];
        const alias = ensureCustomer(customer);

        const code = ensureProject({
            project_code: erp2026 ? String(erp2026) : (r[2] ? String(r[2]) : null),
            customer_alias: alias, description: desc || `${alias || 'X'} Subscription`,
            project_start: start, project_end: end, status: 'Win'
        });
        if (erp2026 || r[2]) mapped++; else syn++;

        if (licRev || licCost) {
            subs.push({
                project_code: code, license_name: desc || '',
                license_start_date: start, license_end_date: end,
                license_revenue: licRev, license_cost: licCost,
                erp_code: String(erp2026 || r[2] || '')
            });
        }
        if (svcRev || svcCost) {
            svc.push({
                project_code: code, description: `Service MA — ${desc || ''}`.trim(),
                start_date: start, end_date: end,
                revenue: svcRev, cost: svcCost,
                erp_code: String(erp2026 || r[2] || '')
            });
        }
    }
    report.push(`### Subscription MA\n- Subscription rows: ${subs.length}, Service-MA spillover rows: ${svc.length}, ERP-matched: ${mapped}, synthetic: ${syn}`);
    return { subs, svc };
}

// ---------- Perpetual License sheet ----------
function processPerpetual() {
    const ws = wb.Sheets['Percepture License'];
    if (!ws) return { perp: [], sv: [] };
    const arr = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const perp = [], sv = [];
    let mapped = 0, syn = 0;
    for (let i = 2; i < arr.length; i++) {
        const r = arr[i];
        const customer = r[0]; const projectName = r[1]; const erp = r[2];
        const projectType = r[3]; const status = pickStatus(r[4]);
        const start = r[5]; const end = r[6];
        // License columns 8..11 (rev, cost, …)
        const licRev = num(r[8]);  const licCost = num(r[9]);
        // SW MA columns 13..16
        const maRev  = num(r[13]); const maCost  = num(r[14]);
        // SV MA columns 18..21 — we route this to project_service_ma
        const svRev  = num(r[18]); const svCost  = num(r[19]);
        if (!customer && !projectName) continue;

        const alias = ensureCustomer(customer);
        const code = ensureProject({
            project_code: erp ? String(erp) : null,
            customer_alias: alias, description: projectName, status,
            project_start: start, project_end: end
        });
        if (erp) mapped++; else syn++;

        if (licRev || licCost) {
            perp.push({
                project_code: code, item_name: projectName, item_type: 'License',
                start_date: start, end_date: end,
                revenue: licRev, cost: licCost,
                erp_code: String(erp || '')
            });
        }
        if (maRev || maCost) {
            perp.push({
                project_code: code, item_name: `${projectName} (SW MA)`, item_type: 'MA',
                start_date: start, end_date: end,
                revenue: maRev, cost: maCost,
                erp_code: String(erp || '')
            });
        }
        if (svRev || svCost) {
            sv.push({
                project_code: code, description: `Service MA — ${projectName}`,
                start_date: start, end_date: end,
                revenue: svRev, cost: svCost,
                erp_code: String(erp || '')
            });
        }
    }
    report.push(`### Perpetual / SW MA\n- License/MA rows: ${perp.length}, Service-MA spillover rows: ${sv.length}, ERP-matched: ${mapped}, synthetic: ${syn}`);
    return { perp, sv };
}

// ---------- Outsource sheet ----------
// 3 column groups, each with header (ERP Code [name (code)], Month, Working Day, Revenue).
function processOutsource() {
    const ws = wb.Sheets['Outsource'];
    if (!ws) return [];
    const arr = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const groupOffsets = [0, 5, 10]; // (ERP, Month, Manday/WorkingDay, Revenue)
    const outs = [];
    let mapped = 0, syn = 0;

    for (const off of groupOffsets) {
        // Find the project header in row 1 (index 1 in arr after the 1-row header).
        // Look for first non-null ERP cell.
        let projLabel = null;
        for (let i = 1; i < arr.length; i++) {
            const v = arr[i] && arr[i][off];
            if (v) { projLabel = String(v); break; }
        }
        if (!projLabel) continue;

        // Extract ERP code from the label "(BFS260082)" if present.
        const m = projLabel.match(/\(([^)]+)\)\s*$/);
        const erp = m ? m[1] : null;
        const desc = m ? projLabel.replace(/\s*\([^)]*\)\s*$/, '').trim() : projLabel;

        const code = ensureProject({
            project_code: erp,
            customer_alias: null,
            description: desc,
            status: 'Win'
        });
        if (erp) mapped++; else syn++;

        // Collect monthly rows: month is in col off+1, manday off+2, revenue off+3.
        const months = [];
        for (let i = 1; i < arr.length; i++) {
            const r = arr[i]; if (!r) continue;
            const moRaw = r[off + 1];
            const moNum = Number(moRaw);
            // Strict guard: must be a real integer 1..12. Anything else (including
            // strings like "Total" or NaN) is skipped.
            if (!Number.isInteger(moNum) || moNum < 1 || moNum > 12) continue;
            const rev = num(r[off + 3]);
            months.push({ year: planningYear, month: moNum, revenue: rev, cost: 0 });
        }
        outs.push({
            project_code: code, outsource_type: 'Man-Month',
            description: desc, erp_code: erp || '',
            months
        });
    }
    report.push(`### Outsource\n- Project groups: ${outs.length}, ERP-matched: ${mapped}, synthetic: ${syn} — note: Excel doesn't break out cost, so cost is set to 0 and must be entered manually.`);
    return outs;
}

// ---------- Resource Planning sheet ----------
function processResources() {
    const ws = wb.Sheets['Resource Planing'];
    if (!ws) return [];
    const arr = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const out = [];
    for (let i = 1; i < arr.length; i++) {
        const r = arr[i]; if (!r) continue;
        const idx = r[0]; const fullName = r[1]; const nick = r[2];
        const role = r[3]; const site = r[4];
        if (!fullName) continue;
        // Split "Mr.Jiradej  Wanachakit" → first/last
        const cleaned = String(fullName).replace(/^(Mr\.|Mrs\.|Ms\.|Miss\.)\s*/i, '');
        const parts = cleaned.split(/\s+/).filter(Boolean);
        const first = parts.shift() || '';
        const last  = parts.join(' ');
        out.push({
            emp_id: null,
            first_name: first,
            last_name:  last,
            nick_name:  nick || '',
            role:       role || '',
            email: '', erp_username: '',
            skill: site ? `Response site: ${site}` : ''
        });
    }
    report.push(`### Resources\n- Imported ${out.length} resources from "Resource Planing" sheet.`);
    return out;
}

// ---------- Run all ----------
const impl   = processImplementation();
const subRes = processSubscriptionMA();
const perRes = processPerpetual();
const outsource = processOutsource();
const resources = processResources();

// ---------- Emit SQL ----------
sql.push(`-- Auto-generated migration from "${path.basename(xlsxPath)}"`);
sql.push(`-- Generated: ${new Date().toISOString()}`);
sql.push(`-- Planning year: ${planningYear}`);
sql.push('BEGIN;');

// 1) Customers
sql.push('\n-- Customers');
for (const c of customers.values()) {
    sql.push(`INSERT INTO customers(alias, full_name, color_hex) VALUES (${SQ(c.alias)}, ${SQ(c.full_name)}, ${SQ(colorFromAlias(c.alias))}) ON CONFLICT (alias) DO NOTHING;`);
}

// 2) Projects (link to customer via alias subselect)
sql.push('\n-- Projects');
for (const p of projects.values()) {
    sql.push(
        `INSERT INTO projects(project_code, description, customer_id, project_start_date, project_end_date, status, pipeline_target_date)
 VALUES (${SQ(p.project_code)}, ${SQ(p.description)},
         (SELECT id FROM customers WHERE alias=${SQ(p.customer_alias)}),
         ${dateLit(p.project_start_date)}, ${dateLit(p.project_end_date)},
         ${SQ(p.status)}, ${dateLit(p.pipeline_target_date)})
 ON CONFLICT (project_code) DO NOTHING;`
    );
}

// 3) Subscriptions
sql.push('\n-- Subscriptions');
for (const s of subRes.subs) {
    sql.push(
        `INSERT INTO project_subscriptions(project_id, license_name, license_start_date, license_end_date, license_revenue, license_cost, erp_code)
 VALUES ((SELECT id FROM projects WHERE project_code=${SQ(s.project_code)}),
         ${SQ(s.license_name)}, ${dateLit(s.license_start_date)}, ${dateLit(s.license_end_date)},
         ${num(s.license_revenue)}, ${num(s.license_cost)}, ${SQ(s.erp_code)})
 ON CONFLICT (project_id) DO NOTHING;`
    );
}

// 4) Perpetual / SW MA
sql.push('\n-- Perpetual / SW MA');
for (const p of perRes.perp) {
    sql.push(
        `INSERT INTO project_perpetual_ma(project_id, item_name, item_type, start_date, end_date, revenue, cost, erp_code)
 VALUES ((SELECT id FROM projects WHERE project_code=${SQ(p.project_code)}),
         ${SQ(p.item_name)}, ${SQ(p.item_type)}, ${dateLit(p.start_date)}, ${dateLit(p.end_date)},
         ${num(p.revenue)}, ${num(p.cost)}, ${SQ(p.erp_code)});`
    );
}

// 5) Service MA (combines spillovers from Subscription + Perpetual sheets)
sql.push('\n-- Service MA');
for (const s of [...subRes.svc, ...perRes.sv]) {
    sql.push(
        `INSERT INTO project_service_ma(project_id, description, start_date, end_date, revenue, cost, erp_code)
 VALUES ((SELECT id FROM projects WHERE project_code=${SQ(s.project_code)}),
         ${SQ(s.description)}, ${dateLit(s.start_date)}, ${dateLit(s.end_date)},
         ${num(s.revenue)}, ${num(s.cost)}, ${SQ(s.erp_code)});`
    );
}

// 6) Implementation
sql.push('\n-- Implementation');
for (const i of impl) {
    sql.push(
        `INSERT INTO project_implementation(project_id, description, progress_last_year_pct, progress_this_year_pct, revenue, cost, erp_code)
 VALUES ((SELECT id FROM projects WHERE project_code=${SQ(i.project_code)}),
         ${SQ(i.description)}, ${num(i.progress_last_year_pct)}, ${num(i.progress_this_year_pct)},
         ${num(i.revenue)}, ${num(i.cost)}, ${SQ(i.erp_code)})
 ON CONFLICT (project_id) DO NOTHING;`
    );
}

// 7) Outsource (Man-Month)
//    NOTE: a CTE only scopes to the next statement, so we insert the parent
//    row first, then look it up by project_id when inserting monthly rows.
sql.push('\n-- Outsource (Man-Month)');
for (const o of outsource) {
    sql.push(
        `INSERT INTO project_outsource(project_id, outsource_type, description, erp_code)
 VALUES ((SELECT id FROM projects WHERE project_code=${SQ(o.project_code)}),
         ${SQ(o.outsource_type)}, ${SQ(o.description)}, ${SQ(o.erp_code)})
 ON CONFLICT (project_id) DO UPDATE SET description=EXCLUDED.description, outsource_type=EXCLUDED.outsource_type;`
    );
    for (const m of o.months) {
        sql.push(
            `INSERT INTO project_outsource_monthly(project_outsource_id, year, month, revenue, cost)
 SELECT po.id, ${num(m.year)}, ${num(m.month)}, ${num(m.revenue)}, ${num(m.cost)}
   FROM project_outsource po
  WHERE po.project_id = (SELECT id FROM projects WHERE project_code=${SQ(o.project_code)})
 ON CONFLICT (project_outsource_id, year, month) DO UPDATE
    SET revenue=EXCLUDED.revenue, cost=EXCLUDED.cost;`
        );
    }
}

// 8) Resources
sql.push('\n-- Resources');
for (const r of resources) {
    sql.push(
        `INSERT INTO resources(first_name, last_name, nick_name, role, email, erp_username, skill)
 VALUES (${SQ(r.first_name)}, ${SQ(r.last_name)}, ${SQ(r.nick_name)},
         ${SQ(r.role)}, ${SQ(r.email)}, ${SQ(r.erp_username)}, ${SQ(r.skill)});`
    );
}

// 9) Year config defaults from spec example
sql.push('\n-- Year config (defaults — adjust as needed)');
sql.push(
    `INSERT INTO year_config(year, headcount, revenue_per_headcount)
 VALUES (${planningYear}, 20, 1800000)
 ON CONFLICT (year) DO NOTHING;`
);

sql.push('\nCOMMIT;\n');

// ---------- Write outputs ----------
fs.mkdirSync(path.dirname(outSql), { recursive: true });
fs.writeFileSync(outSql, sql.join('\n') + '\n');

const reportText = `# Migration Report

Source: \`${path.basename(xlsxPath)}\`
Planning year: ${planningYear}
Customers: ${customers.size}
Projects: ${projects.size}

${report.join('\n\n')}

## What you should review manually

- **Outsource Cost** — the Excel only contains revenue per month, not cost. All outsource costs are written as 0 and must be entered via the Project Management → Outsource tab.
- **Project status** — projects ingested from the Subscription MA / Perpetual sheets are assumed \`Win\`; the Implementation sheet preserves whatever status was in column "Status".
- **Customer aliases** — aliases are taken verbatim from the first column of each tab. If two tabs use slightly different spellings (e.g. \`KBANK\` vs \`KBank\`) those will become two separate customers; clean up before/after migration in the Customers admin page.
- **Synthetic project codes** — any row without an ERP code gets a deterministic synthetic code (prefix \`SYN-\`). These are flagged inline above. Replace with real ERP codes when known.
- **Resource Planing sheet** — only names/nicknames/roles are imported. Weekly assignments are NOT auto-mapped (the Excel sheet stores them as colored cells without machine-readable project links). Re-enter via the Resource Planning page after migration.
- **Year config** — headcount/revenue-per-headcount are defaulted to 20 × 1,800,000 (the example from the spec). Update in Admin → Year Config.

## How to apply

\`\`\`
psql -h <host> -U postgres -d <db> -f sql/schema.sql
psql -h <host> -U postgres -d <db> -f sql/migration.sql
\`\`\`
`;
fs.writeFileSync(outRpt, reportText);

console.log('[migrate] wrote:', outSql);
console.log('[migrate] wrote:', outRpt);
console.log('[migrate] customers:', customers.size, 'projects:', projects.size,
            'subs:', subRes.subs.length, 'perp+ma:', perRes.perp.length,
            'serviceMA:', subRes.svc.length + perRes.sv.length,
            'implementation:', impl.length, 'outsource:', outsource.length,
            'resources:', resources.length);
