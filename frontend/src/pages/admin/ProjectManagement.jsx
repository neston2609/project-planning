import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../../api';
import toast from 'react-hot-toast';
import { useYear } from '../../YearContext';
import StatusPill from '../../components/StatusPill';
import Modal from '../../components/Modal';
import { baht, formatDate } from '../../format';
import {
    PencilSquareIcon, TrashIcon, PlusIcon, MagnifyingGlassIcon, FunnelIcon,
    ArrowsUpDownIcon, PaperClipIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, EyeIcon
} from '@heroicons/react/24/outline';

const PROJECT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
const PROJECT_ATTACHMENT_MAX_MB = 50;

function fileSize(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function canPreview(file) {
    const type = String(file.mime_type || '');
    return type.startsWith('image/') || type === 'application/pdf';
}

async function fetchBlob(url) {
    const res = await api.get(url, { responseType: 'blob' });
    return URL.createObjectURL(res.data);
}

async function downloadAttachment(url, fileName) {
    const objectUrl = await fetchBlob(url);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName || 'attachment';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function uploadProjectAttachment(projectId, file, documentTypeId) {
    if (file.size > PROJECT_ATTACHMENT_MAX_BYTES) {
        throw new Error(`${file.name} is larger than ${PROJECT_ATTACHMENT_MAX_MB} MB`);
    }
    const params = new URLSearchParams({ filename: file.name });
    if (documentTypeId) params.set('document_type_id', String(documentTypeId));
    return api.post(`/projects/${projectId}/attachments?${params.toString()}`, file, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
            'X-File-Type': file.type || 'application/octet-stream',
            'X-Document-Type-Id': documentTypeId || ''
        },
        timeout: 0
    });
}

function validProjectAttachmentFiles(files) {
    const valid = [];
    for (const file of files) {
        if (file.size > PROJECT_ATTACHMENT_MAX_BYTES) {
            toast.error(`${file.name} is larger than ${PROJECT_ATTACHMENT_MAX_MB} MB`);
        } else {
            valid.push(file);
        }
    }
    return valid;
}

function exportDate(value) {
    return formatDate(value) || '';
}

function moneyValue(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
}

function appendSheet(workbook, name, rows, widths = []) {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    if (widths.length) worksheet['!cols'] = widths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

function asString(value) {
    return String(value ?? '').trim();
}

function asNumber(value) {
    if (value === '' || value == null) return 0;
    const n = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
}

function normalizeImportDate(value) {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
            return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
    }
    return formatDate(value) || asString(value).slice(0, 10);
}

function sheetRows(workbook, name) {
    const sheet = workbook.Sheets[name];
    return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) : [];
}

function importWorkbook(workbook) {
    const projects = new Map();
    const ensure = (code) => {
        const key = asString(code);
        if (!key) return null;
        if (!projects.has(key)) {
            projects.set(key, {
                project_code: key,
                master: null,
                subscription: null,
                perpetual_ma: [],
                service_ma: [],
                implementation: null,
                outsource: null,
                outsource_monthly: []
            });
        }
        return projects.get(key);
    };

    for (const row of sheetRows(workbook, 'Projects')) {
        const project = ensure(row['Project Code']);
        if (!project) continue;
        project.master = {
            project_code: project.project_code,
            description: asString(row.Description),
            customer_name: asString(row.Customer),
            status: asString(row.Status) || 'Pipeline',
            pipeline_win_pct: row['% to Win'] === '' ? 50 : asNumber(row['% to Win']),
            project_start_date: normalizeImportDate(row['Start Date']),
            project_end_date: normalizeImportDate(row['End Date']),
            pipeline_target_date: normalizeImportDate(row['Pipeline Target Date']),
            note: asString(row.Note)
        };
    }
    for (const row of sheetRows(workbook, 'Subscription')) {
        const project = ensure(row['Project Code']);
        if (!project) continue;
        project.subscription = {
            license_name: asString(row['License Name']),
            license_start_date: normalizeImportDate(row['Start Date']),
            license_end_date: normalizeImportDate(row['End Date']),
            license_revenue: asNumber(row.Revenue),
            license_cost: asNumber(row.Cost)
        };
    }
    for (const row of sheetRows(workbook, 'Perpetual SW MA')) {
        const project = ensure(row['Project Code']);
        if (!project) continue;
        project.perpetual_ma.push({
            item_name: asString(row['Item Name']),
            item_type: asString(row.Type) || 'License',
            start_date: normalizeImportDate(row['Start Date']),
            end_date: normalizeImportDate(row['End Date']),
            revenue: asNumber(row.Revenue),
            cost: asNumber(row.Cost)
        });
    }
    for (const row of sheetRows(workbook, 'Service MA')) {
        const project = ensure(row['Project Code']);
        if (!project) continue;
        project.service_ma.push({
            description: asString(row.Description),
            start_date: normalizeImportDate(row['Start Date']),
            end_date: normalizeImportDate(row['End Date']),
            revenue: asNumber(row.Revenue),
            cost: asNumber(row.Cost)
        });
    }
    for (const row of sheetRows(workbook, 'Implementation')) {
        const project = ensure(row['Project Code']);
        if (!project) continue;
        project.implementation = {
            description: asString(row.Description),
            progress_last_year_pct: asNumber(row['Progress Last Year']),
            progress_this_year_pct: asNumber(row['Progress This Year']),
            revenue: asNumber(row.Revenue),
            cost: asNumber(row.Cost)
        };
    }
    for (const row of sheetRows(workbook, 'Outsource')) {
        const project = ensure(row['Project Code']);
        if (!project) continue;
        project.outsource = {
            outsource_type: asString(row.Type) || 'Man-Year',
            description: asString(row.Description),
            start_date: normalizeImportDate(row['Start Date']),
            end_date: normalizeImportDate(row['End Date']),
            revenue: asNumber(row.Revenue),
            cost: asNumber(row.Cost),
            months: []
        };
    }
    for (const row of sheetRows(workbook, 'Outsource Monthly')) {
        const project = ensure(row['Project Code']);
        if (!project) continue;
        project.outsource_monthly.push({
            year: Number(row.Year || 0),
            month: Number(row.Month || 0),
            revenue: asNumber(row.Revenue),
            cost: asNumber(row.Cost)
        });
    }

    for (const project of projects.values()) {
        if (!project.master) {
            project.master = {
                project_code: project.project_code,
                description: '',
                customer_name: '',
                status: 'Pipeline',
                pipeline_win_pct: 50,
                project_start_date: '',
                project_end_date: '',
                pipeline_target_date: '',
                note: ''
            };
        }
        if (project.outsource) project.outsource.months = project.outsource_monthly;
    }
    return Array.from(projects.values());
}

function sameValue(a, b) {
    return String(a ?? '') === String(b ?? '');
}

function addFieldChange(changes, label, current, next) {
    if (!sameValue(current, next)) {
        changes.push(`${label}: "${current || '-'}" -> "${next || '-'}"`);
    }
}

function diffObject(changes, scope, current, next, fields) {
    const before = current || {};
    const after = next || {};
    for (const [key, label] of fields) {
        addFieldChange(changes, `${scope} ${label}`, before[key], after[key]);
    }
}

function diffRows(changes, scope, currentRows, nextRows, fields) {
    const max = Math.max(currentRows.length, nextRows.length);
    for (let i = 0; i < max; i += 1) {
        const before = currentRows[i];
        const after = nextRows[i];
        if (!before && after) {
            changes.push(`${scope} row ${i + 1}: add ${JSON.stringify(after)}`);
        } else if (before && !after) {
            changes.push(`${scope} row ${i + 1}: remove ${JSON.stringify(before)}`);
        } else if (before && after) {
            diffObject(changes, `${scope} row ${i + 1}`, before, after, fields);
        }
    }
}

