/**
 * Parse a License Certificate PDF (UiPath-style) into structured license rows.
 *
 * Table layout:
 *   Quantity | Product Name | Start Date | End Date | License Key
 *
 * Strategy: line-based state machine driven by the two-date anchor
 *   "DD-MMM-YYYY  DD-MMM-YYYY".
 *
 * Heuristics to avoid false-positive row starts and footer pollution:
 *  - In `collect_key` mode, if the previous key line ended with digit-hyphen
 *    we stitch the next number-only line as a continuation, not a new row.
 *  - We stop collecting when we hit footer-like phrases ("By activation",
 *    "The above License keys", "Master Software", "Third Party Products").
 *  - License keys broken across wraps (e.g. "5175-1536-6270-" + "4329") are
 *    rejoined without a space.
 */

const pdf = require('pdf-parse/lib/pdf-parse.js');

const DATE_RANGE_RE = /(\d{2})-([A-Z][a-z]{2})-(\d{4})\s+(\d{2})-([A-Z][a-z]{2})-(\d{4})/;
const ROW_START_RE  = /^(\d{1,4})(?:\s+([A-Za-z].*)|\s*)$/;
const HEADER_RE     = /Quantity\s+Product\s+Name\s+Start\s+Date\s+End\s+Date\s+License\s+Key/i;
const FOOTER_RE     = /^(By activation|The above License|UiPath \"Master|UiPath\s+SRL|MSSA|Third Party Products|License valid from)/i;

const MONTHS = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

function toIso(d, mon, y) {
    const m = MONTHS[mon];
    if (!m) return null;
    return `${y}-${m}-${String(d).padStart(2, '0')}`;
}

function joinLines(lines) {
    let s = '';
    for (const raw of lines) {
        const cur = String(raw).trim();
        if (!cur) continue;
        if (s === '') { s = cur; continue; }
        if (/\d-$/.test(s)) s += cur;  // digit-hyphen wrap → stitch without space
        else                s += ' ' + cur;
    }
    return s;
}

/**
 * Try to extract the customer name from the certificate cover page.
 * UiPath layout: "LICENSE", "CERTIFICATE" on separate lines, then the
 * customer name on the next non-empty line. Returns '' if not confident.
 */
function detectCustomer(lines) {
    for (let i = 0; i < lines.length - 1; i++) {
        if (!/^LICENSE$/i.test(lines[i])) continue;
        // Find next non-empty line; expect it to be "CERTIFICATE"
        let j = i + 1;
        while (j < lines.length && !lines[j]) j++;
        if (j >= lines.length || !/^CERTIFICATE$/i.test(lines[j])) continue;
        // Next non-empty is the customer
        let k = j + 1;
        while (k < lines.length && !lines[k]) k++;
        if (k < lines.length) {
            const candidate = lines[k].trim();
            // Skip obvious boilerplate
            if (/^(thailand|romania|united|england|america)$/i.test(candidate)) continue;
            if (candidate.length > 0 && candidate.length < 100) return candidate;
        }
    }
    return '';
}

function inferVendor(productName) {
    if (!productName) return '';
    const trimmed = productName.trim();
    const dashIdx = trimmed.indexOf(' - ');
    if (dashIdx > 0) return trimmed.slice(0, dashIdx).trim();
    const m = trimmed.match(/^(\S+)/);
    return m ? m[1] : '';
}

function extractRows(text) {
    const allLines = text.split(/\r?\n/).map(s => s.trim());

    let mode    = 'pre';
    let current = null;
    const rows  = [];

    function finalize() {
        if (!current) return;
        current.license_name = joinLines(current.product_lines);
        current.license_key  = joinLines(current.key_lines);
        current.vendor       = inferVendor(current.license_name);
        delete current.product_lines;
        delete current.key_lines;
        rows.push(current);
        current = null;
    }

    for (const line of allLines) {
        // Footer detection (works in any state) terminates the table.
        if (mode !== 'pre' && FOOTER_RE.test(line)) {
            finalize();
            mode = 'done';
            continue;
        }
        if (mode === 'done') continue;

        if (mode === 'pre') {
            if (HEADER_RE.test(line)) mode = 'rowstart';
            continue;
        }

        if (mode === 'rowstart') {
            if (!line) continue;
            const m = line.match(ROW_START_RE);
            if (!m) continue;
            current = {
                quantity: Number(m[1]),
                product_lines: m[2] ? [m[2]] : [],
                start_date: null,
                end_date: null,
                key_lines: []
            };
            mode = 'collect_product';
            continue;
        }

        if (mode === 'collect_product') {
            const dr = line.match(DATE_RANGE_RE);
            if (dr) {
                const before = line.slice(0, dr.index).trim();
                const after  = line.slice(dr.index + dr[0].length).trim();
                if (before) current.product_lines.push(before);
                current.start_date = toIso(dr[1], dr[2], dr[3]);
                current.end_date   = toIso(dr[4], dr[5], dr[6]);
                if (after) current.key_lines.push(after);
                mode = 'collect_key';
                continue;
            }
            if (line) current.product_lines.push(line);
            continue;
        }

        if (mode === 'collect_key') {
            if (!line) continue;

            // Continuation of a digit-hyphen wrap → just append, never treat as new row.
            const lastKey = current.key_lines.length
                ? current.key_lines[current.key_lines.length - 1]
                : '';
            const isWrapContinuation = /\d-$/.test(lastKey.trim());

            const m = isWrapContinuation ? null : line.match(ROW_START_RE);
            if (m) {
                finalize();
                current = {
                    quantity: Number(m[1]),
                    product_lines: m[2] ? [m[2]] : [],
                    start_date: null,
                    end_date: null,
                    key_lines: []
                };
                mode = 'collect_product';
                continue;
            }
            current.key_lines.push(line);
        }
    }

    finalize();
    return rows;
}

async function parseLicensePdf(buffer) {
    const data  = await pdf(buffer);
    const text  = data.text || '';
    const lines = text.split(/\r?\n/).map(s => s.trim());
    return {
        detected_customer: detectCustomer(lines),
        rows: extractRows(text),
        raw_pages: data.numpages,
        raw_chars: text.length
    };
}

module.exports = { parseLicensePdf, extractRows, detectCustomer, inferVendor };
