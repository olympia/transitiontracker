import React, { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, PieChart, TrendingUp, Table2, Coins, ChevronRight, FileSpreadsheet } from "lucide-react";
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
  const SPECIAL_TABS = ["portfolio", "currsim"];
  const curSel = sel === "overall" || SPECIAL_TABS.includes(sel) || years.includes(sel) ? sel : "overall";
  // "Portfolio Review" and "Curr Impact Sim" always report today's calendar
  // year, independent of the normal year/overall pills.
  const nowYear = new Date().getFullYear();
  const scoped = useMemo(() => {
    if (!data) return [];
    if (curSel === "overall") return data;
    if (SPECIAL_TABS.includes(curSel)) return data.filter((yd) => yd.year.year === nowYear);
    return data.filter((yd) => yd.year.year === curSel);
  }, [data, curSel, nowYear]);

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
        <button onClick={() => setSel("portfolio")} className={pillCls(curSel === "portfolio")}>
          Portfolio Review
        </button>
        <button
          onClick={() => setSel("currsim")}
          className={pillCls(curSel === "currsim")}
          title="Currency Impact Simulator"
        >
          Curr Impact Sim
        </button>
      </div>
      {!SPECIAL_TABS.includes(curSel) && currencyOptions.length > 1 && (
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
          title={`No data for ${
            curSel === "overall" ? "the project" : SPECIAL_TABS.includes(curSel) ? nowYear : curSel
          }`}
          subtitle="Enter monthly Budget / Actual / Forecast values in Budget Details."
        />
      </div>
    );

  const { months, actualTot, obligo, open, budgetWithCrs, missingYears } = model;

  if (curSel === "portfolio")
    return (
      <div className="space-y-6">
        {yearPicker}
        <PortfolioReview scoped={scoped} codes={codes} nowYear={nowYear} />
      </div>
    );

  if (curSel === "currsim")
    return (
      <div className="space-y-6">
        {yearPicker}
        <CurrencyImpactSim scoped={scoped} codes={codes} nowYear={nowYear} />
      </div>
    );

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
        <SummaryTable scoped={scoped} yearMult={yearMult} currencyLabel={cur} />
      </section>

      <section>
        <div className="mb-1 flex items-center gap-2">
          <Table2 size={18} className="text-brand-600" />
          <h2 className="text-lg font-extrabold">Budget Summary by WBS</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Budget elements by WBS leg{curSel === "overall" ? " (all years)" : ` (${curSel})`},
          in {cur}. Click a WBS to expand its elements.
        </p>
        <SummaryTable
          scoped={scoped}
          yearMult={yearMult}
          currencyLabel={cur}
          groupBy="wbs"
          labelHeader="WBS"
        />
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

// 3 utilization %s (of Modified Budget) derived from a buildSummary() total —
// shared by Portfolio Review and the Currency Impact Simulator.
function utilPct(total) {
  const pctOf = (v) => (total.modified > 0 ? Math.round((v / total.modified) * 100) : null);
  return {
    actual: pctOf(total.actual),
    actualCommit: pctOf(total.actual + total.commitment),
    totalForecast: pctOf(total.actfc),
  };
}
function UtilChip({ label, pct, bg }) {
  return (
    <div className={`rounded-xl border-4 border-black px-5 py-4 text-center ${bg}`}>
      <div className="text-sm font-semibold text-black">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-black">{pct === null ? "—" : `${pct}%`}</div>
    </div>
  );
}
// capped to the Total Forecast column's right edge, so the 3 chips share
// exactly that width (matches the Summary table above them).
function UtilChipsRow({ pct }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      style={{ maxWidth: summaryWidthThrough("actfc") }}
    >
      <UtilChip label="Budget Utilization (Actual)" pct={pct.actual} bg="bg-yellow-300" />
      <UtilChip
        label="Budget Utilization (Actual + Commitment)"
        pct={pct.actualCommit}
        bg="bg-emerald-400"
      />
      <UtilChip
        label="Budget Utilization (Actual + Commitment + Planned)"
        pct={pct.totalForecast}
        bg="bg-sky-200"
      />
    </div>
  );
}

// the project's configured USD reporting currency + its rate for the (single)
// in-scope year, if any — shared by Portfolio Review and the Currency Impact
// Simulator, both of which only ever scope to one year (nowYear).
function useProjectUsdRate(scoped, codes) {
  const usdCode = useMemo(
    () => [codes.base, codes.rep1, codes.rep2].find((c) => c && c.trim().toUpperCase() === "USD"),
    [codes]
  );
  const rate = useMemo(() => {
    if (!usdCode || !scoped[0]) return 0;
    if (usdCode === codes.base) return 1;
    const yd = scoped[0];
    return usdCode === codes.rep1
      ? Number(yd.year.rate_1) || 0
      : usdCode === codes.rep2
      ? Number(yd.year.rate_2) || 0
      : 0;
  }, [usdCode, codes, scoped]);
  const ready = !!(usdCode && (usdCode === codes.base || rate > 0));
  return { usdCode, rate, ready };
}