function buildImportDiff(current, imported) {
    const changes = [];
    const master = imported.master;
    const currentSubscription = current?.subscription ? {
        ...current.subscription,
        license_start_date: exportDate(current.subscription.license_start_date),
        license_end_date: exportDate(current.subscription.license_end_date),
        license_revenue: moneyValue(current.subscription.license_revenue),
        license_cost: moneyValue(current.subscription.license_cost)
    } : null;
    const currentPerpetual = (current?.perpetual_ma || []).map(row => ({
        ...row,
        start_date: exportDate(row.start_date),
        end_date: exportDate(row.end_date),
        revenue: moneyValue(row.revenue),
        cost: moneyValue(row.cost)
    }));
    const currentServiceMa = (current?.service_ma || []).map(row => ({
        ...row,
        start_date: exportDate(row.start_date),
        end_date: exportDate(row.end_date),
        revenue: moneyValue(row.revenue),
        cost: moneyValue(row.cost)
    }));
    const currentImplementation = current?.implementation ? {
        ...current.implementation,
        progress_last_year_pct: moneyValue(current.implementation.progress_last_year_pct),
        progress_this_year_pct: moneyValue(current.implementation.progress_this_year_pct),
        revenue: moneyValue(current.implementation.revenue),
        cost: moneyValue(current.implementation.cost)
    } : null;
    const currentOutsource = current?.outsource ? {
        ...current.outsource,
        start_date: exportDate(current.outsource.start_date),
        end_date: exportDate(current.outsource.end_date),
        revenue: moneyValue(current.outsource.revenue),
        cost: moneyValue(current.outsource.cost)
    } : null;
    const currentOutsourceMonthly = (current?.outsource?.months || []).map(row => ({
        ...row,
        year: Number(row.year || 0),
        month: Number(row.month || 0),
        revenue: moneyValue(row.revenue),
        cost: moneyValue(row.cost)
    }));
    if (!current) {
        changes.push('Project will be created');
    } else {
        diffObject(changes, 'Project', {
            project_code: current.project_code || '',
            description: current.description || '',
            customer_name: current.customer_alias || '',
            status: current.status || '',
            pipeline_win_pct: current.status === 'Pipeline' ? Number(current.pipeline_win_pct ?? 50) : '',
            project_start_date: exportDate(current.project_start_date),
            project_end_date: exportDate(current.project_end_date),
            pipeline_target_date: exportDate(current.pipeline_target_date),
            note: current.note || ''
        }, master, [
            ['project_code', 'Code'],
            ['description', 'Description'],
            ['customer_name', 'Customer'],
            ['status', 'Status'],
            ['pipeline_win_pct', '% to Win'],
            ['project_start_date', 'Start Date'],
            ['project_end_date', 'End Date'],
            ['pipeline_target_date', 'Pipeline Target Date'],
            ['note', 'Note']
        ]);
    }

    diffObject(changes, 'Subscription', currentSubscription, imported.subscription, [
        ['license_name', 'License Name'],
        ['license_start_date', 'Start Date'],
        ['license_end_date', 'End Date'],
        ['license_revenue', 'Revenue'],
        ['license_cost', 'Cost']
    ]);
    diffRows(changes, 'Perpetual SW MA', currentPerpetual, imported.perpetual_ma, [
        ['item_name', 'Item Name'],
        ['item_type', 'Type'],
        ['start_date', 'Start Date'],
        ['end_date', 'End Date'],
        ['revenue', 'Revenue'],
        ['cost', 'Cost']
    ]);
    diffRows(changes, 'Service MA', currentServiceMa, imported.service_ma, [
        ['description', 'Description'],
        ['start_date', 'Start Date'],
        ['end_date', 'End Date'],
        ['revenue', 'Revenue'],
        ['cost', 'Cost']
    ]);
    diffObject(changes, 'Implementation', currentImplementation, imported.implementation, [
        ['description', 'Description'],
        ['progress_last_year_pct', 'Progress Last Year'],
        ['progress_this_year_pct', 'Progress This Year'],
        ['revenue', 'Revenue'],
        ['cost', 'Cost']
    ]);
    diffObject(changes, 'Outsource', currentOutsource, imported.outsource, [
        ['outsource_type', 'Type'],
        ['description', 'Description'],
        ['start_date', 'Start Date'],
        ['end_date', 'End Date'],
        ['revenue', 'Revenue'],
        ['cost', 'Cost']
    ]);
    diffRows(changes, 'Outsource Monthly', currentOutsourceMonthly, imported.outsource_monthly, [
        ['year', 'Year'],
        ['month', 'Month'],
        ['revenue', 'Revenue'],
        ['cost', 'Cost']
    ]);
    return changes;
}

