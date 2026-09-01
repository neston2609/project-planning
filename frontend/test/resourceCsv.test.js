import test from 'node:test';
import assert from 'node:assert/strict';
import {
    RESOURCE_CSV_COLUMNS,
    buildResourceCsv,
    escapeCsvCell,
    resourceCsvFilename
} from '../src/utils/resourceCsv.js';

test('escapeCsvCell escapes commas, quotes, and line breaks', () => {
    assert.equal(escapeCsvCell('RPA, AI'), '"RPA, AI"');
    assert.equal(escapeCsvCell('He said "hello"'), '"He said ""hello"""');
    assert.equal(escapeCsvCell('line 1\nline 2'), '"line 1\nline 2"');
    assert.equal(escapeCsvCell(null), '');
});

test('escapeCsvCell neutralizes spreadsheet formulas', () => {
    assert.equal(escapeCsvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
    assert.equal(escapeCsvCell(' @SUM(A1:A2)'), "' @SUM(A1:A2)");
});

test('buildResourceCsv exports every resource and business column as UTF-8 CSV', () => {
    const csv = buildResourceCsv([
        {
            emp_id: 'EMP001', first_name: 'Dao', last_name: 'ใจดี', nick_name: 'Dao',
            role: 'Developer', email: 'dao@example.com', mobile_phone: '0812345678',
            instagram: '@dao', line_id: 'dao-line', facebook: 'dao.fb',
            erp_username: 'dao.erp', mapped_username: 'dao.user', skill: 'RPA, AI'
        },
        { emp_id: 'EMP002', first_name: 'Nok', last_name: 'S.', skill: 'Automation' }
    ]);

    const lines = csv.slice(1).split('\r\n');
    assert.equal(csv.charCodeAt(0), 0xFEFF);
    assert.equal(lines.length, 3);
    assert.equal(lines[0], RESOURCE_CSV_COLUMNS.map(([, label]) => label).join(','));
    assert.match(lines[1], /^EMP001,Dao,ใจดี,Dao,Developer/);
    assert.match(lines[1], /dao\.erp,dao\.user,"RPA, AI"$/);
    assert.match(lines[2], /^EMP002,Nok,S\./);
});

test('resourceCsvFilename uses the local calendar date', () => {
    assert.equal(resourceCsvFilename(new Date(2026, 8, 1)), 'resource-information-2026-09-01.csv');
});
