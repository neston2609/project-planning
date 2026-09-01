export const RESOURCE_CSV_COLUMNS = [
    ['emp_id', 'Employee ID'],
    ['first_name', 'First Name'],
    ['last_name', 'Last Name'],
    ['nick_name', 'Nickname'],
    ['role', 'Role'],
    ['email', 'Email'],
    ['mobile_phone', 'Mobile Phone'],
    ['instagram', 'Instagram'],
    ['line_id', 'Line ID'],
    ['facebook', 'Facebook'],
    ['erp_username', 'ERP Username'],
    ['mapped_username', 'System Username'],
    ['skill', 'Skill']
];

export function escapeCsvCell(value) {
    let text = value == null ? '' : String(value);

    // Prevent spreadsheet applications from evaluating imported values as formulas.
    if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;

    return /[",\r\n]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
}

export function buildResourceCsv(resources) {
    const rows = [
        RESOURCE_CSV_COLUMNS.map(([, label]) => escapeCsvCell(label)).join(','),
        ...resources.map(resource =>
            RESOURCE_CSV_COLUMNS.map(([key]) => escapeCsvCell(resource[key])).join(',')
        )
    ];

    // UTF-8 BOM preserves Thai and other Unicode text when opened in Excel.
    return `\uFEFF${rows.join('\r\n')}`;
}

export function resourceCsvFilename(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `resource-information-${year}-${month}-${day}.csv`;
}
