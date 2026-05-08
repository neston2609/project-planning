import { MagnifyingGlassIcon, FunnelIcon, ArrowsUpDownIcon } from '@heroicons/react/24/outline';

const SORT_OPTIONS = [
    { value: 'project_code',      label: 'Project Code (A → Z)' },
    { value: 'project_code_desc', label: 'Project Code (Z → A)' },
    { value: 'customer',          label: 'Customer (A → Z)' },
    { value: 'customer_desc',     label: 'Customer (Z → A)' },
    { value: 'status',            label: 'Status' },
    { value: 'revenue_desc',      label: 'Revenue High → Low' },
    { value: 'revenue_asc',       label: 'Revenue Low → High' },
    { value: 'rec_revenue_desc',  label: 'Recognized Revenue High → Low' },
    { value: 'rec_revenue_asc',   label: 'Recognized Revenue Low → High' },
    { value: 'rec_gm_desc',       label: 'Recognized GM High → Low' },
    { value: 'rec_gm_asc',        label: 'Recognized GM Low → High' }
];

const STATUS_OPTIONS = [
    { value: 'all',      label: 'All Status' },
    { value: 'Win',      label: 'Win / Backlog' },
    { value: 'Pipeline', label: 'Pipeline' }
];

export default function FilterBar({
    search, onSearchChange, searchPlaceholder = 'Search by code / description / customer...',
    status = 'all', onStatusChange,
    sortBy = 'project_code', onSortByChange,
    children
}) {
    return (
        <div className="card p-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <MagnifyingGlassIcon className="w-5 h-5 text-slate-400" />
                <input className="input !border-0 !bg-transparent !p-0 focus:!ring-0 flex-1"
                    placeholder={searchPlaceholder}
                    value={search} onChange={e => onSearchChange(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
                <FunnelIcon className="w-4 h-4 text-indigo-500" />
                <select className="input !w-auto !py-1.5 !pl-2 !pr-8 font-medium"
                        value={status} onChange={e => onStatusChange?.(e.target.value)}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
            <div className="flex items-center gap-1.5">
                <ArrowsUpDownIcon className="w-4 h-4 text-indigo-500" />
                <select className="input !w-auto !py-1.5 !pl-2 !pr-8 font-medium"
                        value={sortBy} onChange={e => onSortByChange?.(e.target.value)}>
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
            {children}
        </div>
    );
}
