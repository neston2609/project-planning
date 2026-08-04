const DEFAULT_TIME_ZONE = 'Asia/Bangkok';
const DEFAULT_RUN_HOUR = 9;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(ymd, days) {
    const date = new Date(`${ymd}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function localClock(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
    const values = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
            hour: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value])
    );
    return {
        ymd: `${values.year}-${values.month}-${values.day}`,
        weekday: values.weekday,
        hour: Number(values.hour)
    };
}

function nextWorkWeekRange(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
    const clock = localClock(now, timeZone);
    const weekdayOffsets = { Mon: 7, Tue: 6, Wed: 5, Thu: 4, Fri: 3, Sat: 2, Sun: 1 };
    const start = addDays(clock.ymd, weekdayOffsets[clock.weekday]);
    return { start, end: addDays(start, 4) };
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function emailContent(user, range, bookingCount, minRequired, options = {}) {
    const name = user.full_name || user.username;
    const remaining = Math.max(0, minRequired - bookingCount);
    const requirementMet = bookingCount >= minRequired;
    const testPrefix = options.isTest ? '[TEST] ' : '';
    const subject = requirementMet && options.isTest
        ? '[TEST] Office Booking Check: Requirement met'
        : `${testPrefix}Office Booking Reminder: ${remaining} more day${remaining === 1 ? '' : 's'} required`;
    const text = [
        `Hello ${name},`,
        '',
        ...(options.isTest ? ['This is a test notification triggered by an administrator.', ''] : []),
        `You currently have ${bookingCount} booking day${bookingCount === 1 ? '' : 's'} for next week (${range.start} to ${range.end}).`,
        `Your minimum requirement is ${minRequired} day${minRequired === 1 ? '' : 's'} per week.`,
        requirementMet
            ? 'Your booking requirement has been met. No additional booking is required.'
            : `Please add ${remaining} more booking day${remaining === 1 ? '' : 's'} in Office Booking.`,
        '',
        'This is an automated reminder from Planning.'
    ].join('\n');
    const html = `
        <p>Hello ${escapeHtml(name)},</p>
        ${options.isTest ? '<p style="padding:10px 12px;border-radius:8px;background:#eef2ff;color:#3730a3"><strong>TEST:</strong> This notification was triggered by an administrator.</p>' : ''}
        <p>You currently have <strong>${bookingCount}</strong> booking day${bookingCount === 1 ? '' : 's'}
           for next week (<strong>${range.start}</strong> to <strong>${range.end}</strong>).</p>
        <p>Your minimum requirement is <strong>${minRequired}</strong> day${minRequired === 1 ? '' : 's'} per week.</p>
        ${requirementMet
            ? '<p style="color:#047857"><strong>Your booking requirement has been met.</strong> No additional booking is required.</p>'
            : `<p>Please add <strong>${remaining}</strong> more booking day${remaining === 1 ? '' : 's'} in Office Booking.</p>`}
        <p style="color:#64748b;font-size:12px">This is an automated reminder from Planning.</p>`;
    return { subject, text, html };
}

async function runOfficeBookingNotifications(options = {}) {
    const now = options.now || new Date();
    const timeZone = options.timeZone || process.env.OFFICE_BOOKING_NOTIFICATION_TIMEZONE || DEFAULT_TIME_ZONE;
    const runHour = Number(options.runHour ?? process.env.OFFICE_BOOKING_NOTIFICATION_HOUR ?? DEFAULT_RUN_HOUR);
    const clock = localClock(now, timeZone);
    if (!options.force && (clock.weekday !== 'Fri' || clock.hour < runHour)) {
        return { skipped: true, reason: 'outside_schedule', clock };
    }

    const database = options.database || require('../db');
    const deliverMail = options.deliverMail || require('./mailer').sendMail;
    const range = nextWorkWeekRange(now, timeZone);
    const { rows: users } = await database.query(
        `SELECT id, tenant_id, username, full_name, email, office_booking_min_required
           FROM users
          WHERE tenant_id IS NOT NULL
            AND office_booking_notification_enabled=TRUE
          ORDER BY tenant_id, id`
    );

    const summary = { skipped: false, range, checked: users.length, sent: 0, sufficient: 0, noEmail: 0, failed: 0, duplicate: 0 };
    for (const user of users) {
        const minRequired = Number(user.office_booking_min_required) || 2;
        const countResult = await database.query(
            `SELECT COUNT(*)::int AS count
               FROM office_bookings
              WHERE tenant_id=$1 AND user_id=$2
                AND booking_date BETWEEN $3 AND $4`,
            [user.tenant_id, user.id, range.start, range.end]
        );
        const bookingCount = Number(countResult.rows[0]?.count || 0);
        const status = bookingCount >= minRequired ? 'sufficient' : (!String(user.email || '').trim() ? 'no_email' : 'processing');
        const runResult = await database.query(
            `INSERT INTO office_booking_notification_runs
                (tenant_id, user_id, week_start, week_end, booking_count, min_required, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (tenant_id, user_id, week_start) DO NOTHING
             RETURNING id`,
            [user.tenant_id, user.id, range.start, range.end, bookingCount, minRequired, status]
        );
        const runId = runResult.rows[0]?.id;
        if (!runId) {
            summary.duplicate += 1;
            continue;
        }
        if (status === 'sufficient') {
            summary.sufficient += 1;
            continue;
        }
        if (status === 'no_email') {
            summary.noEmail += 1;
            continue;
        }
        try {
            const content = emailContent(user, range, bookingCount, minRequired);
            await deliverMail({ tenantId: user.tenant_id, to: user.email.trim(), ...content });
            await database.query(
                `UPDATE office_booking_notification_runs
                    SET status='sent', sent_at=NOW()
                  WHERE id=$1`,
                [runId]
            );
            summary.sent += 1;
        } catch (err) {
            await database.query(
                `UPDATE office_booking_notification_runs
                    SET status='failed', error_message=$1
                  WHERE id=$2`,
                [String(err.message || err).slice(0, 2000), runId]
            );
            summary.failed += 1;
            console.error(`[office-booking-notification] user=${user.id} tenant=${user.tenant_id}:`, err.message || err);
        }
    }
    return summary;
}

function startOfficeBookingNotificationScheduler() {
    let running = false;
    const check = async () => {
        if (running) return;
        running = true;
        try {
            const result = await runOfficeBookingNotifications();
            if (!result.skipped && (result.checked || result.failed)) {
                console.log('[office-booking-notification]', result);
            }
        } catch (err) {
            console.error('[office-booking-notification] scheduler failed:', err.message || err);
        } finally {
            running = false;
        }
    };
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    timer.unref?.();
    check();
    return timer;
}

module.exports = {
    DEFAULT_TIME_ZONE,
    emailContent,
    localClock,
    nextWorkWeekRange,
    runOfficeBookingNotifications,
    startOfficeBookingNotificationScheduler
};
