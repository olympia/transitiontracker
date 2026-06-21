import React, { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Settings2,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Layers,
  Coins,
} from "lucide-react";
import { api } from "../api";
import { Spinner, EmptyState, Modal, Field, Toggle } from "../components/ui.jsx";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CR_KINDS = [
  { id: "carry_over", label: "Carry Over" },
  { id: "reallocation", label: "Budget Reallocation" },
  { id: "cancelation", label: "Budget Cancellation" },
  { id: "cr", label: "CR" },
];

// Hungarian style: space thousands separator, comma decimal. Integers show no
// decimals; fractional values are rounded to 2 places.
function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const r = Math.round(n * 100) / 100;
  const dec = Number.isInteger(r) ? 0 : 2;
  return new Intl.NumberFormat("hu-HU", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(r);
}

function num(v) {
  if (typeof v === "string") v = v.replace(/\s/g, "").replace(",", ".");
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// group the integer part live while typing (space thousands, comma decimal)
function fmtDraft(raw) {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).replace(/\s/g, "").replace(".", ",");
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  s = s.replace(/[^\d,]/g, "");
  const parts = s.split(",");
  const intp = parts[0].replace(/^0+(?=\d)/, "");
  const grouped =
    intp === "" ? "" : new Intl.NumberFormat("hu-HU").format(parseInt(intp, 10));
  let out = grouped;
  if (parts.length > 1) out += "," + parts[1].slice(0, 2);
  return (neg ? "-" : "") + out;
}

// base amount for one month of an item, for a given field ('budget'|'realized')
function monthAmount(item, m, field) {
  const v = num(m[`${field}_value`]);
  return item.item_type === "manday" ? v * num(item.daily_rate) : v;
}

// yearly aggregates (base currency) from the monthly values
function aggItem(item, cutoff) {
  let budget = 0;
  let actual = 0;
  let forecast = 0;
  for (const m of item.months) {
    budget += monthAmount(item, m, "budget");
    const rv = monthAmount(item, m, "realized");
    if (m.month < cutoff) actual += rv;
    else forecast += rv;
  }
  return { budget, actual, forecast, total: actual + forecast };
}

// Pick which year tab to open: the current calendar year if present; otherwise
// the latest year if we're past it, or the earliest if we're before all of them.
function pickDefaultYear(list) {
  if (!list.length) return null;
  const cy = new Date().getFullYear();
  const exact = list.find((y) => y.year === cy);
  if (exact) return exact.id;
  const minY = list.reduce((a, y) => (y.year < a.year ? y : a), list[0]);
  const maxY = list.reduce((a, y) => (y.year > a.year ? y : a), list[0]);
  return cy > maxY.year ? maxY.id : minY.id;
}

function sumAgg(list) {
  return list.reduce(
    (a, x) => ({
      budget: a.budget + x.budget,
      actual: a.actual + x.actual,
      forecast: a.forecast + x.forecast,
      total: a.total + x.total,
    }),
    { budget: 0, actual: 0, forecast: 0, total: 0 }
  );
}

