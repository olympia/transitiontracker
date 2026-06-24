import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, PieChart, TrendingUp } from "lucide-react";
import { api } from "../api";
import { Spinner, EmptyState } from "../components/ui.jsx";

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(Math.round(n));
}
function pct(x) {
  if (!isFinite(x)) return "0%";
  return `${Math.round(x * 100)}%`;
}
function monthAmount(it, m, field) {
  const v = Number(m[`${field}_value`]) || 0;
  return it.item_type === "manday" ? v * (Number(it.daily_rate) || 0) : v;
}

export default function FinancialReport({ project }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setData(await api.financeData(project.id));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const base = data?.[0]?.project.base_currency || project.base_currency || "";

  const model = useMemo(() => {
    if (!data || data.length === 0) return null;
    // monthly timeline across all years, chronological
    let months = [];
    for (const yd of data) {
      const cutoff = yd.year.forecast_from_month ?? 1;
      for (let mo = 1; mo <= 12; mo++) {
        let budget = 0; // original budget (regular items, no CRs)
        let budgetCrs = 0; // budget incl. CR rows
        let realized = 0; // actual (elapsed) or forecast (future)
        for (const leg of yd.legs)
          for (const it of leg.items) {
            const mm = it.months.find((x) => x.month === mo);
            if (!mm) continue;
            const bv = monthAmount(it, mm, "budget");
            budgetCrs += bv;
            if (!it.is_cr) {
              budget += bv;
              realized += monthAmount(it, mm, "realized");
            }
          }
        months.push({
          label: `${String(mo).padStart(2, "0")}.${yd.year.year}`,
          budget,
          budgetCrs,
          realized,
          isForecast: mo >= cutoff,
        });
      }
    }
    // trim leading/trailing all-zero months
    const nz = (m) => m.budget || m.budgetCrs || m.realized;
    let s = months.findIndex(nz);
    let e = months.length - 1;
    while (e >= 0 && !nz(months[e])) e--;
    months = s === -1 ? [] : months.slice(s, e + 1);
    // cumulative curves
    let cb = 0;
    let cbc = 0;
    let cr = 0;
    for (const m of months) {
      cb += m.budget;
      cbc += m.budgetCrs;
      cr += m.realized;
      m.cumBudget = cb;
      m.cumBudgetCrs = cbc;
      m.cumRealized = cr;
    }

    // utilization figures (all years)
    let actualTot = 0;
    let obligo = 0;
    let open = 0;
    let regBudget = 0;
    let crBudget = 0;
    for (const yd of data) {
      const cutoff = yd.year.forecast_from_month ?? 1;
      for (const leg of yd.legs)
        for (const it of leg.items)
          for (const mm of it.months) {
            const bv = monthAmount(it, mm, "budget");
            if (it.is_cr) crBudget += bv;
            else regBudget += bv;
            if (it.is_cr) continue;
            const rv = monthAmount(it, mm, "realized");
            if (mm.month < cutoff) actualTot += rv;
            else if (mm.po_committed) obligo += rv;
            else open += rv;
          }
    }
    const budgetWithCrs = regBudget + crBudget;
    return { months, actualTot, obligo, open, budgetWithCrs };
  }, [data]);

  if (loading && !data) return <Spinner />;
  if (!model || model.months.length === 0)
    return (
      <EmptyState
        icon={BarChart3}
        title="No financial data yet"
        subtitle="Add budget years and monthly values in Budget Details to see the report."
      />
    );

  const { months, actualTot, obligo, open, budgetWithCrs } = model;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-1 flex items-center gap-2">
          <TrendingUp size={18} className="text-brand-600" />
          <h2 className="text-lg font-extrabold">Project Budget Forecast</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Monthly Budget / Actual / Forecast (bars) and cumulative curves (lines), in {base}.
        </p>
        <div className="card p-4">
          <ComboChart months={months} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-1 flex items-center gap-2">
            <PieChart size={18} className="text-brand-600" />
            <h2 className="text-lg font-extrabold">Capex Utilization</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">Actual, Obligo (PO) and open forecast.</p>
          <div className="card p-5">
            <Doughnut actual={actualTot} obligo={obligo} open={open} base={base} />
          </div>
        </section>

        <section>
          <div className="mb-1 flex items-center gap-2">
            <BarChart3 size={18} className="text-brand-600" />
            <h2 className="text-lg font-extrabold">CAPEX Utilization</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">Share of budget with CRs ({fmt(budgetWithCrs)} {base}).</p>
          <div className="card p-5">
            <UtilBars actual={actualTot} obligo={obligo} open={open} budget={budgetWithCrs} />
          </div>
        </section>
      </div>
    </div>
  );
}

