/**
 * Inline horizontal progress bar with a numeric label.
 *  - value: 0..1 fraction
 *  - tone: 'auto' (green/amber/blue based on value) or explicit colour
 */
export default function ProgressCell({ value, tone = 'auto' }) {
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    const pct = (v * 100).toFixed(1);

    let bg = 'linear-gradient(90deg, #6366f1, #8b5cf6)';
    if (tone === 'auto') {
        if (v >= 0.85)      bg = 'linear-gradient(90deg, #10b981, #14b8a6)';   // green
        else if (v >= 0.5)  bg = 'linear-gradient(90deg, #6366f1, #8b5cf6)';   // indigo
        else if (v > 0)     bg = 'linear-gradient(90deg, #f59e0b, #f97316)';   // amber
        else                bg = 'linear-gradient(90deg, #cbd5e1, #94a3b8)';   // grey
    }

    return (
        <div className="flex items-center gap-2 min-w-[120px]">
            <div className="relative flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                     style={{ width: `${pct}%`, backgroundImage: bg }} />
            </div>
            <span className="text-xs font-semibold tabular-nums text-slate-700 w-10 text-right">{pct}%</span>
        </div>
    );
}
