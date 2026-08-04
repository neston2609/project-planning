const test = require('node:test');
const assert = require('node:assert/strict');

const {
    emailContent,
    localClock,
    nextWorkWeekRange,
    runOfficeBookingNotifications
} = require('../src/utils/officeBookingNotifications');

test('notification schedule uses Bangkok Friday and the following Monday to Friday', () => {
    const fridayAtNine = new Date('2026-08-07T02:00:00.000Z');
    assert.deepEqual(localClock(fridayAtNine), { ymd: '2026-08-07', weekday: 'Fri', hour: 9 });
    assert.deepEqual(nextWorkWeekRange(fridayAtNine), { start: '2026-08-10', end: '2026-08-14' });
});

test('email reminder reports the booking shortfall', () => {
    const content = emailContent(
        { username: 'dao', full_name: 'Dao <Team>' },
        { start: '2026-08-10', end: '2026-08-14' },
        1,
        2
    );
    assert.match(content.subject, /1 more day required/);
    assert.match(content.text, /minimum requirement is 2 days/);
    assert.match(content.html, /Dao &lt;Team&gt;/);
});

test('test reminder is clearly identified without changing the booking calculation', () => {
    const content = emailContent(
        { username: 'dao', full_name: 'Dao' },
        { start: '2026-08-10', end: '2026-08-14' },
        0,
        2,
        { isTest: true }
    );
    assert.match(content.subject, /^\[TEST\] Office Booking Reminder/);
    assert.match(content.text, /test notification triggered by an administrator/i);
    assert.match(content.html, /<strong>TEST:<\/strong>/);
});

test('test reminder still sends a clear success result when requirement is met', () => {
    const content = emailContent(
        { username: 'may', full_name: 'May' },
        { start: '2026-08-10', end: '2026-08-14' },
        2,
        2,
        { isTest: true }
    );
    assert.equal(content.subject, '[TEST] Office Booking Check: Requirement met');
    assert.match(content.text, /requirement has been met/i);
    assert.doesNotMatch(content.text, /Please add 0/);
});

test('weekly job sends only when booking count is below the user minimum', async () => {
    const sent = [];
    let insertedId = 100;
    const database = {
        async query(sql, params = []) {
            if (sql.includes('FROM users')) {
                return { rows: [
                    { id: 1, tenant_id: 10, username: 'dao', full_name: 'Dao', email: 'dao@example.com', office_booking_min_required: 2 },
                    { id: 2, tenant_id: 10, username: 'may', full_name: 'May', email: 'may@example.com', office_booking_min_required: 2 }
                ] };
            }
            if (sql.includes('COUNT(*)::int AS count')) {
                return { rows: [{ count: params[1] === 1 ? 1 : 2 }] };
            }
            if (sql.includes('INSERT INTO office_booking_notification_runs')) {
                insertedId += 1;
                return { rows: [{ id: insertedId }] };
            }
            if (sql.includes('UPDATE office_booking_notification_runs')) return { rows: [] };
            throw new Error(`Unexpected SQL: ${sql}`);
        }
    };
    const result = await runOfficeBookingNotifications({
        database,
        deliverMail: async message => sent.push(message),
        now: new Date('2026-08-07T02:00:00.000Z')
    });

    assert.equal(result.sent, 1);
    assert.equal(result.sufficient, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'dao@example.com');
    assert.equal(sent[0].tenantId, 10);
});

test('weekly job skips before the configured Friday hour', async () => {
    const result = await runOfficeBookingNotifications({
        database: { query: async () => { throw new Error('should not query'); } },
        now: new Date('2026-08-07T01:59:00.000Z')
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'outside_schedule');
});