// Portfolio Review: always the current calendar year. Stacks the Budget
// Summary table in base currency directly above the same table in USD
// (tight, for PPT copy-paste), then 3 utilization chips below.
function PortfolioReview({ scoped, codes, nowYear }) {
  const isDark = useIsDark();
  const baseMult = useMemo(() => () => 1, []);
  const { rate: usdRate, ready: usdReady } = useProjectUsdRate(scoped, codes);
  const usdMult = useMemo(() => () => (usdRate > 0 ? 1 / usdRate : 0), [usdRate]);

  // base-currency totals drive the 3 utilization % chips (currency-agnostic ratios)
  const total = useMemo(() => buildSummary(scoped, baseMult).total, [scoped, baseMult]);
  const pct = utilPct(total);

  return (
    <div className={`space-y-6 ${isDark ? "" : "rounded-xl bg-white p-6 text-slate-900"}`}>
      <section>
        <div className="mb-1 flex items-center gap-2">
          <Table2 size={18} className="text-brand-600" />
          <h2 className="text-lg font-extrabold">Portfolio Review — {nowYear}</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Budget Summary in {codes.base} and USD, stacked for easy PPT copy-paste.
        </p>
        <div className="card overflow-hidden divide-y-2 divide-slate-300 dark:divide-slate-700">
          <SummaryTable scoped={scoped} yearMult={baseMult} currencyLabel={codes.base} bare />
          {usdReady ? (
            <SummaryTable scoped={scoped} yearMult={usdMult} currencyLabel="USD" bare />
          ) : (
            <div className="bg-amber-50 px-4 py-6 text-center text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              No USD rate configured for {nowYear}. Set USD as a reporting currency (with a rate) for
              this project in Budget Details &rarr; Setup to see this table.
            </div>
          )}
        </div>
      </section>

      <UtilChipsRow pct={pct} />

      <section>
        <h2 className="mb-2 text-lg font-extrabold">Budget overview (USD - using budgeting FX Rate)</h2>
        {usdReady ? (
          <BudgetOverview scoped={scoped} yearMult={usdMult} />
        ) : (
          <div className="rounded-lg bg-amber-50 px-4 py-6 text-center text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            No USD rate configured for {nowYear}. Set USD as a reporting currency (with a rate) for
            this project in Budget Details &rarr; Setup to see this table.
          </div>
        )}
      </section>
    </div>
  );
}

