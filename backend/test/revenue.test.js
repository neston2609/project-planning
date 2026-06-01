const test = require('node:test');
const assert = require('node:assert/strict');

const {
    prorataRecognition,
    daysBetweenInclusive,
    recognizeImplementation,
    recognizeOutsource,
    recognizePerpetualMA,
    recognizeSubscription
} = require('../src/utils/revenue');

test('daysBetweenInclusive counts both endpoints and rejects inverted ranges', () => {
    assert.equal(daysBetweenInclusive(new Date('2026-01-01'), new Date('2026-01-01')), 1);
    assert.equal(daysBetweenInclusive(new Date('2026-01-01'), new Date('2026-01-31')), 31);
    assert.equal(daysBetweenInclusive(new Date('2026-02-01'), new Date('2026-01-31')), 0);
});

test('prorataRecognition recognizes only the overlap with the selected year', () => {
    assert.equal(prorataRecognition('2026-01-01', '2026-12-31', 2026), 1);
    assert.equal(prorataRecognition('2025-01-01', '2025-12-31', 2026), 0);

    const pct = prorataRecognition('2025-07-01', '2026-06-30', 2026);
    assert.equal(pct, 181 / 365);
});

test('subscription recognition prorates revenue, cost, and gross margin', () => {
    const result = recognizeSubscription({
        license_start_date: '2026-01-01',
        license_end_date: '2026-12-31',
        license_revenue: 1200,
        license_cost: 300
    }, 2026);

    assert.equal(result.pct_recognize, 1);
    assert.equal(result.recognize_revenue, 1200);
    assert.equal(result.recognize_cost, 300);
    assert.equal(result.recognize_gm, 900);
});

test('perpetual license recognizes in the start year only', () => {
    const row = { item_type: 'License', start_date: '2026-04-01', end_date: '2027-03-31', revenue: 500, cost: 100 };

    assert.equal(recognizePerpetualMA(row, 2026).pct_recognize, 1);
    assert.equal(recognizePerpetualMA(row, 2027).pct_recognize, 0);
});

test('implementation recognition uses clipped progress delta', () => {
    assert.equal(recognizeImplementation({ progress_last_year_pct: 0.25, progress_this_year_pct: 0.75, revenue: 1000, cost: 200 }).recognize_gm, 400);
    assert.equal(recognizeImplementation({ progress_last_year_pct: 0.9, progress_this_year_pct: 0.2, revenue: 1000, cost: 200 }).pct_recognize, 0);
    assert.equal(recognizeImplementation({ progress_last_year_pct: 0, progress_this_year_pct: 2, revenue: 1000, cost: 200 }).pct_recognize, 1);
});

test('outsource man-month recognizes populated monthly rows at 100 percent', () => {
    assert.equal(recognizeOutsource({ outsource_type: 'Man-Month', revenue: 100, cost: 50 }, 2026).pct_recognize, 1);
    assert.equal(recognizeOutsource({ outsource_type: 'Man-Month', revenue: 0, cost: 0 }, 2026).pct_recognize, 0);
});
