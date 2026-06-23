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
        let budget = 0;
        let actual = 0;
        let forecast = 0;
        for (const leg of yd.legs)
          for (const it of leg.items) {
            if (it.is_cr) continue;
            const mm = it.months.find((x) => x.month === mo);
            if (!mm) continue;
            budget += monthAmount(it, mm, "budget");
            const rv = monthAmount(it, mm, "realized");
            if (mo < cutoff) actual += rv;
            else forecast += rv;
          }
        months.push({
          label: `${String(mo).padStart(2, "0")}.${yd.year.year}`,
          budget,
          actual,
          forecast,
        });
      }
    }
    // trim leading/trailing all-zero months
    const nz = (m) => m.budget || m.actual || m.forecast;
    let s = months.findIndex(nz);
    let e = months.length - 1;
    while (e >= 0 && !nz(months[e])) e--;
    months = s === -1 ? [] : months.slice(s, e + 1);
    // cumulative
    let cb = 0;
    let ca = 0;
    let cf = 0;
    for (const m of months) {
      cb += m.budget;
      ca += m.actual;
      cf += m.actual + m.forecast;
      m.cumBudget = cb;
      m.cumActual = ca;
      m.cumForecast = cf;
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

function niceMax(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function ComboChart({ months }) {
  const H = 340;
  const padL = 56;
  const padR = 20;
  const padT = 16;
  const padB = 64;
  const colW = Math.max(42, Math.min(72, 720 / Math.max(months.length, 1)));
  const W = padL + padR + months.length * colW;
  const innerH = H - padT - padB;

  // single shared scale so the cumulative curves read correctly against the bars
  const maxVal = niceMax(
    Math.max(
      1,
      ...months.flatMap((m) => [m.budget, m.actual, m.forecast, m.cumBudget, m.cumActual, m.cumForecast])
    )
  );
  const y = (v) => padT + innerH - (v / maxVal) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxVal);

  const linePath = (key) =>
    months
      .map((m, i) => {
        const cx = padL + i * colW + colW / 2;
        return `${i ? "L" : "M"}${cx.toFixed(1)},${y(m[key]).toFixed(1)}`;
      })
      .join(" ");

  const cx = (i) => padL + i * colW + colW / 2;
  const linePts = (key) => months.map((m, i) => [cx(i), y(m[key])]);
  // light bars are secondary; the cumulative S-curves are the hero, in distinct colors
  const gap = Math.max(8, colW * 0.34);
  const bw = (colW - gap) / 3;
  const x0 = (i) => padL + i * colW + gap / 2;

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-400" fontSize="10">
              {fmtShort(t)}
            </text>
          </g>
        ))}

        {months.map((m, i) => (
          <g key={m.label}>
            <rect x={x0(i)} y={y(m.budget)} width={bw} height={padT + innerH - y(m.budget)} className="fill-slate-300/70 dark:fill-slate-500/50" rx="1.5">
              <title>{m.label} Budget: {fmt(m.budget)}</title>
            </rect>
            <rect x={x0(i) + bw} y={y(m.actual)} width={bw} height={padT + innerH - y(m.actual)} className="fill-emerald-300/70 dark:fill-emerald-400/40" rx="1.5">
              <title>{m.label} Actual: {fmt(m.actual)}</title>
            </rect>
            <rect x={x0(i) + 2 * bw} y={y(m.forecast)} width={bw} height={padT + innerH - y(m.forecast)} className="fill-orange-300/70 dark:fill-orange-400/40" rx="1.5">
              <title>{m.label} Forecast: {fmt(m.forecast)}</title>
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
        ))}

        {/* cumulative S-curves — solid, distinct colors, with point markers */}
        {[
          { key: "cumBudget", cls: "stroke-brand-500", dot: "fill-brand-500" },
          { key: "cumActual", cls: "stroke-emerald-500", dot: "fill-emerald-500" },
          { key: "cumForecast", cls: "stroke-orange-500", dot: "fill-orange-500" },
        ].map((s) => {
          const pts = linePts(s.key);
          const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
          return (
            <g key={s.key}>
              <path d={d} fill="none" className={s.cls} strokeWidth="2.5" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r="2.5" className={s.dot} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
        <Legend cls="bg-slate-300/70 dark:bg-slate-500/50" label="Monthly Budget" />
        <Legend cls="bg-emerald-300/70 dark:bg-emerald-400/40" label="Monthly Actual" />
        <Legend cls="bg-orange-300/70 dark:bg-orange-400/40" label="Monthly Forecast" />
        <span className="ml-2 flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-brand-500" /> Cum. Budget</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-emerald-500" /> Cum. Actual</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 bg-orange-500" /> Cum. Forecast</span>
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