export default function Finance({ project, onProjectChange }) {
  const [years, setYears] = useState(null);
  const [categories, setCategories] = useState([]);
  const [yearId, setYearId] = useState(null);
  const [data, setData] = useState(null);
  const [loadingView, setLoadingView] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemEdit, setItemEdit] = useState(null); // { legId, item, isCr? }
  const [legEdit, setLegEdit] = useState(null);
  const [displayCur, setDisplayCur] = useState(
    () => localStorage.getItem("tt-fin-cur") || ""
  );

  async function loadYears(selectId) {
    const list = await api.listYears(project.id);
    setYears(list);
    setYearId((cur) => {
      const target = selectId ?? cur;
      if (target && list.some((y) => y.id === target)) return target;
      return pickDefaultYear(list);
    });
  }

  async function loadCategories() {
    setCategories(await api.listCategories(project.id));
  }

  async function loadView() {
    if (!yearId) {
      setData(null);
      return;
    }
    setLoadingView(true);
    try {
      setData(await api.financeView(yearId));
    } finally {
      setLoadingView(false);
    }
  }

  useEffect(() => {
    setYears(null);
    setYearId(null);
    setData(null);
    loadYears();
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    loadView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  const codes = useMemo(
    () => ({
      base: data?.project.base_currency || project.base_currency || "",
      rep1: data?.project.reporting_currency_1 || project.reporting_currency_1 || "",
      rep2: data?.project.reporting_currency_2 || project.reporting_currency_2 || "",
    }),
    [data, project]
  );

  const rates = useMemo(
    () => ({ r1: num(data?.year.rate_1), r2: num(data?.year.rate_2) }),
    [data]
  );
  const cutoff = data?.year.forecast_from_month ?? 1;

  // currencies available in the selector: base + configured reporting ones
  const currencyOptions = useMemo(
    () => [codes.base, codes.rep1, codes.rep2].filter(Boolean),
    [codes]
  );
  // effective display currency (fall back to base if the saved one is gone)
  const cur = currencyOptions.includes(displayCur) ? displayCur : codes.base;
  // divisor to convert a base amount into the display currency for this year
  const curFactor =
    cur === codes.base ? 1 : cur === codes.rep1 ? rates.r1 : cur === codes.rep2 ? rates.r2 : 1;
  const isBaseCur = cur === codes.base;

  useEffect(() => {
    if (cur) localStorage.setItem("tt-fin-cur", cur);
  }, [cur]);

  // live local edit of a month value (keeps aggregates instant)
  function patchMonth(monthId, field, value) {
    setData((d) => {
      if (!d) return d;
      const nd = structuredClone(d);
      for (const leg of nd.legs)
        for (const it of leg.items) {
          const mm = it.months.find((m) => m.id === monthId);
          if (mm) {
            mm[`${field}_value`] = value;
            return nd;
          }
        }
      return nd;
    });
  }

  function saveMonth(monthId, field, value) {
    api.updateMonth(monthId, { [`${field}_value`]: num(value) });
  }

  // set PO fields (committed flag / number) on a month: local + persist
  function setPo(monthId, patch) {
    setData((d) => {
      if (!d) return d;
      const nd = structuredClone(d);
      for (const leg of nd.legs)
        for (const it of leg.items) {
          const mm = it.months.find((m) => m.id === monthId);
          if (mm) {
            Object.assign(mm, patch);
            return nd;
          }
        }
      return nd;
    });
    api.updateMonth(monthId, patch);
  }

  // reflect a reallocation's negated value into its partner item's same month
  // locally (the backend mirrors it on save); keeps the grid live
  function mirrorPartner(partnerItemId, monthNumber, field, value) {
    setData((d) => {
      if (!d) return d;
      const nd = structuredClone(d);
      for (const leg of nd.legs)
        for (const it of leg.items)
          if (it.id === partnerItemId) {
            const mm = it.months.find((m) => m.month === monthNumber);
            if (mm) {
              mm[`${field}_value`] = value;
              return nd;
            }
          }
      return nd;
    });
  }

  if (years === null) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Wallet size={20} className="text-brand-600" /> Budget details
          </h2>
          <p className="text-sm text-slate-500">
            SAP WBS legs and budget items per year. Booked in {codes.base || "base currency"}
            {isBaseCur ? "" : `, shown in ${cur}`}.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <button className="btn-subtle" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={16} /> Setup
          </button>
        </div>
      </div>
      {!isBaseCur && curFactor === 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          No {cur} rate set for {data?.year.year}. Set it in Setup to see converted values.
        </div>
      )}

      {years.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No budget years yet"
          subtitle="Open Setup to choose currencies, define WBS categories and add a budget year."
          action={
            <button className="btn-primary" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={16} /> Open setup
            </button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
            {years.map((y) => (
              <button
                key={y.id}
                onClick={() => setYearId(y.id)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                  y.id === yearId
                    ? "bg-white text-brand-600 shadow-soft dark:bg-slate-900"
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {y.year}
              </button>
            ))}
          </div>

          {loadingView && !data ? (
            <Spinner />
          ) : data ? (
            <YearGrid
              data={data}
              codes={codes}
              rates={rates}
              cutoff={cutoff}
              cur={cur}
              curFactor={curFactor}
              isBaseCur={isBaseCur}
              onAddLeg={() => setLegEdit({ yearId: data.year.id, leg: null })}
              onEditLeg={(leg) => setLegEdit({ yearId: data.year.id, leg })}
              onAddItem={(legId) => setItemEdit({ legId, item: null })}
              onEditItem={(legId, item) => setItemEdit({ legId, item })}
              onAddCR={(legId) => setItemEdit({ legId, item: null, isCr: true })}
              onEditCR={(legId, cr) => setItemEdit({ legId, item: cr })}
              patchMonth={patchMonth}
              saveMonth={saveMonth}
              mirror={mirrorPartner}
              setPo={setPo}
              reload={loadView}
            />
          ) : null}
        </>
      )}

      {settingsOpen && (
        <SettingsModal
          project={project}
          years={years}
          categories={categories}
          onClose={() => setSettingsOpen(false)}
          onProjectChange={onProjectChange}
          onYearsChange={(sel) => loadYears(sel)}
          onCategoriesChange={loadCategories}
          reloadView={loadView}
        />
      )}

      {legEdit && (
        <LegModal
          ctx={legEdit}
          categories={categories}
          onClose={() => setLegEdit(null)}
          onOpenSetup={() => {
            setLegEdit(null);
            setSettingsOpen(true);
          }}
          onSaved={() => {
            setLegEdit(null);
            loadView();
          }}
        />
      )}

      {itemEdit && (
        <ItemModal
          ctx={itemEdit}
          codes={codes}
          legs={data?.legs || []}
          onClose={() => setItemEdit(null)}
          onSaved={() => {
            setItemEdit(null);
            loadView();
          }}
        />
      )}

    </div>
  );
}