// Currency Impact Simulator: always the current calendar year. Base-currency
// Summary table + its utilization chips, then 3 editable USD rate inputs
// (Actual / Commitment / Forecast) that recompute a second, simulated USD
// Summary table + its own chips — Budget/Reallocation/Cancellation/Modified
// Budget/Carry Over always keep the project's normal configured USD rate;
// only the "live" execution columns move with the simulated rates.
function CurrencyImpactSim({ scoped, codes, nowYear }) {
  const baseMult = useMemo(() => () => 1, []);
  const { rate: defaultUsdRate, ready: usdReady } = useProjectUsdRate(scoped, codes);

  const baseTotal = useMemo(() => buildSummary(scoped, baseMult).total, [scoped, baseMult]);
  const basePct = utilPct(baseTotal);

  // 3 user-editable rates (base units per 1 USD), prefilled from the
  // project's own configured USD rate once it's known
  const [rActual, setRActual] = useState(null);
  const [rCommit, setRCommit] = useState(null);
  const [rForecast, setRForecast] = useState(null);
  useEffect(() => {
    if (defaultUsdRate > 0) {
      setRActual((v) => (v === null ? defaultUsdRate : v));
      setRCommit((v) => (v === null ? defaultUsdRate : v));
      setRForecast((v) => (v === null ? defaultUsdRate : v));
    }
  }, [defaultUsdRate]);

  const simMult = useMemo(() => {
    const mBudget = defaultUsdRate > 0 ? 1 / defaultUsdRate : 0;
    const mActual = rActual > 0 ? 1 / rActual : 0;
    const mCommit = rCommit > 0 ? 1 / rCommit : 0;
    const mForecast = rForecast > 0 ? 1 / rForecast : 0;
    return () => ({ budget: mBudget, actual: mActual, commitment: mCommit, forecast: mForecast });
  }, [defaultUsdRate, rActual, rCommit, rForecast]);

  const simTotal = useMemo(() => buildSummary(scoped, simMult).total, [scoped, simMult]);
  const simPct = utilPct(simTotal);

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      await exportCurrencySimXlsx({
        scoped,
        codes,
        defaultUsdRate,
        rActual,
        rCommit,
        rForecast,
        nowYear,
      });
    } catch (e) {
      console.error("Excel export failed", e);
      alert("Excel export failed: " + (e?.message || e));
    } finally {
      setExporting(false);
    }
  };

  const rateInput = (label, val, setVal) => (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <input
        type="number"
        step="any"
        className="input h-9 w-28 py-0"
        value={val ?? ""}
        onChange={(e) => setVal(e.target.value === "" ? null : Number(e.target.value))}
      />
      <span className="text-xs text-slate-400">{codes.base}/USD</span>
    </label>
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-1 flex items-center gap-2">
          <Table2 size={18} className="text-brand-600" />
          <h2 className="text-lg font-extrabold">Currency Impact Simulator — {nowYear}</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">Budget Summary in {codes.base}.</p>
        <SummaryTable scoped={scoped} yearMult={baseMult} currencyLabel={codes.base} />
      </section>

      <UtilChipsRow pct={basePct} />

      <section>
        <div className="mb-1 flex items-center gap-2">
          <Coins size={18} className="text-brand-600" />
          <h2 className="text-lg font-extrabold">Simulated USD rates</h2>
        </div>
        {!usdReady ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            No USD rate configured for {nowYear}. Set USD as a reporting currency (with a rate) for
            this project in Budget Details &rarr; Setup — Budget / Modified Budget need that baseline
            rate even in the simulator.
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500">
              Override the USD rate ({codes.base} per 1 USD) for Actual, Commitment and Forecast
              individually. Budget / Reallocation / Cancellation / Modified Budget / Carry Over stay at
              the project's configured USD rate ({fmt(defaultUsdRate)}).
            </p>
            <div className="mb-4 flex flex-wrap gap-4">
              {rateInput("Actual rate", rActual, setRActual)}
              {rateInput("Commitment rate", rCommit, setRCommit)}
              {rateInput("Forecast rate", rForecast, setRForecast)}
            </div>
            <SummaryTable scoped={scoped} yearMult={simMult} currencyLabel="USD (sim)" />
            <div className="mt-6">
              <UtilChipsRow pct={simPct} />
            </div>
          </>
        )}
      </section>

      <section className="border-t border-slate-200 pt-5 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-60"
          >
            <FileSpreadsheet size={16} />
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
          <p className="text-xs text-slate-500">
            Exports the base {codes.base} table plus editable rate cells and a formula-driven
            USD table — change the rates in Excel and the USD numbers recalculate.
          </p>
        </div>
      </section>
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
    { label: "Planned", value: open, cls: "fill-slate-400" },
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
    { label: "Actual + Obligo + Planned", used: (actual + obligo + open) / b },
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
  { key: "commitment", label: "Commitment" },
  { key: "forecast", label: "Planned" },
  { key: "actfc", label: "Forecast" },
  { key: "saving", label: "Saving" },
  { key: "carry", label: "Carry Over" },
];

// columns that show a (% of Modified Budget) next to the number, each in its
// own narrow left-aligned cell right after the (fixed-width, right-aligned)
// value cell, so the value columns keep place-value alignment across rows.
const PCT_COLS = new Set(["actual", "commitment", "forecast", "actfc", "saving"]);
// font colors matching the Actual/Forecast series colors in the Project Budget
// Forecast chart above (fill-emerald-600/fill-orange-500 on the bars); these
// win over any default/detail-row color passed in via colorCls. Commitment
// (obligo) is part of the forecast family, so it shares the orange.
const COL_TEXT_CLS = {
  actual: "text-emerald-600 dark:text-emerald-400",
  commitment: "text-orange-500 dark:text-orange-400",
  forecast: "text-orange-500 dark:text-orange-400",
  actfc: "text-orange-500 dark:text-orange-400",
};
const SUMMARY_NUM_CLS = "pl-3 pr-1 py-1 text-right tabular-nums whitespace-nowrap w-[108px] min-w-[108px]";
const SUMMARY_PCT_CLS = "pl-0 pr-2 py-1 text-left tabular-nums whitespace-nowrap w-[42px] min-w-[42px]";
const summaryNum = (v) => (Math.round(v) === 0 ? "" : fmt(v));
// "(NN%)" of modified budget, or "" if the cell has no number or no valid base
const summaryPct = (v, modified) => {
  if (Math.round(v) === 0 || !(modified > 0)) return "";
  return `(${Math.round((v / modified) * 100)}%)`;
};

