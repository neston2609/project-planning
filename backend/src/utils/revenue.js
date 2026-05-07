/**
 * Revenue recognition logic for the selected planning year.
 *
 * All calculations use whole-day arithmetic (UTC) to avoid timezone drift.
 * The recognition fraction is clipped to [0, 1].
 */

const MS_PER_DAY = 86_400_000;

function toDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d;
    return new Date(d);
}

function toUTCMidnight(d) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysBetweenInclusive(a, b) {
    if (!a || !b) return 0;
    const days = Math.floor((toUTCMidnight(b) - toUTCMidnight(a)) / MS_PER_DAY) + 1;
    return Math.max(0, days);
}

function clampDate(d, lo, hi) {
    if (d < lo) return lo;
    if (d > hi) return hi;
    return d;
}

/**
 * Pro-rata recognition for a contract that spans (start..end), evaluated
 * for the calendar year `year`. Returns a number in [0, 1].
 */
function prorataRecognition(start, end, year) {
    start = toDate(start);
    end   = toDate(end);
    if (!start || !end || isNaN(start) || isNaN(end)) return 0;

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd   = new Date(Date.UTC(year, 11, 31));

    if (end < yearStart || start > yearEnd) return 0;

    const totalDays = daysBetweenInclusive(start, end);
    if (totalDays <= 0) return 0;

    const overlapStart = clampDate(start, yearStart, yearEnd);
    const overlapEnd   = clampDate(end,   yearStart, yearEnd);
    const overlapDays  = daysBetweenInclusive(overlapStart, overlapEnd);

    return Math.max(0, Math.min(1, overlapDays / totalDays));
}

/** Subscription License — pro-rata. */
function recognizeSubscription(row, year) {
    const pct = prorataRecognition(row.license_start_date, row.license_end_date, year);
    const revenue = Number(row.license_revenue || 0);
    const cost    = Number(row.license_cost    || 0);
    const gm = revenue - cost;
    return {
        pct_recognize: pct,
        recognize_revenue: revenue * pct,
        recognize_cost:    cost    * pct,
        recognize_gm:      gm      * pct,
        gross_margin:      gm
    };
}

/** Perpetual License (one-shot) / Software MA (pro-rata). */
function recognizePerpetualMA(row, year) {
    const start = toDate(row.start_date);
    const end   = toDate(row.end_date);
    const revenue = Number(row.revenue || 0);
    const cost    = Number(row.cost    || 0);
    const gm = revenue - cost;
    let pct = 0;
    if (row.item_type === 'License') {
        // 100% if license starts inside the selected year
        if (start && start.getUTCFullYear() === Number(year)) pct = 1;
    } else {
        pct = prorataRecognition(start, end, year);
    }
    return {
        pct_recognize: pct,
        recognize_revenue: revenue * pct,
        recognize_cost:    cost    * pct,
        recognize_gm:      gm      * pct,
        gross_margin:      gm
    };
}

/** Service MA — pro-rata. */
function recognizeServiceMA(row, year) {
    const pct = prorataRecognition(row.start_date, row.end_date, year);
    const revenue = Number(row.revenue || 0);
    const cost    = Number(row.cost    || 0);
    const gm = revenue - cost;
    return {
        pct_recognize: pct,
        recognize_revenue: revenue * pct,
        recognize_cost:    cost    * pct,
        recognize_gm:      gm      * pct,
        gross_margin:      gm
    };
}

/** Implementation — delta of completion %. */
function recognizeImplementation(row /*, year*/) {
    const last = Number(row.progress_last_year_pct || 0);
    const cur  = Number(row.progress_this_year_pct || 0);
    const pct = Math.max(0, Math.min(1, cur - last));
    const revenue = Number(row.revenue || 0);
    const cost    = Number(row.cost    || 0);
    const gm = revenue - cost;
    return {
        pct_recognize: pct,
        recognize_revenue: revenue * pct,
        recognize_cost:    cost    * pct,
        recognize_gm:      gm      * pct,
        gross_margin:      gm
    };
}

/**
 * Outsource recognition.
 *  - Man-Month: 100% — caller must sum the monthly rows for the year.
 *  - Man-Year:  pro-rata.
 *
 *  When outsource_type === 'Man-Month' the row will also expose
 *  `monthly_revenue` and `monthly_cost` (sum of monthly children for the
 *  selected year), which the caller can pass in via `row.revenue`/`row.cost`.
 */
function recognizeOutsource(row, year) {
    const revenue = Number(row.revenue || 0);
    const cost    = Number(row.cost    || 0);
    const gm = revenue - cost;
    let pct = 0;
    if (row.outsource_type === 'Man-Month') {
        pct = revenue > 0 || cost > 0 ? 1 : 0;
    } else {
        pct = prorataRecognition(row.start_date, row.end_date, year);
    }
    return {
        pct_recognize: pct,
        recognize_revenue: revenue * pct,
        recognize_cost:    cost    * pct,
        recognize_gm:      gm      * pct,
        gross_margin:      gm
    };
}

module.exports = {
    prorataRecognition,
    daysBetweenInclusive,
    recognizeSubscription,
    recognizePerpetualMA,
    recognizeServiceMA,
    recognizeImplementation,
    recognizeOutsource
};