// ----------------------------------------------------------------- year grid
function YearGrid({
  data,
  codes,
  rates,
  cutoff,
  cur,
  curFactor,
  isBaseCur,
  onAddLeg,
  onEditLeg,
  onAddItem,
  onEditItem,
  onAddCR,
  onEditCR,
  patchMonth,
  saveMonth,
  mirror,
  setPo,
  reload,
}) {
  // convert a base amount into the display currency (null if no rate)
  const conv = (b) => (curFactor ? b / curFactor : null);

  // regular budget items drive the headline totals; CR rows are summed separately
  const legAggs = data.legs.map((leg) =>
    sumAgg(leg.items.filter((it) => !it.is_cr).map((it) => aggItem(it, cutoff)))
  );
  const yearAgg = sumAgg(legAggs);
  const crTotal = data.legs.reduce(
    (a, leg) =>
      a + sumAgg(leg.items.filter((it) => it.is_cr).map((it) => aggItem(it, cutoff))).budget,
    0
  );
  const budgetWithCrs = yearAgg.budget + crTotal;
  const pctOfBudget = (v) => (budgetWithCrs ? (v / budgetWithCrs) * 100 : null);
  // split the year forecast (regular items) into PO-committed (obligó) and not
  let fcCommitted = 0;
  let fcUncommitted = 0;
  for (const leg of data.legs)
    for (const it of leg.items)
      if (!it.is_cr)
        for (const m of it.months)
          if (m.month >= cutoff) {
            const amt = monthAmount(it, m, "realized");
            if (m.po_committed) fcCommitted += amt;
            else fcUncommitted += amt;
          }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard label="Budget" base={yearAgg.budget} conv={conv} cur={cur} />
        <SummaryCard label="Budget with CRs" base={budgetWithCrs} conv={conv} cur={cur} accent />
        <SummaryCard label="Actual" base={yearAgg.actual} conv={conv} cur={cur} pct={pctOfBudget(yearAgg.actual)} />
        <ForecastCard
          total={yearAgg.forecast}
          committed={fcCommitted}
          uncommitted={fcUncommitted}
          conv={conv}
          pctOf={pctOfBudget}
        />
        <SummaryCard label="Total (Actual + FC)" base={yearAgg.total} conv={conv} cur={cur} pct={pctOfBudget(yearAgg.total)} />
      </div>

      {data.legs.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No WBS legs in this year"
          subtitle="Add a SAP WBS leg, then add budget items with monthly values underneath it."
          action={
            <button className="btn-primary" onClick={onAddLeg}>
              <Plus size={16} /> Add WBS leg
            </button>
          }
        />
      ) : (
        <>
          {data.legs.map((leg) => (
            <LegCard
              key={leg.id}
              leg={leg}
              cutoff={cutoff}
              cur={cur}
              conv={conv}
              isBaseCur={isBaseCur}
              onEditLeg={() => onEditLeg(leg)}
              onDeleteLeg={async () => {
                if (window.confirm(`Delete WBS leg "${leg.code || leg.name}" and all its items?`)) {
                  await api.deleteLeg(leg.id);
                  reload();
                }
              }}
              onAddItem={() => onAddItem(leg.id)}
              onEditItem={(item) => onEditItem(leg.id, item)}
              onDeleteItem={async (item) => {
                await api.deleteItem(item.id);
                reload();
              }}
              onAddCR={() => onAddCR(leg.id)}
              onEditCR={(cr) => onEditCR(leg.id, cr)}
              onDeleteCR={async (cr) => {
                await api.deleteItem(cr.id);
                if (cr.partner_item_id) {
                  try {
                    await api.deleteItem(cr.partner_item_id);
                  } catch (e) {}
                }
                reload();
              }}
              patchMonth={patchMonth}
              saveMonth={saveMonth}
              mirror={mirror}
              setPo={setPo}
            />
          ))}
          <button className="btn-subtle" onClick={onAddLeg}>
            <Plus size={16} /> Add WBS leg
          </button>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, base, conv, cur, accent, pct }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 flex items-start justify-between gap-6">
        <span className={`text-2xl font-extrabold tabular-nums ${accent ? "text-emerald-600" : ""}`}>
          {fmt(conv(base))}
        </span>
        {pct != null && (
          <div className="text-right">
            <div className="text-[10px] leading-tight text-slate-400">
              budget utilization vs. budget with CRs
            </div>
            <div className="text-sm font-semibold tabular-nums text-slate-400">
              {Math.round(pct)}%
            </div>
          </div>
        )}
      </div>
      <div className="text-xs font-medium text-slate-400">{cur}</div>
    </div>
  );
}

// Forecast chip with an obligó / no-obligó breakdown
function ForecastCard({ total, committed, uncommitted, conv, pctOf }) {
  const line = (v) => `${fmt(conv(v))}${pctOf(v) != null ? ` · ${Math.round(pctOf(v))}%` : ""}`;
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Forecast
      </div>
      <div className="mt-1 flex items-start justify-between gap-4">
        <span className="text-2xl font-extrabold tabular-nums">{fmt(conv(total))}</span>
        {pctOf(total) != null && (
          <span className="text-sm font-semibold tabular-nums text-slate-400">
            {Math.round(pctOf(total))}%
          </span>
        )}
      </div>
      <div className="mt-1.5 space-y-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> obligó
          </span>
          <span>{line(committed)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" /> no obligó
          </span>
          <span>{line(uncommitted)}</span>
        </div>
      </div>
    </div>
  );
}