// numeric mirrors of the pixel widths baked into the Tailwind arbitrary-value
// classes above (SUMMARY_NUM_CLS w-[108px], SUMMARY_PCT_CLS w-[42px]) and the
// sticky "Budget Elements" column (w-[280px], set literally in the table JSX
// since Tailwind's class scanner needs the literal string, not a template).
// Keep these three in sync by hand if those widths ever change.
const SUMMARY_LABEL_W = 280;
const SUMMARY_VAL_W = 108;
const SUMMARY_PCT_W = 42;
// cumulative table width from the left edge through the right edge of the
// given column (inclusive of its % sub-column, if any) — used to size the
// Portfolio Review utilization chips to match the Total Forecast column.
function summaryWidthThrough(colKey) {
  let w = SUMMARY_LABEL_W;
  for (const c of SUMMARY_COLS) {
    w += SUMMARY_VAL_W + (PCT_COLS.has(c.key) ? SUMMARY_PCT_W : 0);
    if (c.key === colKey) break;
  }
  return w;
}

// one summary-table metric: a right-aligned value cell (fixed width, so digits
// line up place-value-wise down a column) plus, for PCT_COLS, a separate
// narrow left-aligned "%" cell tight against it — kept in its own column
// rather than inline text so it never disturbs the value column's alignment.
function SummaryCell({ colKey, val, modified, weightCls = "", colorCls = "", pctCls = "text-[10px]" }) {
  const finalColor = COL_TEXT_CLS[colKey] || colorCls;
  const showPct = PCT_COLS.has(colKey);
  return (
    <>
      <td className={`${SUMMARY_NUM_CLS} ${weightCls} ${finalColor}`}>{summaryNum(val)}</td>
      {showPct && (
        <td className={`${SUMMARY_PCT_CLS} ${pctCls} ${finalColor}`}>{summaryPct(val, modified)}</td>
      )}
    </>
  );
}

function emptyAgg() {
  return { budget: 0, realloc: 0, cancel: 0, gencr: 0, carry: 0, actual: 0, commitment: 0, forecast: 0 };
}
function addAgg(t, a) {
  for (const k in a) t[k] += a[k];
}
// add the derived columns (modified / actfc / saving) for rendering
function deriveCols(a) {
  const modified = a.budget + a.realloc + a.cancel + a.gencr;
  const actfc = a.actual + a.commitment + a.forecast;
  return { ...a, modified, actfc, saving: modified - actfc };
}
// one budget item's base-converted contribution, routed to the right column.
// Forecast months split into Commitment (PO/obligo committed) vs. open Forecast.
// `mults` = { budget, actual, commitment, forecast } — separate multipliers per
// bucket, so the Currency Impact Simulator can apply a different simulated
// USD rate to Actual/Commitment/Forecast while Budget-family columns keep the
// project's normal (default) rate.
function itemAgg(it, cutoff, mults) {
  const a = emptyAgg();
  let b = 0;
  let act = 0;
  let commit = 0;
  let fc = 0;
  for (const mm of it.months) {
    b += monthAmount(it, mm, "budget") * mults.budget;
    if (!it.is_cr) {
      const raw = monthAmount(it, mm, "realized");
      if (mm.month < cutoff) act += raw * mults.actual;
      else if (mm.po_committed) commit += raw * mults.commitment;
      else fc += raw * mults.forecast;
    }
  }
  if (!it.is_cr) {
    a.budget = b;
    a.actual = act;
    a.commitment = commit;
    a.forecast = fc;
  } else if (it.cr_kind === "reallocation") a.realloc = b;
  else if (it.cr_kind === "cancelation") a.cancel = b;
  else if (it.cr_kind === "carry_over") a.carry = b;
  else a.gencr = b;
  return a;
}

// row label for a WBS leg in the by-WBS summary: "code · category" (falling
// back to whichever of code/category is present). Same code+category across
// years merge into one row, so the Overall tab shows a true per-WBS total.
function wbsLabel(leg) {
  const code = (leg.code || "").trim();
  const cat = (leg.category || "").trim();
  if (code && cat) return `${code} · ${cat}`;
  return code || cat || "Uncategorized WBS";
}

