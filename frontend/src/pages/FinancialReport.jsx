import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, PieChart, TrendingUp, Table2, Coins, ChevronRight } from "lucide-react";
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

// track the app's class-based dark mode so SVG charts can switch between the
// rich on-screen look (dark) and a crisp, PPT-ready look (light)
function useIsDark() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
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

  const codes = useMemo(
    () => ({
      base: data?.[0]?.project.base_currency || project.base_currency || "",
      rep1: data?.[0]?.project.reporting_currency_1 || project.reporting_currency_1 || "",
      rep2: data?.[0]?.project.reporting_currency_2 || project.reporting_currency_2 || "",
    }),
    [data, project]
  );
  const currencyOptions = useMemo(
    () => [codes.base, codes.rep1, codes.rep2].filter(Boolean),
    [codes]
  );
  const [displayCur, setDisplayCur] = useState(
    () => localStorage.getItem("tt-fin-cur") || ""
  );
  const cur = currencyOptions.includes(displayCur) ? displayCur : codes.base;
  useEffect(() => {
    if (cur) localStorage.setItem("tt-fin-cur", cur);
  }, [cur]);
  // display label for charts/tables
  const base = cur;

  const [sel, setSel] = useState("overall");
  const years = useMemo(
    () => (data ? [...new Set(data.map((d) => d.year.year))].sort((a, b) => a - b) : []),
    [data]
  );
  const curSel = sel === "overall" || years.includes(sel) ? sel : "overall";
  const scoped = useMemo(() => {
    if (!data) return [];
    return curSel === "overall" ? data : data.filter((yd) => yd.year.year === curSel);
  }, [data, curSel]);

  // per-year multiplier to convert a base amount into the selected currency
  // (0 = unconvertible: a reporting currency with no rate for that year)
  const yearMult = useMemo(() => {
    return (yd) => {
      if (cur === codes.base) return 1;
      const r =
        cur === codes.rep1
          ? Number(yd.year.rate_1) || 0
          : cur === codes.rep2
          ? Number(yd.year.rate_2) || 0
          : 0;
      return r > 0 ? 1 / r : 0;
    };
  }, [cur, codes]);

  const model = useMemo(() => {
    if (!scoped || scoped.length === 0) return null;
    const missing = new Set();
    // monthly timeline (chronological); for a single year just its 12 months
    let months = [];
    for (const yd of scoped) {
      const cutoff = yd.year.forecast_from_month ?? 1;
      const m = yearMult(yd);
      if (cur !== codes.base && m === 0) missing.add(yd.year.year);
      for (let mo = 1; mo <= 12; mo++) {
        let budget = 0; // original budget (regular items, no CRs)
        let budgetCrs = 0; // budget incl. CR rows
        let realized = 0; // actual (elapsed) or forecast (future)
        for (const leg of yd.legs)
          for (const it of leg.items) {
            const mm = it.months.find((x) => x.month === mo);
            if (!mm) continue;
            const bv = monthAmount(it, mm, "budget") * m;
            budgetCrs += bv;
            if (!it.is_cr) {
              budget += bv;
              realized += monthAmount(it, mm, "realized") * m;
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

    // utilization figures (for the selected scope)
    let actualTot = 0;
    let obligo = 0;
    let open = 0;
    let regBudget = 0;
    let crBudget = 0;
    for (const yd of scoped) {
      const cutoff = yd.year.forecast_from_month ?? 1;
      const m = yearMult(yd);
      for (const leg of yd.legs)
        for (const it of leg.items)
          for (const mm of it.months) {
            const bv = monthAmount(it, mm, "budget") * m;
            if (it.is_cr) crBudget += bv;
            else regBudget += bv;
            if (it.is_cr) continue;
            const rv = monthAmount(it, mm, "realized") * m;
            if (mm.month < cutoff) actualTot += rv;
            else if (mm.po_committed) obligo += rv;
            else open += rv;
          }
    }
    const budgetWithCrs = regBudget + crBudget;
    return { months, actualTot, obligo, open, budgetWithCrs, missingYears: [...missing] };
  }, [scoped, cur, codes, yearMult]);

  if (loading && !data) return <Spinner />;
  if (!data || data.length === 0)
    return (
      <EmptyState
        icon={BarChart3}
        title="No financial data yet"
        subtitle="Add budget years and monthly values in Budget Details to see the report."
      />
    );

  const pillCls = (active) =>
    `rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
      active
        ? "bg-white text-brand-600 shadow-soft dark:bg-slate-900"
        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
    }`;

  const yearPicker = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
        <button onClick={() => setSel("overall")} className={pillCls(curSel === "overall")}>
          Overall
        </button>
        {years.map((yr) => (
          <button key={yr} onClick={() => setSel(yr)} className={pillCls(curSel === yr)}>
            {yr}
          </button>
        ))}
      </div>
      {currencyOptions.length > 1 && (
        <label className="flex items-center gap-1.5 text-sm">
          <Coins size={16} className="text-slate-400" />
          <select
            className="input h-9 py-0"
            value={cur}
            onChange={(e) => setDisplayCur(e.target.value)}
          >
            {currencyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
                {c === codes.base ? " (base)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  if (!model)
    return (
      <div className="space-y-6">
        {yearPicker}
        <EmptyState
          icon={BarChart3}
          title={`No data for ${curSel === "overall" ? "the project" : curSel}`}
          subtitle="Enter monthly Budget / Actual / Forecast values in Budget Details."
        />
      </div>
    );

  const { months, actualTot, obligo, open, budgetWithCrs, missingYears } = model;

  return (
    <div className="space-y-6">
      {yearPicker}
      {missingYears.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          No {cur} rate set for {missingYears.join(", ")}. Those year(s) are counted as 0;
          set the rate in Budget Details &rarr; Setup.
        </div>
      )}

      <section>
        <div className="mb-1 flex items-center gap-2">
          <Table2 size={18} className="text-brand-600" />
          <h2 className="text-lg font-extrabold">Budget Summary</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Budget elements by category{curSel === "overall" ? " (all years)" : ` (${curSel})`},
          in {cur}. Click a category to expand its elements.
        </p>
        <SummaryTable scoped={scoped} codes={codes} cur={cur} yearMult={yearMult} />
      </section>

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
  const isDark = useIsDark();
  const H = 360;
  const padL = 60;
  const padR = 24;
  const padT = 18;
  const padB = 78; // room for vertical date labels
  // wider columns so the months breathe (card scrolls horizontally)
  const colW = Math.max(64, Math.min(120, 1280 / Math.max(months.length, 1)));
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

  // at the FINAL forecast month, end the cumulative budget lines over the
  // realized (actual) bar centre instead of the budget bar centre, so they meet
  // the realized line; intermediate months keep the budget bar centre
  const lastI = months.length - 1;
  const lastIsForecast = lastI >= 0 && months[lastI].isForecast;
  const budgetLineX = (i) => (i === lastI && lastIsForecast ? realCx(i) : budgetCx(i));

  const bcrsPts = months.map((m, i) => [budgetLineX(i), y(m.cumBudgetCrs)]);
  const bPts = months.map((m, i) => [budgetLineX(i), y(m.cumBudget)]);
  const rPts = months.map((m, i) => [realCx(i), y(m.cumRealized)]);
  const areaUnder = (pts) =>
    pts.length ? `${smoothPath(pts)} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z` : "";

  // where green (actual) turns to orange (forecast) along the realized line.
  // Switch at the LAST ACTUAL month (ffi-1) so the actual->forecast segment is
  // fully orange, not just the final forecast point.
  const ffi = months.findIndex((m) => m.isForecast);
  const rx0 = realCx(0);
  const rxN = realCx(months.length - 1);
  const cutFrac =
    ffi < 0 ? 1 : ffi === 0 ? 0 : Math.max(0, Math.min(1, (realCx(ffi - 1) - rx0) / Math.max(1, rxN - rx0)));

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
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-800/70" strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-500 dark:fill-slate-400" fontSize="10">
              {fmtShort(t)}
            </text>
          </g>
        ))}

        {/* soft area fills — on-screen (dark) only; light stays clean for PPT */}
        {isDark && (
          <>
            <path d={areaUnder(rPts)} fill="url(#frRealArea)" />
            <path d={areaUnder(bcrsPts)} fill="url(#frBudgetArea)" />
          </>
        )}

        {months.map((m, i) => {
          const left = cx(i) - groupW / 2;
          return (
            <g key={m.label}>
              <rect x={left} y={y(m.budgetCrs)} width={bw} height={base - y(m.budgetCrs)} className="fill-slate-400 dark:fill-slate-500/40" rx="1.5">
                <title>{m.label} Budget (with CRs): {fmt(m.budgetCrs)}</title>
              </rect>
              <rect
                x={left + bw + innerGap}
                y={y(m.realized)}
                width={bw}
                height={base - y(m.realized)}
                className={m.isForecast ? "fill-orange-500 dark:fill-orange-400/30" : "fill-emerald-600 dark:fill-emerald-400/30"}
                rx="1.5"
              >
                <title>{m.label} {m.isForecast ? "Forecast" : "Actual"}: {fmt(m.realized)}</title>
              </rect>
              <text
                x={cx(i)}
                y={H - padB + 8}
                textAnchor="end"
                className="fill-slate-600 dark:fill-slate-300"
                fontSize="11"
                transform={`rotate(-90 ${cx(i)} ${H - padB + 8})`}
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* cumulative original budget — thin, secondary */}
        <path d={smoothPath(bPts)} fill="none" className="stroke-slate-500 dark:stroke-slate-400/80" strokeWidth={isDark ? 1.6 : 2.2} strokeDasharray="5 4" />
        {/* cumulative budget with CRs — hero (glow on dark, crisp on light) */}
        <path d={smoothPath(bcrsPts)} fill="none" stroke="#1f47f5" strokeWidth={isDark ? 2.6 : 3.4} strokeLinecap="round" filter={isDark ? "url(#frGlow)" : undefined} />
        {/* cumulative actual → forecast — gradient (glow on dark, crisp on light) */}
        <path d={smoothPath(rPts)} fill="none" stroke="url(#frRealStroke)" strokeWidth={isDark ? 2.6 : 3.4} strokeLinecap="round" filter={isDark ? "url(#frGlow)" : undefined} />

        {/* point markers above each bar */}
        {months.map((m, i) => (
          <g key={`d${i}`}>
            <circle cx={budgetLineX(i)} cy={y(m.cumBudgetCrs)} r={hover === i ? 3.6 : 2.6} fill="#1f47f5" />
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
        <Legend cls="bg-slate-400 dark:bg-slate-500/40" label="Monthly Budget (with CRs)" />
        <Legend cls="bg-emerald-600 dark:bg-emerald-400/30" label="Monthly Actual" />
        <Legend cls="bg-orange-500 dark:bg-orange-400/30" label="Monthly Forecast" />
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

// ----------------------------------------------------------- summary table
// Categories whose legs are split into HW / Implementation rows by the is_hw
// flag (matched case-insensitively on the leg category label).
const SPLIT_CATEGORIES = ["external capex", "external capex breakdown"];
const HW_ROW = "External CAPEX HW";
const IMPL_ROW = "External CAPEX Implementation (aka consultancy)";
const CR_KIND_LABEL = {
  carry_over: "Carry Over",
  reallocation: "Budget Reallocation",
  cancelation: "Budget Cancellation",
  cr: "CR",
};

const SUMMARY_COLS = [
  { key: "budget", label: "Budget" },
  { key: "realloc", label: "Reallocation" },
  { key: "cancel", label: "Cancellation" },
  { key: "modified", label: "Modified Budget", strong: true },
  { key: "actual", label: "Actual" },
  { key: "forecast", label: "Forecast" },
  { key: "actfc", label: "Actual + Forecast" },
  { key: "saving", label: "Saving" },
  { key: "carry", label: "Carry Over" },
];

function emptyAgg() {
  return { budget: 0, realloc: 0, cancel: 0, gencr: 0, carry: 0, actual: 0, forecast: 0 };
}
function addAgg(t, a) {
  for (const k in a) t[k] += a[k];
}
// add the derived columns (modified / actfc / saving) for rendering
function deriveCols(a) {
  const modified = a.budget + a.realloc + a.cancel + a.gencr;
  const actfc = a.actual + a.forecast;
  return { ...a, modified, actfc, saving: modified - actfc };
}
// one budget item's base-converted contribution, routed to the right column
function itemAgg(it, cutoff, m) {
  const a = emptyAgg();
  let b = 0;
  let act = 0;
  let fc = 0;
  for (const mm of it.months) {
    b += monthAmount(it, mm, "budget") * m;
    if (!it.is_cr) {
      const rv = monthAmount(it, mm, "realized") * m;
      if (mm.month < cutoff) act += rv;
      else fc += rv;
    }
  }
  if (!it.is_cr) {
    a.budget = b;
    a.actual = act;
    a.forecast = fc;
  } else if (it.cr_kind === "reallocation") a.realloc = b;
  else if (it.cr_kind === "cancelation") a.cancel = b;
  else if (it.cr_kind === "carry_over") a.carry = b;
  else a.gencr = b;
  return a;
}

function SummaryTable({ scoped, codes, cur, yearMult }) {
  const [open, setOpen] = useState(() => new Set());

  const { rows, total } = useMemo(() => {
    const map = new Map(); // label -> { agg, details: Map(label -> agg) }
    const order = [];
    const total = emptyAgg();
    const group = (label) => {
      if (!map.has(label)) {
        map.set(label, { agg: emptyAgg(), details: new Map() });
        order.push(label);
      }
      return map.get(label);
    };
    for (const yd of scoped) {
      const cutoff = yd.year.forecast_from_month ?? 1;
      const m = yearMult(yd);
      for (const leg of yd.legs) {
        const catRaw = leg.category && leg.category.trim() ? leg.category : "Uncategorized";
        const isSplit = SPLIT_CATEGORIES.includes(catRaw.trim().toLowerCase());
        for (const it of leg.items) {
          const a = itemAgg(it, cutoff, m);
          const label = isSplit ? (it.is_hw ? HW_ROW : IMPL_ROW) : catRaw;
          const g = group(label);
          addAgg(g.agg, a);
          addAgg(total, a);
          const dl = it.is_cr
            ? `${CR_KIND_LABEL[it.cr_kind] || "CR"}${it.name ? ` · ${it.name}` : ""}`
            : it.name || "—";
          const prev = g.details.get(dl) || emptyAgg();
          addAgg(prev, a);
          g.details.set(dl, prev);
        }
      }
    }
    const rows = order.map((label) => {
      const g = map.get(label);
      return {
        label,
        agg: deriveCols(g.agg),
        details: [...g.details.entries()].map(([dl, a]) => ({ label: dl, agg: deriveCols(a) })),
      };
    });
    return { rows, total: deriveCols(total) };
  }, [scoped, cur, codes, yearMult]);

  if (rows.length === 0)
    return (
      <div className="card px-4 py-6 text-center text-sm text-slate-400">
        No budget elements to summarize.
      </div>
    );

  const toggle = (label) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(label) ? n.delete(label) : n.add(label);
      return n;
    });

  const numCls = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap w-[118px] min-w-[118px]";
  const cz = (v) => (Math.round(v) === 0 ? "" : fmt(v));

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="bg-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              <th className="sticky left-0 z-10 bg-slate-200 px-4 py-2 text-left dark:bg-slate-700 w-[280px] min-w-[280px]">
                Budget Elements
              </th>
              {SUMMARY_COLS.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2 text-right ${c.strong ? "text-brand-700 dark:text-brand-300" : ""}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => {
              const hasDetails = r.details.length > 0;
              const isOpen = open.has(r.label);
              return (
                <React.Fragment key={r.label}>
                  <tr className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50">
                    <td className="sticky left-0 z-10 bg-inherit px-4 py-1.5 w-[280px] min-w-[280px]">
                      <button
                        type="button"
                        onClick={() => hasDetails && toggle(r.label)}
                        className={`flex items-center gap-1.5 text-left font-semibold ${
                          hasDetails ? "" : "cursor-default"
                        }`}
                      >
                        {hasDetails ? (
                          <ChevronRight
                            size={14}
                            className={`shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                          />
                        ) : (
                          <span className="inline-block w-[14px] shrink-0" />
                        )}
                        <span>{r.label}</span>
                      </button>
                    </td>
                    {SUMMARY_COLS.map((c) => (
                      <td
                        key={c.key}
                        className={`${numCls} ${c.strong ? "font-semibold text-brand-700 dark:text-brand-300" : "font-medium"}`}
                      >
                        {cz(r.agg[c.key])}
                      </td>
                    ))}
                  </tr>
                  {isOpen &&
                    r.details.map((d, i) => (
                      <tr key={`${r.label}-${i}`} className="bg-slate-50/60 dark:bg-slate-800/20">
                        <td className="sticky left-0 z-10 bg-inherit py-1 pl-9 pr-4 text-[13px] font-light text-slate-500 dark:text-slate-400 w-[280px] min-w-[280px]">
                          {d.label}
                        </td>
                        {SUMMARY_COLS.map((c) => (
                          <td key={c.key} className={`${numCls} font-light text-slate-500 dark:text-slate-400`}>
                            {cz(d.agg[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold dark:border-slate-600 dark:bg-slate-800/60">
              <td className="sticky left-0 z-10 bg-slate-100 px-4 py-2 dark:bg-slate-800/60 w-[280px] min-w-[280px]">
                TOTAL
              </td>
              {SUMMARY_COLS.map((c) => (
                <td
                  key={c.key}
                  className={`${numCls} ${c.strong ? "text-brand-700 dark:text-brand-300" : ""}`}
                >
                  {cz(total[c.key])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
