import React, { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Settings2,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Layers,
} from "lucide-react";
import { api } from "../api";
import { Spinner, EmptyState, Modal, Field, Toggle } from "../components/ui.jsx";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const CR_KINDS = [
  { id: "carry_over", label: "Carry Over" },
  { id: "reallocation", label: "Budget Reallocation" },
  { id: "cancelation", label: "Budget Cancelation" },
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
  const [itemEdit, setItemEdit] = useState(null); // { legId, item }
  const [crEdit, setCrEdit] = useState(null);
  const [legEdit, setLegEdit] = useState(null);

  async function loadYears(selectId) {
    const list = await api.listYears(project.id);
    setYears(list);
    setYearId((cur) => {
      const target = selectId ?? cur;
      if (target && list.some((y) => y.id === target)) return target;
      return list[0]?.id ?? null;
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

  if (years === null) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Wallet size={20} className="text-brand-600" /> Budget details
          </h2>
          <p className="text-sm text-slate-500">
            SAP WBS legs and budget items per year, in {codes.base || "base currency"}
            {codes.rep1 ? ` · ${codes.rep1}` : ""}
            {codes.rep2 ? ` · ${codes.rep2}` : ""}.
          </p>
        </div>
        <button className="btn-subtle" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={16} /> Setup
        </button>
      </div>

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
              onAddLeg={() => setLegEdit({ yearId: data.year.id, leg: null })}
              onEditLeg={(leg) => setLegEdit({ yearId: data.year.id, leg })}
              onAddItem={(legId) => setItemEdit({ legId, item: null })}
              onEditItem={(legId, item) => setItemEdit({ legId, item })}
              onAddCR={(legId) => setCrEdit({ legId, cr: null })}
              onEditCR={(legId, cr) => setCrEdit({ legId, cr })}
              patchMonth={patchMonth}
              saveMonth={saveMonth}
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
          onClose={() => setItemEdit(null)}
          onSaved={() => {
            setItemEdit(null);
            loadView();
          }}
        />
      )}

      {crEdit && (
        <CRModal
          ctx={crEdit}
          codes={codes}
          onClose={() => setCrEdit(null)}
          onSaved={() => {
            setCrEdit(null);
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
  onAddLeg,
  onEditLeg,
  onAddItem,
  onEditItem,
  onAddCR,
  onEditCR,
  patchMonth,
  saveMonth,
  reload,
}) {
  // year-level totals
  const legAggs = data.legs.map((leg) => sumAgg(leg.items.map((it) => aggItem(it, cutoff))));
  const yearAgg = sumAgg(legAggs);
  const crTotal = data.legs.reduce(
    (a, leg) => a + leg.change_requests.reduce((s, c) => s + num(c.amount), 0),
    0
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Budget" base={yearAgg.budget} rates={rates} codes={codes} />
        <SummaryCard
          label="Budget with CRs"
          base={yearAgg.budget + crTotal}
          rates={rates}
          codes={codes}
          accent
        />
        <SummaryCard label="Actual" base={yearAgg.actual} rates={rates} codes={codes} />
        <SummaryCard
          label="Total (Actual + FC)"
          base={yearAgg.total}
          rates={rates}
          codes={codes}
        />
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
              codes={codes}
              rates={rates}
              cutoff={cutoff}
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
                await api.deleteCR(cr.id);
                reload();
              }}
              patchMonth={patchMonth}
              saveMonth={saveMonth}
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

function SummaryCard({ label, base, rates, codes, accent }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-extrabold tabular-nums ${accent ? "text-emerald-600" : ""}`}>
        {fmt(base)}
      </div>
      <div className="text-xs font-medium text-slate-400">
        {codes.base}
        {codes.rep1 && rates.r1 ? ` · ${fmt(base / rates.r1)} ${codes.rep1}` : ""}
        {codes.rep2 && rates.r2 ? ` · ${fmt(base / rates.r2)} ${codes.rep2}` : ""}
      </div>
    </div>
  );
}

// reporting-currency sub-lines for a base amount (used in totals)
function RepLines({ base, rates, codes }) {
  return (
    <>
      {codes.rep1 && rates.r1 ? (
        <div className="text-[11px] font-medium text-slate-400">
          {fmt(base / rates.r1)} {codes.rep1}
        </div>
      ) : null}
      {codes.rep2 && rates.r2 ? (
        <div className="text-[11px] font-medium text-slate-400">
          {fmt(base / rates.r2)} {codes.rep2}
        </div>
      ) : null}
    </>
  );
}

function LegCard({
  leg,
  codes,
  rates,
  cutoff,
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
}) {
  const itemAggs = leg.items.map((it) => aggItem(it, cutoff));
  const legAgg = sumAgg(itemAggs);
  const crTotal = leg.change_requests.reduce((s, c) => s + num(c.amount), 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold">{leg.code || "—"}</span>
            {leg.category && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-400/20 dark:bg-slate-800 dark:text-slate-300">
                {leg.category}
              </span>
            )}
          </div>
          {leg.name && <div className="truncate text-sm text-slate-500">{leg.name}</div>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost px-2 py-1" onClick={onEditLeg} title="Edit leg">
            <Pencil size={15} />
          </button>
          <button className="btn-ghost px-2 py-1 text-rose-500" onClick={onDeleteLeg} title="Delete leg">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th rowSpan={2} className="sticky left-0 z-10 bg-white px-4 py-2 text-left dark:bg-slate-900">
                Item
              </th>
              <th rowSpan={2} className="px-3 py-2 text-right">Budget</th>
              <th rowSpan={2} className="px-3 py-2 text-right">Actual</th>
              <th rowSpan={2} className="px-3 py-2 text-right">Forecast</th>
              <th rowSpan={2} className="px-3 py-2 text-right">Total</th>
              {MONTHS.map((mn, idx) => (
                <th
                  key={mn}
                  colSpan={2}
                  className={`px-2 py-1 text-center ${(idx + 1) % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-800/30 " : ""}${idx + 1 >= cutoff ? "text-brand-500" : ""}`}
                >
                  {mn}
                </th>
              ))}
              <th rowSpan={2}></th>
            </tr>
            <tr className="text-[10px] font-semibold uppercase text-slate-400">
              {MONTHS.map((mn, idx) => {
                const z = (idx + 1) % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-800/30 " : "";
                return (
                  <React.Fragment key={mn}>
                    <th className={`${z}px-1 py-1 text-center font-medium`}>Budget</th>
                    <th className={`${z}px-1 py-1 text-center font-medium text-brand-500`}>
                      {idx + 1 < cutoff ? "Actual" : "Forecast"}
                    </th>
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {leg.items.length === 0 && (
              <tr>
                <td colSpan={5 + 24 + 1} className="px-4 py-4 text-center text-sm text-slate-400">
                  No budget items yet.
                </td>
              </tr>
            )}
            {leg.items.map((it, i) => {
              const a = itemAggs[i];
              return (
                <tr key={it.id} className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2 dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40">
                    <div className="whitespace-nowrap font-medium">{it.name || "—"}</div>
                    <div className="text-[11px] text-slate-400">
                      {it.item_type === "manday"
                        ? `manday × ${fmt(it.daily_rate)} ${codes.base}`
                        : "fixed"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(a.budget)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(a.actual)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(a.forecast)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{fmt(a.total)}</td>
                  {it.months.map((m) => {
                    const zebra = m.month % 2 === 0;
                    return (
                      <React.Fragment key={m.id}>
                        <MoneyInput
                          value={m.budget_value}
                          zebra={zebra}
                          onCommit={(v) => {
                            patchMonth(m.id, "budget", v);
                            saveMonth(m.id, "budget", v);
                          }}
                        />
                        <MoneyInput
                          value={m.realized_value}
                          forecast={m.month >= cutoff}
                          zebra={zebra}
                          onCommit={(v) => {
                            patchMonth(m.id, "realized", v);
                            saveMonth(m.id, "realized", v);
                          }}
                        />
                      </React.Fragment>
                    );
                  })}
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button className="btn-ghost px-1.5 py-1" onClick={() => onEditItem(it)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className="btn-ghost px-1.5 py-1 text-rose-500" onClick={() => onDeleteItem(it)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* leg total row */}
            <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
              <td className="sticky left-0 z-10 bg-slate-50 px-4 py-2 dark:bg-slate-800/50">TOTAL</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmt(legAgg.budget)}
                <RepLines base={legAgg.budget} rates={rates} codes={codes} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(legAgg.actual)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(legAgg.forecast)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmt(legAgg.total)}
                <RepLines base={legAgg.total} rates={rates} codes={codes} />
              </td>
              <td colSpan={25}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* change requests + total with CRs */}
      <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Change requests
          </span>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onAddCR}>
            <Plus size={14} /> Add CR
          </button>
        </div>
        {leg.change_requests.length === 0 ? (
          <div className="text-xs text-slate-400">No change requests.</div>
        ) : (
          <div className="space-y-1">
            {leg.change_requests.map((cr) => (
              <div key={cr.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {CR_KINDS.find((k) => k.id === cr.kind)?.label || cr.kind}
                </span>
                <span className="flex-1 truncate text-sm text-slate-600 dark:text-slate-300">{cr.label}</span>
                <div className="text-right tabular-nums">
                  <div className="font-semibold">{fmt(num(cr.amount))}</div>
                  <RepLines base={num(cr.amount)} rates={rates} codes={codes} />
                </div>
                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button className="btn-ghost px-1.5 py-1" onClick={() => onEditCR(cr)}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn-ghost px-1.5 py-1 text-rose-500" onClick={() => onDeleteCR(cr)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-3 dark:border-slate-700">
          <span className="text-sm font-bold">TOTAL with CRs</span>
          <div className="text-right tabular-nums">
            <div className="font-bold">{fmt(legAgg.budget + crTotal)}</div>
            <RepLines base={legAgg.budget + crTotal} rates={rates} codes={codes} />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">
        <button className="btn-ghost text-xs" onClick={onAddItem}>
          <Plus size={14} /> Add budget item
        </button>
      </div>
    </div>
  );
}

function MoneyInput({ value, onCommit, forecast, zebra }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const display = focused
    ? draft
    : num(value) === 0
    ? ""
    : fmt(num(value));
  return (
    <td className={`px-1 py-1 ${zebra ? "bg-slate-50/70 dark:bg-slate-800/30" : ""}`}>
      <input
        className={`h-8 w-[120px] rounded-md border border-slate-200 bg-white px-2 text-right text-[13px] tabular-nums outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 ${
          forecast ? "text-brand-600 dark:text-brand-300" : ""
        }`}
        type="text"
        inputMode="decimal"
        value={display}
        placeholder="0"
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
function ItemModal({ ctx, codes, onClose, onSaved }) {
  const it = ctx.item;
  const editing = !!it;
  const [name, setName] = useState(it?.name || "");
  const [isManday, setIsManday] = useState(it?.item_type === "manday");
  const [rate, setRate] = useState(it?.daily_rate ?? 0);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        item_type: isManday ? "manday" : "fixed",
        daily_rate: isManday ? num(rate) : 0,
      };
      if (editing) await api.updateItem(it.id, payload);
      else await api.createItem(ctx.legId, payload);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit budget item" : "New budget item"}
      footer={
        <>
          <button className="btn-subtle" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>Save</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Item title">
          <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
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
        <p className="text-xs text-slate-500">
          After saving, enter the monthly Budget and Actual/Forecast values directly in the row.
        </p>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- CR modal
function CRModal({ ctx, codes, onClose, onSaved }) {
  const cr = ctx.cr;
  const editing = !!cr;
  const [kind, setKind] = useState(cr?.kind || "cr");
  const [label, setLabel] = useState(cr?.label || "");
  const [amount, setAmount] = useState(cr?.amount ?? 0);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload = { kind, label: label.trim(), amount: num(amount) };
      if (editing) await api.updateCR(cr.id, payload);
      else await api.createCR(ctx.legId, payload);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit change request" : "New change request"}
      footer={
        <>
          <button className="btn-subtle" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={busy}>Save</button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Kind">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {CR_KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Label">
          <input className="input" value={label} placeholder="Optional note" onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label={`Amount (${codes.base}, can be negative)`}>
          <input className="input" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
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