export default function ProjectManagement() {
    const { year } = useYear();
    const [list, setList] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [documentTypes, setDocumentTypes] = useState([]);
    const [editing, setEditing] = useState(null); // project being edited
    const [creating, setCreating] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('project_code_asc');
    const [exporting, setExporting] = useState(false);
    const [importReview, setImportReview] = useState(null);
    const [importing, setImporting] = useState(false);
    const importFileRef = useRef(null);

    async function load() {
        const [p, c, t] = await Promise.all([
            api.get(`/projects?year=${year}`),
            api.get('/customers'),
            api.get('/admin/project-attachment-types')
        ]);
        setList(p.data); setCustomers(c.data);
        setDocumentTypes(t.data || []);
    }
    useEffect(() => { load(); }, [year]);

    async function openProject(id) {
        const r = await api.get(`/projects/${id}`);
        setEditing(r.data);
    }

    async function deleteProject(id) {
        if (!confirm('Delete this project and all its data?')) return;
        await api.delete(`/projects/${id}`);
        toast.success('Deleted');
        load();
    }

    const filtered = useMemo(() => {
        let out = list;
        if (statusFilter !== 'all') {
            if (statusFilter === 'Win') out = out.filter(p => p.status === 'Win' || p.status === 'Backlog');
            else                        out = out.filter(p => p.status === statusFilter);
        }
        if (search) {
            const q = search.toLowerCase();
            out = out.filter(p =>
                (p.project_code || '').toLowerCase().includes(q) ||
                (p.description || '').toLowerCase().includes(q) ||
                (p.customer_alias || '').toLowerCase().includes(q)
            );
        }
        const cmpStr = (a, b) => (a || '').localeCompare(b || '');
        const cmpDate = (a, b) => {
            const da = a ? new Date(a).getTime() : 0;
            const db = b ? new Date(b).getTime() : 0;
            return da - db;
        };
        const sorted = [...out];
        switch (sortBy) {
            case 'project_code_asc':  sorted.sort((a, b) => cmpStr(a.project_code, b.project_code)); break;
            case 'project_code_desc': sorted.sort((a, b) => cmpStr(b.project_code, a.project_code)); break;
            case 'customer_asc':      sorted.sort((a, b) => cmpStr(a.customer_alias, b.customer_alias) ||
                                                            cmpStr(a.project_code, b.project_code)); break;
            case 'status':            sorted.sort((a, b) => cmpStr(a.status, b.status) ||
                                                            cmpStr(a.project_code, b.project_code)); break;
            case 'start_date_asc':    sorted.sort((a, b) => cmpDate(a.project_start_date, b.project_start_date)); break;
            case 'start_date_desc':   sorted.sort((a, b) => cmpDate(b.project_start_date, a.project_start_date)); break;
            case 'end_date_asc':      sorted.sort((a, b) => cmpDate(a.project_end_date, b.project_end_date)); break;
            case 'end_date_desc':     sorted.sort((a, b) => cmpDate(b.project_end_date, a.project_end_date)); break;
        }
        return sorted;
    }, [list, search, statusFilter, sortBy]);

    async function exportProjects() {
        if (filtered.length === 0) {
            toast.error('No projects to export');
            return;
        }
        setExporting(true);
        try {
            const details = await Promise.all(filtered.map(p => api.get(`/projects/${p.id}`).then(r => r.data)));
            const workbook = XLSX.utils.book_new();

            appendSheet(workbook, 'Projects', details.map(p => ({
                'Project Code': p.project_code || '',
                'Description': p.description || '',
                'Customer': p.customer_alias || '',
                'Customer Full Name': p.customer_full_name || '',
                'Status': p.status || '',
                '% to Win': p.status === 'Pipeline' ? moneyValue(p.pipeline_win_pct ?? 50) : '',
                'Start Date': exportDate(p.project_start_date),
                'End Date': exportDate(p.project_end_date),
                'Pipeline Target Date': exportDate(p.pipeline_target_date),
                'Note': p.note || ''
            })), [18, 38, 24, 34, 14, 12, 14, 14, 20, 36]);

            appendSheet(workbook, 'Subscription', details
                .filter(p => p.subscription)
                .map(p => ({
                    'Project Code': p.project_code || '',
                    'License Name': p.subscription.license_name || '',
                    'Start Date': exportDate(p.subscription.license_start_date),
                    'End Date': exportDate(p.subscription.license_end_date),
                    'Revenue': moneyValue(p.subscription.license_revenue),
                    'Cost': moneyValue(p.subscription.license_cost),
                    'ERP Code': p.subscription.erp_code || p.project_code || ''
                })), [18, 32, 14, 14, 16, 16, 18]);

            appendSheet(workbook, 'Perpetual SW MA', details.flatMap(p => (p.perpetual_ma || []).map(row => ({
                'Project Code': p.project_code || '',
                'Item Name': row.item_name || '',
                'Type': row.item_type || '',
                'Start Date': exportDate(row.start_date),
                'End Date': exportDate(row.end_date),
                'Revenue': moneyValue(row.revenue),
                'Cost': moneyValue(row.cost),
                'ERP Code': row.erp_code || p.project_code || ''
            }))), [18, 32, 14, 14, 14, 16, 16, 18]);

            appendSheet(workbook, 'Service MA', details.flatMap(p => (p.service_ma || []).map(row => ({
                'Project Code': p.project_code || '',
                'Description': row.description || '',
                'Start Date': exportDate(row.start_date),
                'End Date': exportDate(row.end_date),
                'Revenue': moneyValue(row.revenue),
                'Cost': moneyValue(row.cost),
                'ERP Code': row.erp_code || p.project_code || ''
            }))), [18, 36, 14, 14, 16, 16, 18]);

            appendSheet(workbook, 'Implementation', details
                .filter(p => p.implementation)
                .map(p => ({
                    'Project Code': p.project_code || '',
                    'Description': p.implementation.description || '',
                    'Progress Last Year': moneyValue(p.implementation.progress_last_year_pct),
                    'Progress This Year': moneyValue(p.implementation.progress_this_year_pct),
                    'Revenue': moneyValue(p.implementation.revenue),
                    'Cost': moneyValue(p.implementation.cost),
                    'ERP Code': p.implementation.erp_code || p.project_code || ''
                })), [18, 36, 18, 18, 16, 16, 18]);

            appendSheet(workbook, 'Outsource', details
                .filter(p => p.outsource)
                .map(p => ({
                    'Project Code': p.project_code || '',
                    'Type': p.outsource.outsource_type || '',
                    'Description': p.outsource.description || '',
                    'Start Date': exportDate(p.outsource.start_date),
                    'End Date': exportDate(p.outsource.end_date),
                    'Revenue': moneyValue(p.outsource.revenue),
                    'Cost': moneyValue(p.outsource.cost),
                    'ERP Code': p.outsource.erp_code || p.project_code || ''
                })), [18, 16, 36, 14, 14, 16, 16, 18]);

            appendSheet(workbook, 'Outsource Monthly', details.flatMap(p => ((p.outsource && p.outsource.months) || []).map(row => ({
                'Project Code': p.project_code || '',
                'Year': row.year || '',
                'Month': row.month || '',
                'Revenue': moneyValue(row.revenue),
                'Cost': moneyValue(row.cost)
            }))), [18, 10, 10, 16, 16]);

            const stamp = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(workbook, `Project_Management_${year}_${stamp}.xlsx`);
            toast.success(`Exported ${details.length} project(s)`);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    }

    async function chooseImportFile(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setImporting(true);
        try {
            const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
            const importedProjects = importWorkbook(workbook);
            if (importedProjects.length === 0) {
                toast.error('No project data found in this Excel file');
                return;
            }

            const all = await api.get('/projects');
            const byCode = new Map((all.data || []).map(p => [String(p.project_code || '').toLowerCase(), p]));
            const currentDetails = new Map();
            await Promise.all(importedProjects.map(async (project) => {
                const existing = byCode.get(project.project_code.toLowerCase());
                if (existing) {
                    const detail = await api.get(`/projects/${existing.id}`);
                    currentDetails.set(project.project_code.toLowerCase(), detail.data);
                }
            }));

            const items = importedProjects.map(project => {
                const current = currentDetails.get(project.project_code.toLowerCase()) || null;
                const changes = buildImportDiff(current, project);
                return {
                    project_code: project.project_code,
                    current,
                    imported: project,
                    status: current ? (changes.length ? 'updated' : 'nochange') : 'new',
                    changes,
                    applied: false,
                    applying: false,
                    error: ''
                };
            });
            setImportReview({ fileName: file.name, items });
        } catch (err) {
            toast.error(err.message || 'Import file failed');
        } finally {
            setImporting(false);
        }
    }

    async function ensureImportCustomerId(customerName) {
        const name = asString(customerName);
        if (!name) return null;
        const found = customers.find(c =>
            asString(c.alias).toLowerCase() === name.toLowerCase() ||
            asString(c.full_name).toLowerCase() === name.toLowerCase()
        );
        if (found) return found.id;
        const created = await api.post('/customers', { alias: name, full_name: name });
        setCustomers(prev => [...prev, created.data].sort((a, b) => asString(a.alias).localeCompare(asString(b.alias))));
        return created.data.id;
    }

    async function syncMultiRows(projectId, currentRows, importedRows, removeUrl, createUrl, toPayload) {
        for (const row of currentRows || []) {
            await api.delete(removeUrl(row));
        }
        for (const row of importedRows || []) {
            await api.post(createUrl(projectId), toPayload(row));
        }
    }

    async function applyImportItem(item) {
        if (!item || item.status === 'nochange' || item.applied) return;
        const customerId = await ensureImportCustomerId(item.imported.master.customer_name);
        const masterPayload = {
            project_code: item.imported.master.project_code,
            description: item.imported.master.description,
            customer_id: customerId,
            project_start_date: item.imported.master.project_start_date || null,
            project_end_date: item.imported.master.project_end_date || null,
            status: item.imported.master.status || 'Pipeline',
            pipeline_win_pct: Number(item.imported.master.pipeline_win_pct || 50),
            pipeline_target_date: item.imported.master.pipeline_target_date || null,
            note: item.imported.master.note || ''
        };
        let projectId = item.current?.id;
        if (projectId) {
            await api.put(`/projects/${projectId}`, masterPayload);
        } else {
            const created = await api.post('/projects', masterPayload);
            projectId = created.data.id;
        }

        if (item.imported.subscription) {
            await api.put(`/projects/${projectId}/subscription`, item.imported.subscription);
        } else if (item.current?.subscription) {
            await api.delete(`/projects/${projectId}/subscription`);
        }

        await syncMultiRows(
            projectId,
            item.current?.perpetual_ma || [],
            item.imported.perpetual_ma,
            row => `/projects/perpetual-ma/${row.id}`,
            id => `/projects/${id}/perpetual-ma`,
            row => row
        );

        await syncMultiRows(
            projectId,
            item.current?.service_ma || [],
            item.imported.service_ma,
            row => `/projects/service-ma/${row.id}`,
            id => `/projects/${id}/service-ma`,
            row => row
        );

        if (item.imported.implementation) {
            await api.put(`/projects/${projectId}/implementation`, item.imported.implementation);
        } else if (item.current?.implementation) {
            await api.delete(`/projects/${projectId}/implementation`);
        }

        if (item.imported.outsource) {
            await api.put(`/projects/${projectId}/outsource`, {
                ...item.imported.outsource,
                months: item.imported.outsource_monthly
            });
        } else if (item.current?.outsource) {
            await api.delete(`/projects/${projectId}/outsource`);
        }
    }

    async function confirmImport(projectCode = null) {
        if (!importReview) return;
        const targets = importReview.items.filter(item =>
            (!projectCode || item.project_code === projectCode) &&
            item.status !== 'nochange' &&
            !item.applied
        );
        if (targets.length === 0) return;
        setImporting(true);
        try {
            for (const target of targets) {
                setImportReview(prev => ({
                    ...prev,
                    items: prev.items.map(item => item.project_code === target.project_code ? { ...item, applying: true, error: '' } : item)
                }));
                try {
                    await applyImportItem(target);
                    setImportReview(prev => ({
                        ...prev,
                        items: prev.items.map(item => item.project_code === target.project_code ? { ...item, applying: false, applied: true, error: '' } : item)
                    }));
                } catch (err) {
                    setImportReview(prev => ({
                        ...prev,
                        items: prev.items.map(item => item.project_code === target.project_code ? {
                            ...item,
                            applying: false,
                            error: err.response?.data?.error || err.message || 'Import failed'
                        } : item)
                    }));
                }
            }
            await load();
            toast.success('Import completed');
        } finally {
            setImporting(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">Project Management</h1>
                <button className="btn-ghost ml-auto" disabled={exporting || filtered.length === 0} onClick={exportProjects}>
                    <ArrowDownTrayIcon className="w-4 h-4" /> {exporting ? 'Exporting...' : 'Export Excel'}
                </button>
                <button className="btn-ghost" disabled={importing} onClick={() => importFileRef.current?.click()}>
                    <ArrowUpTrayIcon className="w-4 h-4" /> {importing ? 'Reading...' : 'Import Excel'}
                </button>
                <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={chooseImportFile} />
                <button className="btn-primary" onClick={() => setCreating(true)}>
                    <PlusIcon className="w-4 h-4" /> New Project
                </button>
            </div>

            <div className="card p-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                    <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                        placeholder="Search code / description / customer..."
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-1.5">
                    <FunnelIcon className="w-4 h-4 text-indigo-500" />
                    <select className="input !w-auto !py-1.5 font-medium"
                            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="all">All Status</option>
                        <option value="Win">Win / Backlog</option>
                        <option value="Pipeline">Pipeline</option>
                        <option value="Loss">Loss</option>
                    </select>
                </div>
                <div className="flex items-center gap-1.5">
                    <ArrowsUpDownIcon className="w-4 h-4 text-indigo-500" />
                    <select className="input !w-auto !py-1.5 font-medium"
                            value={sortBy} onChange={e => setSortBy(e.target.value)}>
                        <option value="project_code_asc">Project Code (A → Z)</option>
                        <option value="project_code_desc">Project Code (Z → A)</option>
                        <option value="customer_asc">Customer (A → Z)</option>
                        <option value="status">Status</option>
                        <option value="start_date_desc">Start Date (newest first)</option>
                        <option value="start_date_asc">Start Date (oldest first)</option>
                        <option value="end_date_desc">End Date (newest first)</option>
                        <option value="end_date_asc">End Date (oldest first)</option>
                    </select>
                </div>
            </div>

            <div className="card overflow-x-auto">
                <table className="table-clean">
                    <thead>
                        <tr>
                            <th>Code</th><th>Description</th><th>Customer</th><th>Status</th>
                            <th>% to Win</th><th>Start</th><th>End</th><th>Pipeline Target</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(p => (
                            <tr key={p.id}>
                                <td className="font-mono text-xs">{p.project_code}</td>
                                <td className="max-w-[280px] truncate" title={p.description}>{p.description}</td>
                                <td>{p.customer_alias || '-'}</td>
                                <td><StatusPill status={p.status} /></td>
                                <td>{p.status === 'Pipeline' ? `${Number(p.pipeline_win_pct ?? 50).toFixed(0)}%` : '-'}</td>
                                <td>{formatDate(p.project_start_date)}</td>
                                <td>{formatDate(p.project_end_date)}</td>
                                <td>{formatDate(p.pipeline_target_date)}</td>
                                <td className="text-right">
                                    <button className="btn-ghost" onClick={() => openProject(p.id)}><PencilSquareIcon className="w-4 h-4" /></button>
                                    <button className="btn-ghost ml-1" onClick={() => deleteProject(p.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-6">No projects.</td></tr>}
                    </tbody>
                </table>
            </div>

            {creating && (
                <CreateProjectModal customers={customers} documentTypes={documentTypes} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); load(); openProject(id); }} />
            )}

            {editing && (
                <ProjectEditor project={editing} customers={customers} documentTypes={documentTypes} onClose={() => setEditing(null)} onSaved={async () => { await load(); const r = await api.get(`/projects/${editing.id}`); setEditing(r.data); }} year={year} />
            )}

            {importReview && (
                <ProjectImportReviewModal
                    review={importReview}
                    busy={importing}
                    onClose={() => setImportReview(null)}
                    onConfirmOne={code => confirmImport(code)}
                    onConfirmAll={() => confirmImport()}
                />
            )}
        </div>
    );
}

function ImportStatus({ status, applied, error }) {
    if (error) return <span className="pill bg-red-100 text-red-700 ring-red-200">Error</span>;
    if (applied) return <span className="pill bg-emerald-100 text-emerald-700 ring-emerald-200">Applied</span>;
    if (status === 'new') return <span className="pill bg-indigo-100 text-indigo-700 ring-indigo-200">New</span>;
    if (status === 'updated') return <span className="pill bg-amber-100 text-amber-700 ring-amber-200">Updated</span>;
    return <span className="pill bg-slate-100 text-slate-500 ring-slate-200">No Change</span>;
}

function ProjectImportReviewModal({ review, busy, onClose, onConfirmOne, onConfirmAll }) {
    const actionable = review.items.filter(item => item.status !== 'nochange' && !item.applied);
    return (
        <Modal open onClose={onClose} title={`Import Project Excel - ${review.fileName}`} size="xl"
               footer={<>
                   <button className="btn-ghost" disabled={busy} onClick={onClose}>Close</button>
                   <button className="btn-primary" disabled={busy || actionable.length === 0} onClick={onConfirmAll}>
                       Confirm All ({actionable.length})
                   </button>
               </>}>
            <div className="space-y-3">
                <div className="text-sm text-slate-500">
                    Review changes before import. Projects with no changes will be skipped automatically.
                </div>
                <div className="max-h-[70vh] overflow-auto space-y-3 pr-1">
                    {review.items.map(item => (
                        <div key={item.project_code} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="font-mono text-sm font-bold">{item.project_code}</div>
                                <ImportStatus status={item.status} applied={item.applied} error={item.error} />
                                <div className="text-xs text-slate-400">
                                    {item.current ? 'Existing project' : 'New project'}
                                </div>
                                {item.status !== 'nochange' && !item.applied && (
                                    <button className="btn-ghost ml-auto !py-1.5 text-xs"
                                            disabled={busy || item.applying}
                                            onClick={() => onConfirmOne(item.project_code)}>
                                        {item.applying ? 'Importing...' : 'Confirm This Project'}
                                    </button>
                                )}
                            </div>
                            {item.error && (
                                <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {item.error}
                                </div>
                            )}
                            {item.changes.length === 0 ? (
                                <div className="mt-2 text-sm text-slate-400">No data changes detected.</div>
                            ) : (
                                <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 space-y-1">
                                    {item.changes.map((change, idx) => (
                                        <li key={idx} className="break-words">{change}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}

// ---------- Create Project ----------
function defaultDocumentTypeId(types) {
    return (types || []).find(t => t.name === 'General')?.id || (types || [])[0]?.id || '';
}

function normalizedDocumentTypes(types) {
    return (types || []).length > 0 ? types : [{ id: '', name: 'General' }];
}

function withPipelineDefaults(form, status) {
    const next = { ...form, status };
    if (status === 'Pipeline' && (next.pipeline_win_pct === '' || next.pipeline_win_pct == null)) {
        next.pipeline_win_pct = 50;
    }
    return next;
}

function CreateProjectModal({ customers, documentTypes, onClose, onCreated }) {
    const fileRef = useRef(null);
    const [f, setF] = useState({
        project_code: '', description: '', customer_id: '',
        project_start_date: '', project_end_date: '',
        status: 'Pipeline', pipeline_win_pct: 50, pipeline_target_date: '', note: ''
    });
    const [attachments, setAttachments] = useState([]);
    const [documentTypeId, setDocumentTypeId] = useState(() => defaultDocumentTypeId(documentTypes));
    const [busy, setBusy] = useState(false);
    const [generatingCode, setGeneratingCode] = useState(false);

    useEffect(() => {
        if (!documentTypeId) setDocumentTypeId(defaultDocumentTypeId(documentTypes));
    }, [documentTypes, documentTypeId]);

    async function generateDummyCode() {
        setGeneratingCode(true);
        try {
            const r = await api.get('/projects/dummy-code');
            setF(s => ({ ...s, project_code: r.data.project_code || '' }));
            toast.success('Dummy project code generated');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Generate dummy code failed');
        } finally {
            setGeneratingCode(false);
        }
    }

    function chooseAttachments(e) {
        const selected = validProjectAttachmentFiles(Array.from(e.target.files || []));
        e.target.value = '';
        if (selected.length === 0) return;
        setAttachments(prev => [...prev, ...selected]);
    }

    function removePendingAttachment(idx) {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    }

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await api.post('/projects', {
                ...f, customer_id: f.customer_id ? Number(f.customer_id) : null,
                project_start_date: f.project_start_date || null,
                project_end_date:   f.project_end_date   || null,
                pipeline_win_pct: Number(f.pipeline_win_pct || 50),
                pipeline_target_date: f.pipeline_target_date || null
            });
            if (attachments.length > 0) {
                for (const file of attachments) {
                    await uploadProjectAttachment(r.data.id, file, documentTypeId);
                }
                toast.success(`Project created with ${attachments.length} attachment(s)`);
            } else {
                toast.success('Project created');
            }
            onCreated(r.data.id);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Create failed');
        } finally { setBusy(false); }
    }

    return (
        <Modal open onClose={onClose} title="New Project" size="lg"
               footer={<>
                   <button className="btn-ghost" onClick={onClose}>Cancel</button>
                   <button className="btn-primary" disabled={busy} onClick={submit}>Create</button>
               </>}>
            <form onSubmit={submit} className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                    <div className="flex items-center justify-between gap-2">
                        <label className="label">Project Code</label>
                        <button type="button" className="btn-ghost !py-1.5 text-xs"
                                disabled={generatingCode}
                                onClick={generateDummyCode}>
                            {generatingCode ? 'Generating...' : 'Gen Dummy Code'}
                        </button>
                    </div>
                    <input className="input" required value={f.project_code} onChange={e => setF({ ...f, project_code: e.target.value })} />
                </div>
                <div className="col-span-2"><label className="label">Description</label>
                    <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
                <div><label className="label">Customer</label>
                    <select className="input" value={f.customer_id} onChange={e => setF({ ...f, customer_id: e.target.value })}>
                        <option value="">—</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.alias} — {c.full_name}</option>)}
                    </select></div>
                <div><label className="label">Status</label>
                    <select className="input" value={f.status} onChange={e => setF(withPipelineDefaults(f, e.target.value))}>
                        <option>Pipeline</option><option>Win</option><option>Loss</option><option>Backlog</option>
                    </select></div>
                {f.status === 'Pipeline' && (
                    <div><label className="label">% to Win</label>
                        <input type="number" min="0" max="100" step="1" className="input"
                               value={f.pipeline_win_pct}
                               onChange={e => setF({ ...f, pipeline_win_pct: e.target.value })} /></div>
                )}
                <div><label className="label">Start Date</label>
                    <input type="date" className="input" value={f.project_start_date} onChange={e => setF({ ...f, project_start_date: e.target.value })} /></div>
                <div><label className="label">End Date</label>
                    <input type="date" className="input" value={f.project_end_date} onChange={e => setF({ ...f, project_end_date: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Pipeline Target Date</label>
                    <input type="date" className="input" value={f.pipeline_target_date} onChange={e => setF({ ...f, pipeline_target_date: e.target.value })} /></div>
                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 font-bold text-slate-700">
                            <PaperClipIcon className="w-5 h-5 text-indigo-500" /> Attachments
                        </div>
                        <select className="input !w-44 !py-1.5" value={documentTypeId}
                                onChange={e => setDocumentTypeId(e.target.value)}>
                            {normalizedDocumentTypes(documentTypes).map(t => <option key={t.id || t.name} value={t.id}>{t.name}</option>)}
                        </select>
                        <button type="button" className="btn-ghost ml-auto" disabled={busy} onClick={() => fileRef.current?.click()}>
                            <PlusIcon className="w-4 h-4" /> Add Files
                        </button>
                        <input ref={fileRef} type="file" multiple className="hidden" onChange={chooseAttachments} />
                    </div>
                    {attachments.length === 0 ? (
                        <div className="text-sm text-slate-400 mt-2">No files selected.</div>
                    ) : (
                        <div className="mt-3 space-y-2">
                            {attachments.map((file, idx) => (
                                <div key={`${file.name}-${idx}`} className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-3 py-2">
                                    <PaperClipIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-sm truncate">{file.name}</div>
                                        <div className="text-xs text-slate-400">{fileSize(file.size)} - {file.type || 'application/octet-stream'}</div>
                                    </div>
                                    <button type="button" className="btn-ghost !p-2" disabled={busy} onClick={() => removePendingAttachment(idx)}>
                                        <TrashIcon className="w-4 h-4 text-red-500" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-xs text-slate-400 mt-2">Files will be uploaded after the project is created.</p>
                </div>
            </form>
        </Modal>
    );
}

// ---------- Project Editor: master form on top + 5 revenue tabs below ----------
export function ProjectEditor({ project, customers, documentTypes, onClose, onSaved, year }) {
    const tabs = ['Subscription','Perpetual / SW MA','Service MA','Implementation','Outsource'];
    const [active, setActive] = useState('Subscription');
    return (
        <Modal open onClose={onClose} size="xl"
               title={`Edit — ${project.project_code} ${project.description ? '— ' + project.description : ''}`}>
            {/* Master form — always visible at the top */}
            <MasterForm project={project} customers={customers} onSaved={onSaved} />
            <ProjectAttachmentsPanel project={project} documentTypes={documentTypes} />

            {/* Tab strip for the 5 revenue types */}
            <div className="mt-6 border-b border-slate-200 flex flex-wrap gap-1">
                {tabs.map(t => (
                    <button key={t}
                        className={`px-4 py-2 text-sm rounded-t-md transition-colors ${
                            active === t
                                ? 'bg-brand-50 text-brand-700 font-semibold border-b-2 border-brand-500 -mb-px'
                                : 'text-slate-600 hover:bg-slate-100'
                        }`}
                        onClick={() => setActive(t)}>
                        {t}
                    </button>
                ))}
            </div>
            <div className="pt-4">
                {active === 'Subscription'      && <SubscriptionTab project={project} onSaved={onSaved} />}
                {active === 'Perpetual / SW MA' && <PerpetualTab project={project} onSaved={onSaved} />}
                {active === 'Service MA'        && <ServiceMATab project={project} onSaved={onSaved} />}
                {active === 'Implementation'    && <ImplementationTab project={project} onSaved={onSaved} />}
                {active === 'Outsource'         && <OutsourceTab project={project} year={year} onSaved={onSaved} />}
            </div>
        </Modal>
    );
}

function MasterForm({ project, customers, onSaved }) {
    const [f, setF] = useState({
        project_code: project.project_code,
        description: project.description || '',
        customer_id: project.customer_id || '',
        project_start_date: formatDate(project.project_start_date),
        project_end_date: formatDate(project.project_end_date),
        status: project.status,
        pipeline_win_pct: project.pipeline_win_pct ?? 50,
        pipeline_target_date: formatDate(project.pipeline_target_date),
        note: project.note || ''
    });
    const [saving, setSaving] = useState(false);
    async function save() {
        setSaving(true);
        try {
            await api.put(`/projects/${project.id}`, {
                ...f, customer_id: f.customer_id ? Number(f.customer_id) : null,
                project_start_date: f.project_start_date || null,
                project_end_date: f.project_end_date || null,
                pipeline_win_pct: Number(f.pipeline_win_pct || 50),
                pipeline_target_date: f.pipeline_target_date || null
            });
            toast.success('Project details saved');
            onSaved();
        } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
        finally { setSaving(false); }
    }
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Project Details</h3>
                <button className="btn-primary" disabled={saving} onClick={save}>
                    {saving ? 'Saving...' : 'Save Project'}
                </button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-gradient-to-br from-indigo-50/40 to-pink-50/40 border border-slate-200/70">
                <div className="col-span-2"><label className="label">Project Code</label>
                    <input className="input" value={f.project_code} onChange={e => setF({ ...f, project_code: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Description</label>
                    <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
                <div><label className="label">Customer</label>
                    <select className="input" value={f.customer_id} onChange={e => setF({ ...f, customer_id: e.target.value })}>
                        <option value="">—</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.alias} — {c.full_name}</option>)}
                    </select></div>
                <div><label className="label">Status</label>
                    <select className="input" value={f.status} onChange={e => setF(withPipelineDefaults(f, e.target.value))}>
                        <option>Pipeline</option><option>Win</option><option>Loss</option><option>Backlog</option>
                    </select></div>
                {f.status === 'Pipeline' && (
                    <div><label className="label">% to Win</label>
                        <input type="number" min="0" max="100" step="1" className="input"
                               value={f.pipeline_win_pct}
                               onChange={e => setF({ ...f, pipeline_win_pct: e.target.value })} /></div>
                )}
                <div><label className="label">Start Date</label>
                    <input type="date" className="input" value={f.project_start_date} onChange={e => setF({ ...f, project_start_date: e.target.value })} /></div>
                <div><label className="label">End Date</label>
                    <input type="date" className="input" value={f.project_end_date} onChange={e => setF({ ...f, project_end_date: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Pipeline Target Date</label>
                    <input type="date" className="input" value={f.pipeline_target_date} onChange={e => setF({ ...f, pipeline_target_date: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Note</label>
                    <textarea className="input" rows={2} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></div>
            </div>
        </div>
    );
}

function ProjectAttachmentsPanel({ project, documentTypes }) {
    const fileRef = useRef(null);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [updatingCategoryId, setUpdatingCategoryId] = useState(null);
    const [preview, setPreview] = useState(null);
    const [documentTypeId, setDocumentTypeId] = useState(() => defaultDocumentTypeId(documentTypes));

    async function load() {
        setLoading(true);
        try {
            const r = await api.get(`/projects/${project.id}/attachments`);
            setFiles(r.data || []);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not load attachments');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, [project.id]);
    useEffect(() => {
        if (!documentTypeId) setDocumentTypeId(defaultDocumentTypeId(documentTypes));
    }, [documentTypes, documentTypeId]);

    async function upload(e) {
        const selected = validProjectAttachmentFiles(Array.from(e.target.files || []));
        e.target.value = '';
        if (selected.length === 0) return;
        setUploading(true);
        try {
            for (const file of selected) {
                await uploadProjectAttachment(project.id, file, documentTypeId);
            }
            toast.success(`Uploaded ${selected.length} file(s)`);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    }

    async function remove(file) {
        if (!confirm(`Delete "${file.original_name}"?`)) return;
        try {
            await api.delete(`/projects/attachments/${file.id}`);
            toast.success('Attachment deleted');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
    }

    async function changeCategory(file, nextTypeId) {
        setUpdatingCategoryId(file.id);
        try {
            await api.put(`/projects/attachments/${file.id}/category`, {
                document_type_id: nextTypeId || null
            });
            toast.success('Attachment category updated');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Update category failed');
        } finally {
            setUpdatingCategoryId(null);
        }
    }

    async function openPreview(file) {
        try {
            const url = await fetchBlob(`/projects/attachments/${file.id}/preview`);
            setPreview({ ...file, url });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Preview failed');
        }
    }

    function closePreview() {
        if (preview?.url) URL.revokeObjectURL(preview.url);
        setPreview(null);
    }

    return (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex items-center gap-2 font-bold text-slate-700">
                    <PaperClipIcon className="w-5 h-5 text-indigo-500" /> Project Attachments
                </div>
                <select className="input !w-44 !py-1.5" value={documentTypeId}
                        onChange={e => setDocumentTypeId(e.target.value)}>
                    {normalizedDocumentTypes(documentTypes).map(t => <option key={t.id || t.name} value={t.id}>{t.name}</option>)}
                </select>
                <button type="button" className="btn-ghost ml-auto" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    <PlusIcon className="w-4 h-4" /> {uploading ? 'Uploading...' : 'Add Files'}
                </button>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={upload} />
            </div>
            {loading ? (
                <div className="text-sm text-slate-400 animate-pulse">Loading attachments...</div>
            ) : files.length === 0 ? (
                <div className="text-sm text-slate-400">No attachments.</div>
            ) : (
                <div className="space-y-2">
                    {files.map(file => (
                        <div key={file.id} className="flex items-center gap-2 rounded-md bg-white border border-slate-200 px-3 py-2">
                            <PaperClipIcon className="w-4 h-4 text-slate-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="font-semibold text-sm truncate">{file.original_name}</div>
                                <div className="text-xs text-slate-400">{file.document_type_name || 'General'} - {fileSize(file.file_size)} - {file.mime_type || 'application/octet-stream'}</div>
                            </div>
                            <select className="input !w-40 !py-1.5 text-xs"
                                    title="Attachment category"
                                    disabled={updatingCategoryId === file.id || uploading}
                                    value={file.document_type_id || defaultDocumentTypeId(documentTypes)}
                                    onChange={e => changeCategory(file, e.target.value)}>
                                {normalizedDocumentTypes(documentTypes).map(t => <option key={t.id || t.name} value={t.id}>{t.name}</option>)}
                            </select>
                            {canPreview(file) && (
                                <button className="btn-ghost !p-2" title="Preview" onClick={() => openPreview(file)}>
                                    <EyeIcon className="w-4 h-4 text-indigo-600" />
                                </button>
                            )}
                            <button className="btn-ghost !p-2" title="Download"
                                    onClick={() => downloadAttachment(`/projects/attachments/${file.id}/download`, file.original_name)}>
                                <ArrowDownTrayIcon className="w-4 h-4 text-emerald-600" />
                            </button>
                            <button className="btn-ghost !p-2" title="Delete" onClick={() => remove(file)}>
                                <TrashIcon className="w-4 h-4 text-red-500" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {preview && (
                <Modal open onClose={closePreview} title={`Preview - ${preview.original_name}`} size="xl">
                    {String(preview.mime_type || '').startsWith('image/') ? (
                        <img src={preview.url} alt={preview.original_name} className="max-h-[75vh] mx-auto object-contain" />
                    ) : (
                        <iframe src={preview.url} title={preview.original_name} className="w-full h-[75vh] rounded border border-slate-200" />
                    )}
                </Modal>
            )}
        </div>
    );
}

function ErpCodeField({ projectCode, className = 'col-span-2' }) {
    return (
        <div className={className}>
            <label className="label">ERP Code</label>
            <input className="input font-mono text-slate-500 bg-slate-50"
                   value={projectCode || ''}
                   disabled
                   readOnly />
        </div>
    );
}

function SubscriptionTab({ project, onSaved }) {
    const s = project.subscription || {};
    const [f, setF] = useState({
        license_name: s.license_name || '',
        license_start_date: formatDate(s.license_start_date) || formatDate(project.project_start_date),
        license_end_date:   formatDate(s.license_end_date)   || formatDate(project.project_end_date),
        license_revenue: s.license_revenue || 0,
        license_cost:    s.license_cost    || 0,
        erp_code: project.project_code || ''
    });
    async function save() {
        await api.put(`/projects/${project.id}/subscription`, f);
        toast.success('Saved'); onSaved();
    }
    async function remove() {
        if (!confirm('Remove subscription details?')) return;
        await api.delete(`/projects/${project.id}/subscription`);
        toast.success('Removed'); onSaved();
    }
    return (
        <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">License Name</label>
                <input className="input" value={f.license_name} onChange={e => setF({ ...f, license_name: e.target.value })} /></div>
            <div><label className="label">License Start Date</label>
                <input type="date" className="input" value={f.license_start_date} onChange={e => setF({ ...f, license_start_date: e.target.value })} /></div>
            <div><label className="label">License End Date</label>
                <input type="date" className="input" value={f.license_end_date} onChange={e => setF({ ...f, license_end_date: e.target.value })} /></div>
            <div><label className="label">License Revenue (Baht)</label>
                <input type="number" className="input" value={f.license_revenue} onChange={e => setF({ ...f, license_revenue: e.target.value })} /></div>
            <div><label className="label">License Cost (Baht)</label>
                <input type="number" className="input" value={f.license_cost} onChange={e => setF({ ...f, license_cost: e.target.value })} /></div>
            <ErpCodeField projectCode={project.project_code} />
            <div className="col-span-2 flex justify-end gap-2">
                {project.subscription && <button className="btn-danger" onClick={remove}>Remove</button>}
                <button className="btn-primary" onClick={save}>Save Subscription</button>
            </div>
        </div>
    );
}

function PerpetualTab({ project, onSaved }) {
    const [rows, setRows] = useState(project.perpetual_ma || []);
    const [draft, setDraft] = useState(null);
    function startNew() {
        setDraft({ id: null, item_name: '', item_type: 'License',
            start_date: formatDate(project.project_start_date),
            end_date:   formatDate(project.project_end_date),
            revenue: 0, cost: 0, erp_code: project.project_code || '' });
    }
    async function saveDraft() {
        try {
            if (draft.id) {
                await api.put(`/projects/perpetual-ma/${draft.id}`, draft);
            } else {
                await api.post(`/projects/${project.id}/perpetual-ma`, draft);
            }
            toast.success('Saved');
            setDraft(null); onSaved();
        } catch (err) { toast.error('Save failed'); }
    }
    async function remove(id) {
        if (!confirm('Delete row?')) return;
        await api.delete(`/projects/perpetual-ma/${id}`);
        toast.success('Removed'); onSaved();
    }
    return (
        <div className="space-y-3">
            <div className="flex justify-between"><h4 className="font-medium">Perpetual / SW MA items</h4>
                <button className="btn-primary" onClick={startNew}><PlusIcon className="w-4 h-4" /> Add</button></div>
            <table className="table-clean">
                <thead><tr><th>Name</th><th>Type</th><th>Start</th><th>End</th><th className="text-right">Revenue</th><th className="text-right">Cost</th><th></th></tr></thead>
                <tbody>
                    {(project.perpetual_ma || []).map(r => (
                        <tr key={r.id}>
                            <td>{r.item_name}</td><td>{r.item_type}</td>
                            <td>{formatDate(r.start_date)}</td><td>{formatDate(r.end_date)}</td>
                            <td className="text-right tabular-nums">{baht(r.revenue)}</td>
                            <td className="text-right tabular-nums">{baht(r.cost)}</td>
                            <td className="text-right">
                                <button className="btn-ghost" onClick={() => setDraft({ ...r, start_date: formatDate(r.start_date), end_date: formatDate(r.end_date) })}><PencilSquareIcon className="w-4 h-4" /></button>
                                <button className="btn-ghost ml-1" onClick={() => remove(r.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {draft && (
                <div className="border border-slate-200 rounded p-3 grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className="label">Name</label>
                        <input className="input" value={draft.item_name} onChange={e => setDraft({ ...draft, item_name: e.target.value })} /></div>
                    <div><label className="label">Type</label>
                        <select className="input" value={draft.item_type} onChange={e => setDraft({ ...draft, item_type: e.target.value })}>
                            <option>License</option><option>MA</option>
                        </select></div>
                    <ErpCodeField projectCode={project.project_code} className="" />
                    <div><label className="label">Start</label>
                        <input type="date" className="input" value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} /></div>
                    <div><label className="label">End</label>
                        <input type="date" className="input" value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></div>
                    <div><label className="label">Revenue</label>
                        <input type="number" className="input" value={draft.revenue} onChange={e => setDraft({ ...draft, revenue: e.target.value })} /></div>
                    <div><label className="label">Cost</label>
                        <input type="number" className="input" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value })} /></div>
                    <div className="col-span-2 flex justify-end gap-2">
                        <button className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
                        <button className="btn-primary" onClick={saveDraft}>Save</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ServiceMATab({ project, onSaved }) {
    const [draft, setDraft] = useState(null);
    function startNew() {
        setDraft({ id: null, description: '',
            start_date: formatDate(project.project_start_date),
            end_date: formatDate(project.project_end_date),
            revenue: 0, cost: 0, erp_code: project.project_code || '' });
    }
    async function saveDraft() {
        if (draft.id) await api.put(`/projects/service-ma/${draft.id}`, draft);
        else await api.post(`/projects/${project.id}/service-ma`, draft);
        toast.success('Saved'); setDraft(null); onSaved();
    }
    async function remove(id) {
        if (!confirm('Delete row?')) return;
        await api.delete(`/projects/service-ma/${id}`);
        toast.success('Removed'); onSaved();
    }
    return (
        <div className="space-y-3">
            <div className="flex justify-between"><h4 className="font-medium">Service MA items</h4>
                <button className="btn-primary" onClick={startNew}><PlusIcon className="w-4 h-4" /> Add</button></div>
            <table className="table-clean">
                <thead><tr><th>Description</th><th>Start</th><th>End</th><th className="text-right">Revenue</th><th className="text-right">Cost</th><th></th></tr></thead>
                <tbody>
                    {(project.service_ma || []).map(r => (
                        <tr key={r.id}>
                            <td>{r.description}</td>
                            <td>{formatDate(r.start_date)}</td><td>{formatDate(r.end_date)}</td>
                            <td className="text-right tabular-nums">{baht(r.revenue)}</td>
                            <td className="text-right tabular-nums">{baht(r.cost)}</td>
                            <td className="text-right">
                                <button className="btn-ghost" onClick={() => setDraft({ ...r, start_date: formatDate(r.start_date), end_date: formatDate(r.end_date) })}><PencilSquareIcon className="w-4 h-4" /></button>
                                <button className="btn-ghost ml-1" onClick={() => remove(r.id)}><TrashIcon className="w-4 h-4 text-red-500" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {draft && (
                <div className="border border-slate-200 rounded p-3 grid grid-cols-2 gap-3">
                    <div className="col-span-2"><label className="label">Description</label>
                        <input className="input" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></div>
                    <div><label className="label">Start</label>
                        <input type="date" className="input" value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} /></div>
                    <div><label className="label">End</label>
                        <input type="date" className="input" value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></div>
                    <div><label className="label">Revenue</label>
                        <input type="number" className="input" value={draft.revenue} onChange={e => setDraft({ ...draft, revenue: e.target.value })} /></div>
                    <div><label className="label">Cost</label>
                        <input type="number" className="input" value={draft.cost} onChange={e => setDraft({ ...draft, cost: e.target.value })} /></div>
                    <ErpCodeField projectCode={project.project_code} />
                    <div className="col-span-2 flex justify-end gap-2">
                        <button className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
                        <button className="btn-primary" onClick={saveDraft}>Save</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ImplementationTab({ project, onSaved }) {
    const i = project.implementation || {};
    const [f, setF] = useState({
        description: i.description || '',
        progress_last_year_pct: i.progress_last_year_pct ?? 0,
        progress_this_year_pct: i.progress_this_year_pct ?? 0,
        revenue: i.revenue || 0,
        cost: i.cost || 0,
        erp_code: project.project_code || ''
    });
    async function save() {
        await api.put(`/projects/${project.id}/implementation`, f);
        toast.success('Saved'); onSaved();
    }
    async function remove() {
        if (!confirm('Remove implementation row?')) return;
        await api.delete(`/projects/${project.id}/implementation`);
        toast.success('Removed'); onSaved();
    }
    return (
        <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Description</label>
                <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            <div><label className="label">% Progress (Last Year) [0..1]</label>
                <input type="number" step="0.01" min="0" max="1" className="input" value={f.progress_last_year_pct} onChange={e => setF({ ...f, progress_last_year_pct: e.target.value })} /></div>
            <div><label className="label">% Progress (This Year) [0..1]</label>
                <input type="number" step="0.01" min="0" max="1" className="input" value={f.progress_this_year_pct} onChange={e => setF({ ...f, progress_this_year_pct: e.target.value })} /></div>
            <div><label className="label">Revenue</label>
                <input type="number" className="input" value={f.revenue} onChange={e => setF({ ...f, revenue: e.target.value })} /></div>
            <div><label className="label">Cost</label>
                <input type="number" className="input" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></div>
            <ErpCodeField projectCode={project.project_code} />
            <div className="col-span-2 flex justify-end gap-2">
                {project.implementation && <button className="btn-danger" onClick={remove}>Remove</button>}
                <button className="btn-primary" onClick={save}>Save Implementation</button>
            </div>
        </div>
    );
}

function OutsourceTab({ project, year, onSaved }) {
    const o = project.outsource || {};
    const [type, setType] = useState(o.outsource_type || 'Man-Year');
    const [f, setF] = useState({
        description: o.description || '',
        erp_code: project.project_code || '',
        start_date: formatDate(o.start_date) || formatDate(project.project_start_date),
        end_date:   formatDate(o.end_date)   || formatDate(project.project_end_date),
        revenue: o.revenue || 0,
        cost:    o.cost    || 0
    });
    const [months, setMonths] = useState(() => {
        const out = [];
        for (let m = 1; m <= 12; m++) {
            const found = (o.months || []).find(x => x.year === year && x.month === m);
            out.push({ year, month: m, revenue: found?.revenue || 0, cost: found?.cost || 0 });
        }
        return out;
    });

    async function save() {
        const body = { outsource_type: type, description: f.description, erp_code: f.erp_code };
        if (type === 'Man-Year') {
            body.start_date = f.start_date || null;
            body.end_date   = f.end_date   || null;
            body.revenue    = Number(f.revenue);
            body.cost       = Number(f.cost);
        } else {
            body.months = months.map(m => ({ ...m, revenue: Number(m.revenue), cost: Number(m.cost) }));
        }
        await api.put(`/projects/${project.id}/outsource`, body);
        toast.success('Saved'); onSaved();
    }
    async function remove() {
        if (!confirm('Remove outsource row?')) return;
        await api.delete(`/projects/${project.id}/outsource`);
        toast.success('Removed'); onSaved();
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Outsource Type</label>
                    <select className="input" value={type} onChange={e => setType(e.target.value)}>
                        <option>Man-Year</option><option>Man-Month</option>
                    </select></div>
                <ErpCodeField projectCode={project.project_code} className="" />
                <div className="col-span-2"><label className="label">Description</label>
                    <input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
            </div>

            {type === 'Man-Year' ? (
                <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Start</label>
                        <input type="date" className="input" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} /></div>
                    <div><label className="label">End</label>
                        <input type="date" className="input" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></div>
                    <div><label className="label">Revenue</label>
                        <input type="number" className="input" value={f.revenue} onChange={e => setF({ ...f, revenue: e.target.value })} /></div>
                    <div><label className="label">Cost</label>
                        <input type="number" className="input" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} /></div>
                </div>
            ) : (
                <div>
                    <div className="text-sm text-slate-600 mb-2">Enter Revenue and Cost for each month of {year}.</div>
                    <table className="table-clean">
                        <thead><tr><th>Month</th><th className="text-right">Revenue</th><th className="text-right">Cost</th></tr></thead>
                        <tbody>
                            {months.map((m, idx) => (
                                <tr key={m.month}>
                                    <td>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m.month-1]}</td>
                                    <td className="text-right">
                                        <input type="number" className="input !text-right" value={m.revenue} onChange={e => {
                                            const arr = [...months]; arr[idx].revenue = e.target.value; setMonths(arr);
                                        }} /></td>
                                    <td className="text-right">
                                        <input type="number" className="input !text-right" value={m.cost} onChange={e => {
                                            const arr = [...months]; arr[idx].cost = e.target.value; setMonths(arr);
                                        }} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex justify-end gap-2">
                {project.outsource && <button className="btn-danger" onClick={remove}>Remove</button>}
                <button className="btn-primary" onClick={save}>Save Outsource</button>
            </div>
        </div>
    );
}