// pure aggregation: scoped year-data + a currency multiplier -> grouped rows
// (each with its expandable item-level details) + a grand total. Shared by
// the normal per-tab SummaryTable, Portfolio Review and the Currency Impact
// Simulator. `yearMult(yd)` may return either a single number (uniform rate,
// the common case) or a { budget, actual, commitment, forecast } object (the
// simulator's per-bucket rates); both shapes are normalized to the latter.
// `groupMode`: "category" (default, budget categories with the External CAPEX
// HW/Implementation split) or "wbs" (one row per WBS leg, no split).
function buildSummary(scoped, yearMult, groupMode = "category") {
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
    const raw = yearMult(yd);
    const mults =
      typeof raw === "number" ? { budget: raw, actual: raw, commitment: raw, forecast: raw } : raw;
    for (const leg of yd.legs) {
      const catRaw = leg.category && leg.category.trim() ? leg.category : "Uncategorized";
      const isSplit = groupMode === "category" && SPLIT_CATEGORIES.includes(catRaw.trim().toLowerCase());
      const wbs = wbsLabel(leg);
      for (const it of leg.items) {
        const a = itemAgg(it, cutoff, mults);
        const label = groupMode === "wbs" ? wbs : isSplit ? (it.is_hw ? HW_ROW : IMPL_ROW) : catRaw;
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
}

// ------------------------------------------------ Currency Sim -> Excel export
// Column layout for the exported summary tables (letters B..K, in this order).
// `rate` says how the SIMULATED USD cell is computed from the base cell:
//   default/actual/commit/forecast -> base / <that rate cell>
//   sum      -> Actual_usd + Commitment_usd + Forecast_usd (own row)
//   saving   -> Modified_usd - TotalForecast_usd (own row)
const XLSX_COLS = [
  { key: "budget", label: "Budget", rate: "default" },
  { key: "realloc", label: "Reallocation", rate: "default" },
  { key: "cancel", label: "Cancellation", rate: "default" },
  { key: "modified", label: "Modified Budget", rate: "default", strong: true },
  { key: "actual", label: "Actual", rate: "actual" },
  { key: "commitment", label: "Commitment", rate: "commit" },
  { key: "forecast", label: "Planned", rate: "forecast" },
  { key: "actfc", label: "Forecast", rate: "sum" },
  { key: "saving", label: "Saving", rate: "saving" },
  { key: "carry", label: "Carry Over", rate: "default" },
];
// Excel column letter for value column i (0-based): B, C, D, ... (A is the label)
const xlsxColLetter = (i) => String.fromCharCode(66 + i);
// rate input cells (see layout below): default=B2, actual=B3, commit=B4, forecast=B5
const RATE_ADDR = { default: "$B$2", actual: "$B$3", commit: "$B$4", forecast: "$B$5" };

// Build and download an .xlsx that mirrors the Currency Impact Simulator:
// an editable rate block, the base-currency summary as constants, and a
// simulated-USD summary made of formulas that reference the rate cells, so the
// USD table live-recalculates in Excel whenever a rate is changed.
async function exportCurrencySimXlsx({ scoped, codes, defaultUsdRate, rActual, rCommit, rForecast, nowYear }) {
  const ExcelJS = (await import("exceljs")).default;
  const { rows, total } = buildSummary(scoped, () => 1); // base-currency source values

  const wb = new ExcelJS.Workbook();
  wb.creator = "Transition Tracker";
  wb.created = new Date();
  const ws = wb.addWorksheet(`Currency Sim ${nowYear}`);

  const MONEY = "#,##0";
  const RATE_FMT = "#,##0.####";
  const HEAD_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  const INPUT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  const thin = { style: "thin", color: { argb: "FFBFC7D2" } };
  const BOX = { top: thin, left: thin, bottom: thin, right: thin };

  // column widths
  ws.getColumn(1).width = 34;
  for (let i = 0; i < XLSX_COLS.length; i++) ws.getColumn(2 + i).width = 15;

  // --- title -----------------------------------------------------------------
  ws.getCell("A1").value = `Currency Impact Simulator — ${nowYear}`;
  ws.getCell("A1").font = { bold: true, size: 14 };

  // --- editable rate block (rows 2..5) --------------------------------------
  const rateRows = [
    ["Default USD rate", defaultUsdRate, "default"],
    ["Actual rate", rActual, "actual"],
    ["Commitment rate", rCommit, "commit"],
    ["Forecast rate", rForecast, "forecast"],
  ];
  rateRows.forEach(([label], idx) => {
    const r = 2 + idx;
    ws.getCell(`A${r}`).value = `${label} (${codes.base}/USD)`;
    ws.getCell(`A${r}`).font = { bold: true };
    const c = ws.getCell(`B${r}`);
    c.value = Number(rateRows[idx][1]) || 0;
    c.numFmt = RATE_FMT;
    c.fill = INPUT_FILL;
    c.border = BOX;
    c.font = { bold: true };
  });
  ws.getCell("A6").value =
    "Edit the yellow rate cells above — the simulated USD table below recalculates automatically.";
  ws.getCell("A6").font = { italic: true, size: 9, color: { argb: "FF64748B" } };

  // helper: write one summary table (header + category rows + TOTAL).
  // `usd` false -> base constants; true -> formulas referencing baseFirstRow.
  const writeTable = (startRow, subtitle, currencyLabel, usd, baseFirstRow) => {
    ws.getCell(`A${startRow}`).value = subtitle;
    ws.getCell(`A${startRow}`).font = { bold: true, size: 12 };
    const headRow = startRow + 1;
    // header
    const hLabel = ws.getCell(`A${headRow}`);
    hLabel.value = `Budget Elements (${currencyLabel})`;
    hLabel.font = { bold: true };
    hLabel.fill = HEAD_FILL;
    hLabel.border = BOX;
    XLSX_COLS.forEach((col, i) => {
      const cell = ws.getCell(`${xlsxColLetter(i)}${headRow}`);
      cell.value = col.label;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "right", wrapText: true };
      cell.fill = HEAD_FILL;
      cell.border = BOX;
    });
    // body
    const bodyRows = [...rows.map((r) => ({ label: r.label, agg: r.agg })), { label: "TOTAL", agg: total }];
    bodyRows.forEach((br, ri) => {
      const excelRow = headRow + 1 + ri;
      const isTotal = ri === bodyRows.length - 1;
      const lc = ws.getCell(`A${excelRow}`);
      lc.value = br.label;
      lc.border = BOX;
      if (isTotal) lc.font = { bold: true };
      if (isTotal) lc.fill = TOTAL_FILL;
      XLSX_COLS.forEach((col, i) => {
        const L = xlsxColLetter(i);
        const cell = ws.getCell(`${L}${excelRow}`);
        if (!usd) {
          cell.value = Math.round(br.agg[col.key] || 0);
        } else {
          const bRow = baseFirstRow + ri; // matching base row
          if (col.rate === "sum") {
            const F = xlsxColLetter(4), G = xlsxColLetter(5), H = xlsxColLetter(6);
            cell.value = { formula: `${F}${excelRow}+${G}${excelRow}+${H}${excelRow}` };
          } else if (col.rate === "saving") {
            const E = xlsxColLetter(3), I = xlsxColLetter(7);
            cell.value = { formula: `${E}${excelRow}-${I}${excelRow}` };
          } else {
            const addr = RATE_ADDR[col.rate];
            cell.value = { formula: `IF(${addr}>0,${L}${bRow}/${addr},0)` };
          }
        }
        cell.numFmt = MONEY;
        cell.alignment = { horizontal: "right" };
        cell.border = BOX;
        if (isTotal) cell.font = { bold: true };
        if (isTotal) cell.fill = TOTAL_FILL;
        if (col.strong && !isTotal) cell.font = { bold: true };
      });
    });
    return { firstBody: headRow + 1, totalRow: headRow + 1 + rows.length };
  };

  // chips block: the 3 utilization %s (of Modified Budget) as formulas off a
  // table's TOTAL row, so the USD chips recalc when the rates change. Mirrors
  // utilPct(): actual/modified, (actual+commit)/modified, actfc/modified.
  const writeChips = (startRow, totalRow, title) => {
    ws.getCell(`A${startRow}`).value = title;
    ws.getCell(`A${startRow}`).font = { bold: true, size: 11 };
    const E = xlsxColLetter(3), F = xlsxColLetter(4), G = xlsxColLetter(5), I = xlsxColLetter(7);
    const eT = `${E}${totalRow}`, fT = `${F}${totalRow}`, gT = `${G}${totalRow}`, iT = `${I}${totalRow}`;
    const specs = [
      { label: "Budget Utilization (Actual)", f: `IF(${eT}>0,${fT}/${eT},"—")`, argb: "FFFDE047" },
      { label: "Budget Utilization (Actual + Commitment)", f: `IF(${eT}>0,(${fT}+${gT})/${eT},"—")`, argb: "FF34D399" },
      { label: "Budget Utilization (Actual + Commitment + Forecast)", f: `IF(${eT}>0,${iT}/${eT},"—")`, argb: "FF7DD3FC" },
    ];
    specs.forEach((s, i) => {
      const r = startRow + 1 + i;
      const lc = ws.getCell(`A${r}`);
      lc.value = s.label;
      lc.border = BOX;
      const vc = ws.getCell(`B${r}`);
      vc.value = { formula: s.f };
      vc.numFmt = "0%";
      vc.alignment = { horizontal: "center" };
      vc.font = { bold: true };
      vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: s.argb } };
      vc.border = BOX;
    });
    return startRow + 1 + specs.length; // next free row
  };

  const baseTitleRow = 8;
  const baseTbl = writeTable(baseTitleRow, `Budget Summary — ${codes.base} (source values)`, codes.base, false, null);
  const baseChipsEnd = writeChips(baseTbl.totalRow + 2, baseTbl.totalRow, `Budget Utilization — ${codes.base}`);
  const usdTitleRow = baseChipsEnd + 2;
  const usdTbl = writeTable(usdTitleRow, "Simulated USD — recalculates from the rates above", "USD (sim)", true, baseTbl.firstBody);
  writeChips(usdTbl.totalRow + 2, usdTbl.totalRow, "Budget Utilization — USD (sim)");

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `currency-impact-sim-${nowYear}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// currencyLabel: shown as a second header line under each value column.
// bare: skip the outer "card" wrapper (used when the caller stacks two
// tables inside one shared card, e.g. Portfolio Review base+USD).
function SummaryTable({ scoped, yearMult, currencyLabel, bare = false, groupBy = "category", labelHeader = "Budget Elements" }) {
  const [open, setOpen] = useState(() => new Set());

  const { rows, total } = useMemo(
    () => buildSummary(scoped, yearMult, groupBy),
    [scoped, yearMult, groupBy]
  );

  if (rows.length === 0)
    return (
      <div className={`${bare ? "" : "card"} px-4 py-6 text-center text-sm text-slate-400`}>
        No budget elements to summarize.
      </div>
    );

  const toggle = (label) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(label) ? n.delete(label) : n.add(label);
      return n;
    });

  // second header line showing the column's currency, right under the label
  const curLine = currencyLabel ? (
    <>
      <br />
      <span className="text-[9px] font-normal normal-case tracking-normal opacity-70">
        {currencyLabel}
      </span>
    </>
  ) : null;

  return (
    <div className={bare ? "" : "card overflow-hidden"}>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="bg-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              <th className="sticky left-0 z-10 bg-slate-200 px-4 py-2 text-left dark:bg-slate-700 w-[280px] min-w-[280px]">
                {labelHeader}
              </th>
              {SUMMARY_COLS.map((c) => {
                const color = COL_TEXT_CLS[c.key] || (c.strong ? "text-brand-700 dark:text-brand-300" : "");
                if (!PCT_COLS.has(c.key))
                  return (
                    <th key={c.key} className={`px-3 py-2 text-right ${color}`}>
                      {c.label}
                      {curLine}
                    </th>
                  );
                // pct-bearing column: header label right-aligns to the VALUE
                // sub-column only (own th, same padding as the value td), a
                // separate blank th sits over the % sub-column — the header
                // ignores the % column for alignment purposes.
                return (
                  <React.Fragment key={c.key}>
                    <th className={`pl-3 pr-1 py-2 text-right ${color}`}>
                      {c.label}
                      {curLine}
                    </th>
                    <th className="pl-0 pr-2 py-2" />
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[12px]">
            {rows.map((r) => {
              const hasDetails = r.details.length > 0;
              const isOpen = open.has(r.label);
              return (
                <React.Fragment key={r.label}>
                  <tr className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50">
                    <td className="sticky left-0 z-10 bg-inherit px-4 py-1 text-[13px] w-[280px] min-w-[280px]">
                      <button
                        type="button"
                        onClick={() => hasDetails && toggle(r.label)}
                        className={`flex items-center gap-1.5 text-left ${
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
                      <SummaryCell
                        key={c.key}
                        colKey={c.key}
                        val={r.agg[c.key]}
                        modified={r.agg.modified}
                        colorCls={c.strong ? "text-brand-700 dark:text-brand-300" : ""}
                      />
                    ))}
                  </tr>
                  {isOpen &&
                    r.details.map((d, i) => (
                      <tr key={`${r.label}-${i}`} className="bg-slate-50/60 dark:bg-slate-800/20">
                        <td className="sticky left-0 z-10 bg-inherit py-0.5 pl-9 pr-4 text-[12px] text-slate-500 dark:text-slate-400 w-[280px] min-w-[280px]">
                          {d.label}
                        </td>
                        {SUMMARY_COLS.map((c) => (
                          <SummaryCell
                            key={c.key}
                            colKey={c.key}
                            val={d.agg[c.key]}
                            modified={d.agg.modified}
                            colorCls="text-slate-500 dark:text-slate-400"
                          />
                        ))}
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
            <tr className="border-t-2 border-slate-300 bg-slate-100 text-[13px] dark:border-slate-600 dark:bg-slate-800/60">
              <td className="sticky left-0 z-10 bg-slate-100 px-4 py-2 dark:bg-slate-800/60 w-[280px] min-w-[280px]">
                TOTAL
              </td>
              {SUMMARY_COLS.map((c) => (
                <SummaryCell
                  key={c.key}
                  colKey={c.key}
                  val={total[c.key]}
                  modified={total.modified}
                  colorCls={c.strong ? "text-brand-700 dark:text-brand-300" : ""}
                  pctCls="text-[9px]"
                />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Simplified per-WBS "Budget overview": Approved (= Modified) budget, Actual,
// Committed and Available (= Approved − Actual − Committed) per WBS leg, plus a
// TOTAL row and two utilization chips (Actual % and Actual+Committed % of the
// total Approved budget). Follows the selected year + currency like the tables
// above (same buildSummary("wbs") source, so rows match the by-WBS summary).
function BudgetOverview({ scoped, yearMult }) {
  const { rows, total } = useMemo(
    () => buildSummary(scoped, yearMult, "wbs"),
    [scoped, yearMult]
  );
  if (rows.length === 0)
    return (
      <div className="card px-4 py-6 text-center text-sm text-slate-400">
        No budget elements to summarize.
      </div>
    );

  const avail = (a) => a.modified - a.actual - a.commitment;
  const pctOf = (v) => (total.modified > 0 ? Math.round((v / total.modified) * 100) : null);
  const actPct = pctOf(total.actual);
  const acPct = pctOf(total.actual + total.commitment);
  const apPct = pctOf(total.actfc); // actual + commitment + planned(forecast)

  // measure the table's rendered width so the two chips together span exactly
  // half of it (the chips row width = tableW/2, split into two equal columns)
  const tableRef = useRef(null);
  const [tableW, setTableW] = useState(0);
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTableW(el.offsetWidth));
    ro.observe(el);
    setTableW(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const NUM = "px-4 py-1 text-right tabular-nums whitespace-nowrap";
  const bodyRow = (label, a, key) => (
    <tr key={key} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <td className="px-4 py-1 text-[13px]">{label}</td>
      <td className={`${NUM} bg-amber-50/70 dark:bg-amber-500/[0.06]`}>{fmt(a.modified)}</td>
      <td className={`${NUM} bg-amber-100/60 dark:bg-amber-500/[0.12]`}>{fmt(a.actual)}</td>
      <td className={`${NUM} bg-sky-50/70 dark:bg-sky-500/[0.08]`}>{fmt(a.commitment)}</td>
      <td className={`${NUM} bg-emerald-50/70 dark:bg-emerald-500/[0.07]`}>{fmt(avail(a))}</td>
      <td className={`${NUM} bg-orange-50/70 dark:bg-orange-500/[0.08]`}>{fmt(a.forecast)}</td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <div ref={tableRef} className="card w-[1180px] max-w-full overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-teal-800 text-[13px] font-bold text-white dark:bg-teal-900">
                <th className="px-4 py-1.5 text-left">WBS / Cost category</th>
                <th className="px-4 py-1.5 text-right">Approved Budget</th>
                <th className="px-4 py-1.5 text-right">Actual</th>
                <th className="px-4 py-1.5 text-right">Committed</th>
                <th className="px-4 py-1.5 text-right">Available</th>
                <th className="px-4 py-1.5 text-right">Planned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => bodyRow(r.label, r.agg, r.label))}
              <tr className="border-t-2 border-teal-200 bg-teal-50 text-[13px] font-extrabold text-teal-900 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-100">
                <td className="px-4 py-1.5">TOTAL</td>
                <td className={NUM}>{fmt(total.modified)}</td>
                <td className={NUM}>{fmt(total.actual)}</td>
                <td className={NUM}>{fmt(total.commitment)}</td>
                <td className={NUM}>{fmt(avail(total))}</td>
                <td className={NUM}>{fmt(total.forecast)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-2"
        style={{ width: tableW ? tableW / 2 : undefined }}
      >
        <div className="rounded-lg bg-yellow-400 px-2 py-2 text-center text-black">
          <div className="text-xs font-bold leading-tight">Budget utilization Actual</div>
          <div className="mt-0.5 text-xl font-extrabold">{actPct === null ? "—" : `${actPct}%`}</div>
        </div>
        <div className="rounded-lg bg-green-500 px-2 py-2 text-center text-black">
          <div className="text-xs font-bold leading-tight">Budget utilization Actual + committed</div>
          <div className="mt-0.5 text-xl font-extrabold">{acPct === null ? "—" : `${acPct}%`}</div>
        </div>
        <div className="rounded-lg bg-sky-300 px-2 py-2 text-center text-black">
          <div className="text-xs font-bold leading-tight">Budget utilization Actual + committed + planned</div>
          <div className="mt-0.5 text-xl font-extrabold">{apPct === null ? "—" : `${apPct}%`}</div>
        </div>
      </div>
    </div>
  );
}