// tight axis: ~4 intervals, rounded to a clean step just above the data max
function axisScale(v) {
  if (v <= 0) return { max: 1, ticks: [0, 1] };
  const raw = v / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  const step = nice * mag;
  const max = Math.ceil(v / step) * step;
  const ticks = [];
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(t);
  return { max, ticks };
}

// Catmull-Rom → cubic Bézier, for smooth curves through the points
function smoothPath(pts) {
  if (!pts.length) return "";
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function ComboChart({ months }) {
  const [hover, setHover] = useState(null);
  const H = 340;
  const padL = 56;
  const padR = 20;
  const padT = 16;
  const padB = 64;
  const colW = Math.max(46, Math.min(78, 760 / Math.max(months.length, 1)));
  const W = padL + padR + months.length * colW;
  const innerH = H - padT - padB;

  const { max: maxVal, ticks } = axisScale(
    Math.max(1, ...months.flatMap((m) => [m.budgetCrs, m.realized, m.cumBudget, m.cumBudgetCrs, m.cumRealized]))
  );
  const y = (v) => padT + innerH - (v / maxVal) * innerH;
  const base = padT + innerH;

  const cx = (i) => padL + i * colW + colW / 2;
  const bw = Math.max(7, colW * 0.22);
  const innerGap = Math.max(3, colW * 0.08);
  const groupW = 2 * bw + innerGap;
  const budgetCx = (i) => cx(i) - groupW / 2 + bw / 2;
  const realCx = (i) => cx(i) - groupW / 2 + bw + innerGap + bw / 2;

  const bcrsPts = months.map((m, i) => [budgetCx(i), y(m.cumBudgetCrs)]);
  const bPts = months.map((m, i) => [budgetCx(i), y(m.cumBudget)]);
  const rPts = months.map((m, i) => [realCx(i), y(m.cumRealized)]);
  const areaUnder = (pts) =>
    pts.length ? `${smoothPath(pts)} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z` : "";

  // where green (actual) turns to orange (forecast) along the realized line
  const ffi = months.findIndex((m) => m.isForecast);
  const rx0 = realCx(0);
  const rxN = realCx(months.length - 1);
  const cutFrac =
    ffi < 0 ? 1 : ffi === 0 ? 0 : Math.max(0, Math.min(1, (realCx(ffi) - rx0) / Math.max(1, rxN - rx0)));

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ width: W }} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} className="block">
        <defs>
          <linearGradient id="frBudgetArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3366ff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#3366ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="frRealStroke" gradientUnits="userSpaceOnUse" x1={rx0} y1="0" x2={rxN} y2="0">
            <stop offset="0" stopColor="#10b981" />
            <stop offset={cutFrac} stopColor="#10b981" />
            <stop offset={cutFrac} stopColor="#f97316" />
            <stop offset="1" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="frRealArea" gradientUnits="userSpaceOnUse" x1={rx0} y1="0" x2={rxN} y2="0">
            <stop offset="0" stopColor="#10b981" stopOpacity="0.16" />
            <stop offset={cutFrac} stopColor="#10b981" stopOpacity="0.16" />
            <stop offset={cutFrac} stopColor="#f97316" stopOpacity="0.16" />
            <stop offset="1" stopColor="#f97316" stopOpacity="0.16" />
          </linearGradient>
          <filter id="frGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-slate-100 dark:stroke-slate-800/70" strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-400" fontSize="10">
              {fmtShort(t)}
            </text>
          </g>
        ))}

        {/* soft area fills */}
        <path d={areaUnder(rPts)} fill="url(#frRealArea)" />
        <path d={areaUnder(bcrsPts)} fill="url(#frBudgetArea)" />

        {months.map((m, i) => {
          const left = cx(i) - groupW / 2;
          return (
            <g key={m.label}>
              <rect x={left} y={y(m.budgetCrs)} width={bw} height={base - y(m.budgetCrs)} className="fill-slate-300/60 dark:fill-slate-500/40" rx="2.5">
                <title>{m.label} Budget (with CRs): {fmt(m.budgetCrs)}</title>
              </rect>
              <rect
                x={left + bw + innerGap}
                y={y(m.realized)}
                width={bw}
                height={base - y(m.realized)}
                className={m.isForecast ? "fill-orange-300/60 dark:fill-orange-400/30" : "fill-emerald-300/60 dark:fill-emerald-400/30"}
                rx="2.5"
              >
                <title>{m.label} {m.isForecast ? "Forecast" : "Actual"}: {fmt(m.realized)}</title>
              </rect>
              <text
                x={cx(i)}
                y={H - padB + 16}
                textAnchor={months.length > 8 ? "end" : "middle"}
                className="fill-slate-400"
                fontSize="10"
                transform={months.length > 8 ? `rotate(-40 ${cx(i)} ${H - padB + 16})` : undefined}
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* cumulative original budget — thin, secondary */}
        <path d={smoothPath(bPts)} fill="none" className="stroke-slate-400/80" strokeWidth="1.6" strokeDasharray="4 4" />
        {/* cumulative budget with CRs — hero, glowing */}
        <path d={smoothPath(bcrsPts)} fill="none" stroke="#3366ff" strokeWidth="2.6" strokeLinecap="round" filter="url(#frGlow)" />
        {/* cumulative actual → forecast — gradient, glowing */}
        <path d={smoothPath(rPts)} fill="none" stroke="url(#frRealStroke)" strokeWidth="2.6" strokeLinecap="round" filter="url(#frGlow)" />

        {/* point markers above each bar */}
        {months.map((m, i) => (
          <g key={`d${i}`}>
            <circle cx={budgetCx(i)} cy={y(m.cumBudgetCrs)} r={hover === i ? 3.6 : 2.6} fill="#3366ff" />
            <circle cx={realCx(i)} cy={y(m.cumRealized)} r={hover === i ? 3.6 : 2.6} fill={m.isForecast ? "#f97316" : "#10b981"} />
          </g>
        ))}

        {/* hover guide + capture zones (on top) */}
        {hover != null && (
          <line x1={cx(hover)} x2={cx(hover)} y1={padT} y2={base} className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {months.map((m, i) => (
          <rect key={`hz${i}`} x={padL + i * colW} y={padT} width={colW} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white/95 p-2 text-[11px] shadow-soft backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
          style={{ left: Math.min(Math.max(cx(hover), 92), W - 92), top: 6 }}
        >
          <div className="mb-1 font-bold">{months[hover].label}</div>
          <TipRow dot="#94a3b8" label="Budget (CR)" v={months[hover].budgetCrs} />
          <TipRow
            dot={months[hover].isForecast ? "#f97316" : "#10b981"}
            label={months[hover].isForecast ? "Forecast" : "Actual"}
            v={months[hover].realized}
          />
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <TipRow dot="#94a3b8" label="Cum. Budget" v={months[hover].cumBudget} />
          <TipRow dot="#3366ff" label="Cum. Budget CR" v={months[hover].cumBudgetCrs} />
          <TipRow
            dot={months[hover].isForecast ? "#f97316" : "#10b981"}
            label="Cum. Act/FC"
            v={months[hover].cumRealized}
          />
        </div>
      )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
        <Legend cls="bg-slate-300/60 dark:bg-slate-500/40" label="Monthly Budget (with CRs)" />
        <Legend cls="bg-emerald-300/60 dark:bg-emerald-400/30" label="Monthly Actual" />
        <Legend cls="bg-orange-300/60 dark:bg-orange-400/30" label="Monthly Forecast" />
        <span className="ml-2 flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-slate-400" /> Cum. Budget</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 rounded bg-brand-500" /> Cum. Budget (with CRs)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 rounded bg-gradient-to-r from-emerald-500 to-orange-500" /> Cum. Actual → Forecast</span>
      </div>
    </div>
  );
}

function fmtShort(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(0) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return String(Math.round(n));
}

function Legend({ cls, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${cls}`} /> {label}
    </span>
  );
}

function TipRow({ dot, label, v }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="flex-1 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="tabular-nums font-semibold">{fmt(v)}</span>
    </div>
  );
}

function donutArc(cx, cy, rO, rI, a0, a1) {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(rO, a0);
  const [x1, y1] = p(rO, a1);
  const [x2, y2] = p(rI, a1);
  const [x3, y3] = p(rI, a0);
  return `M${x0},${y0} A${rO},${rO} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rI},${rI} 0 ${large} 0 ${x3},${y3} Z`;
}

function Doughnut({ actual, obligo, open, base }) {
  const total = actual + obligo + open;
  const segs = [
    { label: "Actual", value: actual, cls: "fill-emerald-500" },
    { label: "Obligo (PO)", value: obligo, cls: "fill-sky-500" },
    { label: "Open forecast", value: open, cls: "fill-slate-400" },
  ];
  const cx = 90;
  const cy = 90;
  const rO = 80;
  const rI = 50;
  let a = -Math.PI / 2;
  const arcs = segs.map((s) => {
    const frac = total ? s.value / total : 0;
    const a0 = a;
    const a1 = a + frac * Math.PI * 2;
    a = a1;
    return { ...s, d: frac > 0 ? donutArc(cx, cy, rO, rI, a0, a1 - 0.0001) : null, frac };
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width="180" height="180" className="shrink-0">
        {arcs.map((s) => (s.d ? <path key={s.label} d={s.d} className={s.cls} /> : null))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-500" fontSize="10">Total</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-800 dark:fill-slate-100" fontSize="13" fontWeight="700">
          {fmtShort(total)}
        </text>
      </svg>
      <div className="space-y-2 text-sm">
        {arcs.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-sm ${s.cls.replace("fill-", "bg-")}`} />
            <span className="w-28 text-slate-600 dark:text-slate-300">{s.label}</span>
            <span className="tabular-nums font-semibold">{fmt(s.value)}</span>
            <span className="tabular-nums text-slate-400">{pct(s.frac)}</span>
          </div>
        ))}
        <div className="border-t border-slate-100 pt-1 text-xs text-slate-400 dark:border-slate-800">{base}</div>
      </div>
    </div>
  );
}

function UtilBars({ actual, obligo, open, budget }) {
  const b = budget || 1;
  const rows = [
    { label: "Actual", used: actual / b },
    { label: "Actual + Obligo", used: (actual + obligo) / b },
    { label: "Actual + Obligo + Open", used: (actual + obligo + open) / b },
    { label: "Potential to cancel", used: 1 - (actual + obligo + open) / b, invert: true },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const u = Math.max(0, Math.min(1, r.used));
        return (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">{r.label}</span>
              <span className="tabular-nums font-semibold">{pct(u)}</span>
            </div>
            <div className="flex h-4 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full ${r.invert ? "bg-rose-400" : "bg-brand-500"}`}
                style={{ width: `${u * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
