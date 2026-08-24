import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerRevenueSummaries } from '../src/customerRevenueSummary.js';

test('groups recognized revenue by customer and requested revenue category', () => {
    const summaries = buildCustomerRevenueSummaries({
        subscriptions: [
            { customer: 'BOT', project_id: 1, status: 'Win', recognize_revenue: 100, recognize_gross_margin: 60 },
            { customer: 'BOT', project_id: 2, status: 'Pipeline', recognize_revenue: 900, recognize_gross_margin: 500 }
        ],
        perpetualMa: [
            { customer: 'BOT', project_id: 3, status: 'Backlog', item_type: 'License', recognize_revenue: 200, recognize_gross_margin: 150 },
            { customer: 'BOT', project_id: 4, status: 'Win', item_type: 'MA', recognize_revenue: 80, recognize_gross_margin: 50 }
        ],
        serviceMa: [
            { customer: 'BOT', project_id: 5, status: 'Win', recognize_revenue: 40, recognize_gross_margin: 20 }
        ],
        implementation: [
            { customer: 'BOT', project_id: 6, status: 'Backlog', recognize_revenue: 70, recognize_gross_margin: 30 }
        ],
        outsource: [
            { customer: 'BOT', project_id: 7, status: 'Win', recognize_revenue: 30, recognize_gross_margin: 10 }
        ]
    });

    const bot = summaries.get('BOT');
    assert.equal(bot.subscriptionRev, 100);
    assert.equal(bot.subscriptionGm, 60);
    assert.equal(bot.perpetualRev, 200);
    assert.equal(bot.perpetualGm, 150);
    assert.equal(bot.swMaRev, 80);
    assert.equal(bot.swMaGm, 50);
    assert.equal(bot.serviceRev, 140);
    assert.equal(bot.winRev, 520);
    assert.equal(bot.winGm, 320);
    assert.equal(bot.winProjects.size, 6);
    assert.equal(bot.pipelineRev, 900);
    assert.equal(bot.pipelineProjects.size, 1);
});

test('does not include pipeline revenue in recognized category breakdown', () => {
    const summaries = buildCustomerRevenueSummaries({
        perpetualMa: [
            { customer: 'ACME', project_id: 9, status: 'Pipeline', item_type: 'License', recognize_revenue: 500, recognize_gross_margin: 300 }
        ]
    });

    const acme = summaries.get('ACME');
    assert.equal(acme.perpetualRev, 0);
    assert.equal(acme.perpetualGm, 0);
    assert.equal(acme.pipelineRev, 500);
});
