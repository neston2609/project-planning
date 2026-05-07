import { baht } from '../format';

/**
 * Header for a dashboard page.
 *  - title: page title (will be rendered with the brand gradient)
 *  - subtitle: small grey caption beneath
 *  - tiles: array of { label, value, accent: 'blue'|'purple'|'green'|'amber'|'rose', hint? }
 *  - currency: if true, value is shown via baht() (number); if false, raw string
 */
export default function DashboardHeader({ title, subtitle, tiles = [], currency = true }) {
    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900">
                    <span className="brand-mark">{title}</span>
                </h1>
                {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
            </div>
            {tiles.length > 0 && (
                <div className={`grid grid-cols-2 ${
                    tiles.length === 1 ? 'md:grid-cols-1'
                  : tiles.length === 2 ? 'md:grid-cols-2'
                  : tiles.length === 3 ? 'md:grid-cols-3'
                  : 'md:grid-cols-4'
                } gap-4`}>
                    {tiles.map((t, i) => (
                        <div key={i} className={`kpi kpi-${t.accent || 'blue'}`}>
                            <div className="text-[11px] uppercase tracking-wider opacity-80">{t.label}</div>
                            <div className="text-2xl font-extrabold tabular-nums mt-2">
                                {currency && typeof t.value === 'number' ? baht(t.value) : t.value}
                            </div>
                            {t.hint && <div className="text-xs opacity-80 mt-1">{t.hint}</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