// zebra background for an aggregate block (Budget/Actual/Forecast/Total) so the
// four blocks read as separate columns, mirroring the Excel layout
const AGG_ZEBRA = "bg-slate-50/70 dark:bg-slate-800/30";
// uniform width for every numeric column (fits e.g. "9 999 999,99" + spare),
// independent of content so all columns line up
const COL_W = "w-[172px] min-w-[172px] whitespace-nowrap";
// vertical separator drawn before each month (except the first)
const MONTH_SEP = "border-l border-slate-200 dark:border-slate-700";

function LegCard({
  leg,
  cutoff,
  cur,
  conv,
  isBaseCur,
  onEditLeg,
  onDeleteLeg,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onAddCR,
  onEditCR,
  onDeleteCR,
  patchMonth,
  saveMonth,
  mirror,
  setPo,
}) {
  // regular budget items and change-request rows live in the same list
  const regular = leg.items.filter((it) => !it.is_cr);
  const crs = leg.items.filter((it) => it.is_cr);
  const regAggs = regular.map((it) => aggItem(it, cutoff));
  const crAggs = crs.map((it) => aggItem(it, cutoff));
  const budgetAgg = sumAgg(regAggs);
  const withCrsAgg = sumAgg([...regAggs, ...crAggs]);
  // per-month totals (base currency) for a given list of items
  const monthTot = (list) =>
    MONTHS.map((_, idx) => {
      const month = idx + 1;
      let b = 0;
      let r = 0;
      for (const it of list) {
        const mm = it.months.find((x) => x.month === month);
        if (mm) {
          b += monthAmount(it, mm, "budget");
          r += monthAmount(it, mm, "realized");
        }
      }
      return { b, r };
    });
  const budgetMonths = monthTot(regular);
  const withCrsMonths = monthTot([...regular, ...crs]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 bg-slate-800 px-4 py-3 dark:bg-slate-600">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px] font-extrabold text-white">{leg.code || "—"}</span>
            {leg.category && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-slate-100 ring-1 ring-inset ring-white/15">
                {leg.category}
              </span>
            )}
          </div>
          {leg.name && <div className="truncate text-sm text-slate-300">{leg.name}</div>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost px-2 py-1 text-slate-200 hover:text-white" onClick={onEditLeg} title="Edit leg">
            <Pencil size={15} />
          </button>
          <button className="btn-ghost px-2 py-1 text-rose-400 hover:text-rose-300" onClick={onDeleteLeg} title="Delete leg">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="bg-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              <th rowSpan={2} className="sticky left-0 z-10 bg-slate-200 px-4 py-2 text-left dark:bg-slate-700">
                Item
              </th>
              <th rowSpan={2} className={`px-3 py-2 text-right ${COL_W}`}>Budget</th>
              <th rowSpan={2} className={`px-3 py-2 text-right ${COL_W}`}>Actual</th>
              <th rowSpan={2} className={`px-3 py-2 text-right ${COL_W}`}>Forecast</th>
              <th rowSpan={2} className={`border-r border-slate-300 px-3 py-2 text-right dark:border-slate-600 ${COL_W}`}>Total</th>
              {MONTHS.map((mn, idx) => (
                <th
                  key={mn}
                  colSpan={2}
                  className={`px-2 py-1 text-center ${idx > 0 ? MONTH_SEP : ""}`}
                >
                  {mn}
                </th>
              ))}
              <th rowSpan={2}></th>
            </tr>
            <tr className="bg-slate-200 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              {MONTHS.map((mn, idx) => {
                const fc = idx + 1 >= cutoff;
                return (
                  <React.Fragment key={mn}>
                    <th className={`${COL_W} px-1 py-1 text-center font-medium ${idx > 0 ? MONTH_SEP : ""}`}>Budget</th>
                    <th className={`${COL_W} px-1 py-1 text-center font-medium ${fc ? "text-orange-700" : "text-emerald-600"}`}>
                      {fc ? "Forecast" : "Actual"}
                    </th>
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {regular.length === 0 && crs.length === 0 && (
              <tr>
                <td colSpan={5 + 24 + 1} className="px-4 py-4 text-center text-sm text-slate-400">
                  No budget items yet.
                </td>
              </tr>
            )}
            {regular.map((it, i) => (
              <ItemRow
                key={it.id}
                it={it}
                agg={regAggs[i]}
                cur={cur}
                conv={conv}
                isBaseCur={isBaseCur}
                onEdit={() => onEditItem(it)}
                onDelete={() => onDeleteItem(it)}
                patchMonth={patchMonth}
                saveMonth={saveMonth}
                mirror={mirror}
                setPo={setPo}
                cutoff={cutoff}
              />
            ))}
            <TotalRow label="TOTAL" agg={budgetAgg} monthTotals={budgetMonths} conv={conv} />
            {crs.map((it, i) => (
              <ItemRow
                key={it.id}
                it={it}
                agg={crAggs[i]}
                cur={cur}
                conv={conv}
                isBaseCur={isBaseCur}
                onEdit={() => onEditCR(it)}
                onDelete={() => onDeleteCR(it)}
                patchMonth={patchMonth}
                saveMonth={saveMonth}
                mirror={mirror}
                setPo={setPo}
                cutoff={cutoff}
              />
            ))}
            {crs.length > 0 && (
              <TotalRow label="TOTAL with CRs" agg={withCrsAgg} monthTotals={withCrsMonths} conv={conv} />
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col items-start gap-0.5 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
        <button className="btn-ghost text-xs" onClick={onAddItem}>
          <Plus size={14} /> Add budget item
        </button>
        <button className="btn-ghost text-xs" onClick={onAddCR}>
          <Plus size={14} /> Add CR
        </button>
      </div>
    </div>
  );
}

// one row in the grid — used for both regular budget items and CR rows
function ItemRow({ it, agg, cur, conv, isBaseCur, onEdit, onDelete, patchMonth, saveMonth, mirror, setPo, cutoff }) {
  const a = agg;
  const cz = (v) => (v === 0 ? "" : fmt(conv(v)));
  // a reallocation only moves budget, so its actual/forecast cells are locked
  const lockRealized = it.is_cr && it.cr_kind === "reallocation";
  const commit = (m, field, v) => {
    patchMonth(m.id, field, v);
    saveMonth(m.id, field, v);
    if (it.partner_item_id && mirror) mirror(it.partner_item_id, m.month, field, -num(v));
  };
  return (
    <tr className="group hover:bg-slate-100 dark:hover:bg-slate-800">
      <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-1.5 font-light text-slate-400 dark:bg-slate-900 group-hover:bg-slate-100 dark:group-hover:bg-slate-800">
        {it.is_cr && (
          <span className="mr-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {CR_KINDS.find((k) => k.id === it.cr_kind)?.label || "CR"}
          </span>
        )}
        {it.is_cr ? (
          it.name && (
            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">{it.name}</span>
          )
        ) : (
          it.name || "—"
        )}
        {it.item_type === "manday" && (
          <span className="ml-2 text-[11px] font-normal text-slate-400">
            {fmt(conv(it.daily_rate))} {cur}/d
          </span>
        )}
      </td>
      <td className={`px-3 py-1.5 text-right font-light tabular-nums text-slate-400 ${COL_W} ${AGG_ZEBRA}`}>{fmt(conv(a.budget))}</td>
      <td className={`px-3 py-1.5 text-right font-light tabular-nums text-slate-400 ${COL_W}`}>{fmt(conv(a.actual))}</td>
      <td className={`px-3 py-1.5 text-right font-light tabular-nums text-slate-400 ${COL_W} ${AGG_ZEBRA}`}>{fmt(conv(a.forecast))}</td>
      <td className={`border-r border-slate-200 px-3 py-1.5 text-right font-light tabular-nums text-slate-400 dark:border-slate-700 ${COL_W}`}>{fmt(conv(a.total))}</td>
      {it.months.map((m) => {
        const zebra = m.month % 2 === 0;
        if (isBaseCur) {
          return (
            <React.Fragment key={m.id}>
              <MoneyInput
                value={m.budget_value}
                zebra={zebra}
                sep={m.month > 1}
                onCommit={(v) => commit(m, "budget", v)}
              />
              <MoneyInput
                value={m.realized_value}
                zebra={zebra}
                disabled={lockRealized}
                committed={m.month >= cutoff && m.po_committed}
                poNumber={m.po_number}
                onToggle={
                  m.month >= cutoff && !lockRealized
                    ? (c) => setPo(m.id, { po_committed: c })
                    : undefined
                }
                onEditPo={() => {
                  const n = window.prompt("PO number", m.po_number || "");
                  if (n !== null) setPo(m.id, { po_number: n.trim() });
                }}
                onCommit={(v) => commit(m, "realized", v)}
              />
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={m.id}>
            <td className={`px-3 py-1.5 text-right text-[13px] font-light tabular-nums text-slate-400 ${COL_W} ${m.month > 1 ? MONTH_SEP : ""} ${zebra ? AGG_ZEBRA : ""}`}>
              {cz(monthAmount(it, m, "budget"))}
            </td>
            <td className={`px-3 py-1.5 text-right text-[13px] font-light tabular-nums text-slate-400 ${COL_W} ${zebra ? AGG_ZEBRA : ""}`}>
              {cz(monthAmount(it, m, "realized"))}
            </td>
          </React.Fragment>
        );
      })}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button className="btn-ghost px-1.5 py-1" onClick={onEdit} title="Edit">
            <Pencil size={14} />
          </button>
          <button className="btn-ghost px-1.5 py-1 text-rose-500" onClick={onDelete} title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// the TOTAL and TOTAL with CRs summary rows
function TotalRow({ label, agg, monthTotals, conv }) {
  const cz = (v) => (v === 0 ? "" : fmt(conv(v)));
  return (
    <tr className="bg-slate-50 dark:bg-[#172132]">
      <td className="sticky left-0 z-10 bg-slate-50 px-4 py-1.5 font-medium dark:bg-[#172132]">{label}</td>
      <td className={`px-3 py-1.5 text-right font-light tabular-nums text-slate-400 ${COL_W} ${AGG_ZEBRA}`}>{fmt(conv(agg.budget))}</td>
      <td className={`px-3 py-1.5 text-right font-light tabular-nums text-slate-400 ${COL_W}`}>{fmt(conv(agg.actual))}</td>
      <td className={`px-3 py-1.5 text-right font-light tabular-nums text-slate-400 ${COL_W} ${AGG_ZEBRA}`}>{fmt(conv(agg.forecast))}</td>
      <td className={`border-r border-slate-200 px-3 py-1.5 text-right font-light tabular-nums text-slate-400 dark:border-slate-700 ${COL_W}`}>{fmt(conv(agg.total))}</td>
      {monthTotals.map((mt, idx) => {
        const zebra = (idx + 1) % 2 === 0;
        return (
          <React.Fragment key={idx}>
            <td className={`px-3 py-1.5 text-right text-[13px] font-light tabular-nums text-slate-400 ${COL_W} ${idx > 0 ? MONTH_SEP : ""} ${zebra ? AGG_ZEBRA : ""}`}>{cz(mt.b)}</td>
            <td className={`px-3 py-1.5 text-right text-[13px] font-light tabular-nums text-slate-400 ${COL_W} ${zebra ? AGG_ZEBRA : ""}`}>{cz(mt.r)}</td>
          </React.Fragment>
        );
      })}
      <td></td>
    </tr>
  );
}

function MoneyInput({ value, onCommit, zebra, disabled, sep, committed, poNumber, onToggle, onEditPo }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const display = focused
    ? draft
    : num(value) === 0
    ? ""
    : fmt(num(value));
  const hasPo = !!onToggle; // forecast cell with PO controls
  return (
    <td className={`px-2 py-1 ${COL_W} ${sep ? MONTH_SEP : ""} ${zebra ? "bg-slate-50/70 dark:bg-slate-800/30" : ""}`}>
      <div
        className={`flex h-7 items-center gap-1 rounded-md border px-1 ${
          disabled
            ? "border-transparent"
            : committed
            ? "border-solid border-emerald-500"
            : "border-dashed border-slate-200/70 dark:border-slate-700/60"
        } ${disabled ? "" : "bg-white focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 dark:bg-slate-900"}`}
      >
        {hasPo && (
          <input
            type="checkbox"
            checked={!!committed}
            onChange={(e) => onToggle(e.target.checked)}
            title="PO committed (obligó)"
            className="h-3 w-3 shrink-0 accent-emerald-500"
          />
        )}
        {hasPo && committed && (
          <button
            type="button"
            onClick={onEditPo}
            title={poNumber ? `PO: ${poNumber}` : "Set PO number"}
            className="shrink-0 rounded bg-slate-100 px-1 text-[9px] font-bold leading-4 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
          >
            PO
          </button>
        )}
        <input
          className={`h-full w-full min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-[13px] font-light tabular-nums outline-none ${
            disabled ? "cursor-not-allowed text-slate-300 dark:text-slate-600" : "text-slate-400"
          }`}
          type="text"
          inputMode="decimal"
          value={display}
          placeholder={disabled ? "" : "0"}
          disabled={disabled}
          onFocus={() => {
            setDraft(num(value) === 0 ? "" : fmtDraft(String(value)));
            setFocused(true);
          }}
          onChange={(e) => setDraft(fmtDraft(e.target.value))}
          onBlur={() => {
            setFocused(false);
            onCommit(num(draft));
          }}
        />
      </div>
    </td>
  );
}

// ----------------------------------------------------------------- leg modal
function LegModal({ ctx, categories, onClose, onOpenSetup, onSaved }) {
  const editing = !!ctx.leg;
  const [code, setCode] = useState(ctx.leg?.code || "");
  const [name, setName] = useState(ctx.leg?.name || "");
  const [category, setCategory] = useState(
    ctx.leg?.category || categories[0]?.name || ""
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload = { code: code.trim(), name: name.trim(), category };
      if (editing) await api.updateLeg(ctx.leg.id, payload);
      else await api.createLeg(ctx.yearId, payload);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit WBS leg" : "New WBS leg"}
      footer={
        <>
          <button className="btn-subtle" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>Save</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="SAP WBS code">
          <input
            className="input font-mono"
            value={code}
            autoFocus
            placeholder="e.g. FI2328.01/90_Intangible"
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Field label="Name / description">
          <input
            className="input"
            value={name}
            placeholder="Optional description"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Category">
          {categories.length === 0 ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              No categories defined yet.{" "}
              <button className="font-semibold underline" onClick={onOpenSetup}>
                Add some in Setup
              </button>
              .
            </div>
          ) : (
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- item modal
function ItemModal({ ctx, codes, legs = [], onClose, onSaved }) {
  const it = ctx.item;
  const editing = !!it;
  const isCr = ctx.isCr || it?.is_cr || false;
  const [name, setName] = useState(it?.name || "");
  const [isManday, setIsManday] = useState(it?.item_type === "manday");
  const [rate, setRate] = useState(it?.daily_rate ?? 0);
  const [crKind, setCrKind] = useState(it?.cr_kind || "cr");
  const otherLegs = legs.filter((l) => l.id !== ctx.legId);
  const [partnerId, setPartnerId] = useState(() => otherLegs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  // CRs are always fixed amounts; every CR kind carries a title except Carry Over
  const showTitle = !isCr || crKind !== "carry_over";
  const useManday = !isCr && isManday;
  // a reallocation is created as a linked pair across two WBS legs
  const isRealloc = isCr && crKind === "reallocation";
  const pairing = isRealloc && !editing;

  async function save() {
    if (pairing && !partnerId) {
      window.alert("Choose the counterpart WBS leg for the reallocation.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: showTitle ? name.trim() : "",
        item_type: useManday ? "manday" : "fixed",
        daily_rate: useManday ? num(rate) : 0,
        is_cr: isCr,
        cr_kind: isCr ? crKind : "",
      };
      if (editing) {
        await api.updateItem(it.id, payload);
      } else if (pairing) {
        // create the reallocation on both legs and link them
        const src = await api.createItem(ctx.legId, payload);
        const partner = await api.createItem(Number(partnerId), payload);
        await api.updateItem(src.id, { partner_item_id: partner.id });
        await api.updateItem(partner.id, { partner_item_id: src.id });
      } else {
        await api.createItem(ctx.legId, payload);
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const noun = isCr ? "change request" : "budget item";

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${noun}` : `New ${noun}`}
      footer={
        <>
          <button className="btn-subtle" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>Save</button>
        </>
      }
    >
      <div className="space-y-4">
        {isCr && (
          <Field label="Kind">
            <select className="input" value={crKind} autoFocus onChange={(e) => setCrKind(e.target.value)}>
              {CR_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
          </Field>
        )}
        {pairing && (
          <Field label="Counterpart WBS leg">
            {otherLegs.length === 0 ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                Need at least one other WBS leg in this year to reallocate to.
              </div>
            ) : (
              <>
                <select className="input" value={partnerId} onChange={(e) => setPartnerId(Number(e.target.value))}>
                  {otherLegs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code || l.name || `Leg ${l.id}`}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  A matching reallocation is created there; each month you enter is mirrored with the opposite sign.
                </p>
              </>
            )}
          </Field>
        )}
        {showTitle && (
          <Field label={isCr ? "Change request title" : "Item title"}>
            <input className="input" value={name} autoFocus={!isCr} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        {!isCr && (
          <>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
              <div>
                <div className="text-sm font-semibold">Manday based</div>
                <div className="text-xs text-slate-500">
                  {isManday
                    ? `Monthly value = manday × daily rate (${codes.base})`
                    : `Monthly value = fixed amount in ${codes.base}`}
                </div>
              </div>
              <Toggle checked={isManday} onChange={setIsManday} />
            </div>
            {isManday && (
              <Field label={`Daily rate (${codes.base})`}>
                <input
                  className="input"
                  type="number"
                  step="any"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </Field>
            )}
          </>
        )}
        <p className="text-xs text-slate-500">
          After saving, enter the monthly {isCr ? "amounts" : "Budget and Actual/Forecast values"} directly in the row.
        </p>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- settings
function SettingsModal({
  project,
  years,
  categories,
  onClose,
  onProjectChange,
  onYearsChange,
  onCategoriesChange,
  reloadView,
}) {
  const [base, setBase] = useState(project.base_currency || "HUF");
  const [rep1, setRep1] = useState(project.reporting_currency_1 || "");
  const [rep2, setRep2] = useState(project.reporting_currency_2 || "");
  const [savingCur, setSavingCur] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newYear, setNewYear] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveCurrencies() {
    setSavingCur(true);
    try {
      await api.updateProject(project.id, {
        base_currency: base.trim() || "HUF",
        reporting_currency_1: rep1.trim(),
        reporting_currency_2: rep2.trim(),
      });
      if (onProjectChange) await onProjectChange();
      reloadView();
    } finally {
      setSavingCur(false);
    }
  }

  async function addCategory() {
    if (!newCat.trim()) return;
    await api.createCategory(project.id, { name: newCat.trim() });
    setNewCat("");
    onCategoriesChange();
  }

  async function addYear() {
    const y = parseInt(newYear, 10);
    if (!y) return;
    setBusy(true);
    try {
      const created = await api.createYear(project.id, {
        year: y,
        rate_1: 0,
        rate_2: 0,
        forecast_from_month: 1,
      });
      setNewYear("");
      onYearsChange(created.id);
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} wide title="Financial setup">
      <div className="space-y-6">
        <section>
          <h4 className="mb-2 text-sm font-bold">Currencies</h4>
          <p className="mb-3 text-xs text-slate-500">
            Amounts are booked in the base currency. Up to two reporting currencies are shown
            on totals, converted with the per-year rates below.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Base">
              <input className="input uppercase" value={base} maxLength={5} onChange={(e) => setBase(e.target.value)} />
            </Field>
            <Field label="Reporting 1">
              <input className="input uppercase" value={rep1} maxLength={5} placeholder="e.g. EUR" onChange={(e) => setRep1(e.target.value)} />
            </Field>
            <Field label="Reporting 2">
              <input className="input uppercase" value={rep2} maxLength={5} placeholder="e.g. USD" onChange={(e) => setRep2(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <button className="btn-primary" onClick={saveCurrencies} disabled={savingCur}>
              Save currencies
            </button>
          </div>
        </section>

        <section className="border-t border-slate-100 pt-5 dark:border-slate-800">
          <h4 className="mb-2 text-sm font-bold">WBS categories</h4>
          <p className="mb-3 text-xs text-slate-500">
            The category options a WBS leg can be assigned to (e.g. Internal CAPEX, External
            CAPEX Tangible, External OPEX).
          </p>
          <div className="space-y-1.5">
            {categories.map((c) => (
              <CategoryRow key={c.id} cat={c} onChanged={onCategoriesChange} />
            ))}
            {categories.length === 0 && (
              <div className="text-xs text-slate-400">No categories yet.</div>
            )}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <Field label="Add category">
              <input
                className="input w-64"
                value={newCat}
                placeholder="e.g. Internal CAPEX"
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
              />
            </Field>
            <button className="btn-subtle" onClick={addCategory}>
              <Plus size={16} /> Add
            </button>
          </div>
        </section>

        <section className="border-t border-slate-100 pt-5 dark:border-slate-800">
          <h4 className="mb-2 text-sm font-bold">Years, rates & forecast cutoff</h4>
          <p className="mb-3 text-xs text-slate-500">
            Rate = how many {base || "base"} equal 1 unit of the reporting currency (0 hides it).
            "Forecast from" is the first month counted as Forecast; earlier months count as Actual.
          </p>
          <div className="space-y-2">
            {years.map((y) => (
              <YearRow key={y.id} year={y} rep1={rep1} rep2={rep2} onChanged={() => { onYearsChange(y.id); reloadView(); }} />
            ))}
            {years.length === 0 && <div className="text-xs text-slate-400">No years yet.</div>}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <Field label="Add year">
              <input
                className="input w-32"
                type="number"
                value={newYear}
                placeholder="2026"
                onChange={(e) => setNewYear(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addYear()}
              />
            </Field>
            <button className="btn-subtle" onClick={addYear} disabled={busy}>
              <Plus size={16} /> Add
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function CategoryRow({ cat, onChanged }) {
  const [name, setName] = useState(cat.name);
  const [dirty, setDirty] = useState(false);

  async function save() {
    await api.updateCategory(cat.id, { name: name.trim() });
    setDirty(false);
    onChanged();
  }

  async function remove() {
    if (window.confirm(`Delete category "${cat.name}"? Existing legs keep their label.`)) {
      await api.deleteCategory(cat.id);
      onChanged();
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800/50">
      <input
        className="input h-8 flex-1"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setDirty(true);
        }}
      />
      {dirty && (
        <button className="btn-primary h-8 px-3 text-xs" onClick={save}>Save</button>
      )}
      <button className="btn-ghost px-2 py-1 text-rose-500" onClick={remove}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function YearRow({ year, rep1, rep2, onChanged }) {
  const [r1, setR1] = useState(year.rate_1 || 0);
  const [r2, setR2] = useState(year.rate_2 || 0);
  const [cut, setCut] = useState(year.forecast_from_month || 1);
  const [dirty, setDirty] = useState(false);

  async function save() {
    await api.updateYear(year.id, {
      rate_1: num(r1),
      rate_2: num(r2),
      forecast_from_month: num(cut),
    });
    setDirty(false);
    onChanged();
  }

  async function remove() {
    if (window.confirm(`Delete year ${year.year} and all its WBS legs and items?`)) {
      await api.deleteYear(year.id);
      onChanged();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
      <span className="w-12 font-bold">{year.year}</span>
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        {rep1 || "Rep1"}
        <input className="input h-8 w-20" type="number" step="any" value={r1}
          onChange={(e) => { setR1(e.target.value); setDirty(true); }} />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        {rep2 || "Rep2"}
        <input className="input h-8 w-20" type="number" step="any" value={r2}
          onChange={(e) => { setR2(e.target.value); setDirty(true); }} />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        FC from
        <select className="input h-8 w-28" value={cut}
          onChange={(e) => { setCut(e.target.value); setDirty(true); }}>
          {MONTHS.map((mn, idx) => (
            <option key={mn} value={idx + 1}>{mn}</option>
          ))}
          <option value={13}>none (all Actual)</option>
        </select>
      </label>
      <div className="ml-auto flex items-center gap-1">
        {dirty && <button className="btn-primary h-8 px-3 text-xs" onClick={save}>Save</button>}
        <button className="btn-ghost px-2 py-1 text-rose-500" onClick={remove}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
