export function emptyCustomerRevenueSummary() {
    return {
        winRev: 0,
        winGm: 0,
        winProjects: new Set(),
        pipelineRev: 0,
        pipelineGm: 0,
        pipelineProjects: new Set(),
        subscriptionRev: 0,
        subscriptionGm: 0,
        perpetualRev: 0,
        perpetualGm: 0,
        swMaRev: 0,
        swMaGm: 0,
        serviceRev: 0
    };
}

function isRecognizedStatus(status) {
    return status === 'Win' || status === 'Backlog';
}

function number(value) {
    return Number(value) || 0;
}

export function buildCustomerRevenueSummaries({
    subscriptions = [],
    perpetualMa = [],
    serviceMa = [],
    implementation = [],
    outsource = []
} = {}) {
    const summaries = new Map();

    function summaryFor(row) {
        const key = row.customer || '';
        if (!summaries.has(key)) summaries.set(key, emptyCustomerRevenueSummary());
        return summaries.get(key);
    }

    function addBase(row) {
        const summary = summaryFor(row);
        const revenue = number(row.recognize_revenue);
        const grossMargin = number(row.recognize_gross_margin);
        if (row.status === 'Pipeline') {
            summary.pipelineRev += revenue;
            summary.pipelineGm += grossMargin;
            summary.pipelineProjects.add(row.project_id);
        } else if (isRecognizedStatus(row.status)) {
            summary.winRev += revenue;
            summary.winGm += grossMargin;
            summary.winProjects.add(row.project_id);
        }
        return { summary, revenue, grossMargin, recognized: isRecognizedStatus(row.status) };
    }

    for (const row of subscriptions) {
        const { summary, revenue, grossMargin, recognized } = addBase(row);
        if (recognized) {
            summary.subscriptionRev += revenue;
            summary.subscriptionGm += grossMargin;
        }
    }

    for (const row of perpetualMa) {
        const { summary, revenue, grossMargin, recognized } = addBase(row);
        if (!recognized) continue;
        if (row.item_type === 'License') {
            summary.perpetualRev += revenue;
            summary.perpetualGm += grossMargin;
        } else {
            summary.swMaRev += revenue;
            summary.swMaGm += grossMargin;
        }
    }

    for (const row of [...serviceMa, ...implementation, ...outsource]) {
        const { summary, revenue, recognized } = addBase(row);
        if (recognized) summary.serviceRev += revenue;
    }

    return summaries;
}
