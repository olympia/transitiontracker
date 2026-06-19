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

const CATEGORIES = [
  "Internal CAPEX",
  "External CAPEX Tangible",
  "External CAPEX Intangible",
  "External OPEX",
];

const CR_KINDS = [
  { id: "carry_over", label: "Carry Over" },
  { id: "reallocation", label: "Budget Reallocation" },
  { id: "cancelation", label: "Budget Cancelation" },
  { id: "cr", label: "CR" },
];

const CAT_STYLE = {
  "Internal CAPEX":
    "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300",
  "External CAPEX Tangible":
    "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300",
  "External CAPEX Intangible":
    "bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-500/15 dark:text-teal-300",
  "External OPEX":
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/15 dark:text-amber-300",
};

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    Math.round(n)
  );
}

function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function MoneyCell({ money, codes, strong }) {
  if (!money) return <span className="text-slate-400">—</span>;
  return (
    <div className="text-right tabular-nums">
      <div className={strong ? "font-bold" : "font-semibold"}>{fmt(money.base)}</div>
      {codes.rep1 && money.rep1 != null && (
        <div className="text-[11px] font-medium text-slate-400">
          {fmt(money.rep1)} {codes.rep1}
        </div>
      )}
      {codes.rep2 && money.rep2 != null && (
        <div className="text-[11px] font-medium text-slate-400">
          {fmt(money.rep2)} {codes.rep2}
        </div>
      )}
    </div>
  );
}

export default function Finance({ project, onProjectChange }) {
  const [years, setYears] = useState(null);
  const [yearId, setYearId] = useState(null);
  const [view, setView] = useState(null);
  const [loadingView, setLoadingView] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemEdit, setItemEdit] = useState(null); // { legId, item }
  const [crEdit, setCrEdit] = useState(null); // { legId, cr }
  const [legEdit, setLegEdit] = useState(null); // { yearId, leg }

  async function loadYears(selectId) {
    const list = await api.listYears(project.id);
    setYears(list);
    setYearId((cur) => {
      const target = selectId ?? cur;
      if (target && list.some((y) => y.id === target)) return target;
      return list[0]?.id ?? null;
    });
  }

  async function loadView() {
    if (!yearId) {
      setView(null);
      return;
    }
    setLoadingView(true);
    try {
      setView(await api.financeView(yearId));
    } finally {
      setLoadingView(false);
    }
  }

  useEffect(() => {
    setYears(null);
    setYearId(null);
    setView(null);
    loadYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    loadView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  const codes = useMemo(
    () => ({
      base: view?.project.base_currency || project.base_currency || "",
      rep1: view?.project.reporting_currency_1 || project.reporting_currency_1 || "",
      rep2: view?.project.reporting_currency_2 || project.reporting_currency_2 || "",
    }),
    [view, project]
  );

  async function afterMutation(selectYearId) {
    await loadYears(selectYearId);
    await loadView();
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
          subtitle="Open Setup to choose currencies and add a budget year. Then add WBS legs and budget items."
          action={
            <button className="btn-primary" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={16} /> Open setup
            </button>
          }
        />
      ) : (
        <>
          {/* year tabs */}
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

          {loadingView && !view ? (
            <Spinner />
          ) : view ? (
            <YearView
              view={view}
              codes={codes}
              onAddLeg={() => setLegEdit({ yearId: view.year.id, leg: null })}
              onEditLeg={(leg) => setLegEdit({ yearId: view.year.id, leg })}
              onAddItem={(legId) => setItemEdit({ legId, item: null })}
              onEditItem={(legId, item) => setItemEdit({ legId, item })}
              onAddCR={(legId) => setCrEdit({ legId, cr: null })}
              onEditCR={(legId, cr) => setCrEdit({ legId, cr })}
              reload={loadView}
            />
          ) : null}
        </>
      )}

      {settingsOpen && (
        <SettingsModal
          project={project}
          years={years}
          onClose={() => setSettingsOpen(false)}
          onProjectChange={onProjectChange}
          onYearsChange={(sel) => afterMutation(sel)}
        />
      )}

      {legEdit && (
        <LegModal
          ctx={legEdit}
          onClose={() => setLegEdit(null)}
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

// ----------------------------------------------------------------- year view
function YearView({
  view,
  codes,
  onAddLeg,
  onEditLeg,
  onAddItem,
  onEditItem,
  onAddCR,
  onEditCR,
  reload,
}) {
  return (
    <div className="space-y-5">
      {/* grand totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Budget" money={view.budget_total} codes={codes} />
        <SummaryCard label="With CRs" money={view.total_with_crs} codes={codes} accent />
        <SummaryCard label="Actual" money={view.actual_total} codes={codes} />
        <SummaryCard
          label="Total (Actual + FC)"
          money={view.total}
          codes={codes}
        />
      </div>

      {view.legs.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No WBS legs in this year"
          subtitle="Add a SAP WBS leg, then add budget items underneath it."
          action={
            <button className="btn-primary" onClick={onAddLeg}>
              <Plus size={16} /> Add WBS leg
            </button>
          }
        />
      ) : (
        <>
          {view.legs.map((leg) => (
            <LegCard
              key={leg.id}
              leg={leg}
              codes={codes}
              onEditLeg={() => onEditLeg(leg)}
              onDeleteLeg={async () => {
                if (
                  window.confirm(
                    `Delete WBS leg "${leg.code || leg.name}" and all its items?`
                  )
                ) {
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

function SummaryCard({ label, money, codes, accent }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-extrabold tabular-nums ${
          accent ? "text-emerald-600" : ""
        }`}
      >
        {fmt(money.base)}
      </div>
      <div className="text-xs font-medium text-slate-400">
        {codes.base}
        {codes.rep1 && money.rep1 != null ? ` · ${fmt(money.rep1)} ${codes.rep1}` : ""}
        {codes.rep2 && money.rep2 != null ? ` · ${fmt(money.rep2)} ${codes.rep2}` : ""}
      </div>
    </div>
  );
}

function LegCard({
  leg,
  codes,
  onEditLeg,
  onDeleteLeg,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onAddCR,
  onEditCR,
  onDeleteCR,
}) {
  const catStyle =
    CAT_STYLE[leg.category] ||
    "bg-slate-100 text-slate-600 ring-slate-400/20 dark:bg-slate-800 dark:text-slate-300";
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold">{leg.code || "—"}</span>
            {leg.category && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${catStyle}`}
              >
                {leg.category}
              </span>
            )}
          </div>
          {leg.name && (
            <div className="truncate text-sm text-slate-500">{leg.name}</div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost px-2 py-1" onClick={onEditLeg} title="Edit leg">
            <Pencil size={15} />
          </button>
          <button
            className="btn-ghost px-2 py-1 text-rose-500"
            onClick={onDeleteLeg}
            title="Delete leg"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2">Item</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Budget</th>
              <th className="px-3 py-2 text-right">Actual</th>
              <th className="px-3 py-2 text-right">Forecast</th>
              <th className="px-3 py-2 text-right">Total (A+FC)</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {leg.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-sm text-slate-400">
                  No budget items yet.
                </td>
              </tr>
            )}
            {leg.items.map((it) => (
              <tr key={it.id} className="group align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{it.name || "—"}</div>
                  {it.responsible && (
                    <div className="text-[11px] text-slate-400">{it.responsible}</div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {it.item_type === "manday" ? "manday" : "fixed"}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <MoneyCell money={it.budget} codes={codes} />
                </td>
                <td className="px-3 py-2.5">
                  <MoneyCell money={it.actual} codes={codes} />
                </td>
                <td className="px-3 py-2.5">
                  <MoneyCell money={it.forecast} codes={codes} />
                </td>
                <td className="px-3 py-2.5">
                  <MoneyCell money={it.total} codes={codes} strong />
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      className="btn-ghost px-1.5 py-1"
                      onClick={() => onEditItem(it)}
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn-ghost px-1.5 py-1 text-rose-500"
                      onClick={() => onDeleteItem(it)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {/* leg subtotal */}
            <tr className="bg-slate-50 font-semibold dark:bg-slate-800/50">
              <td className="px-4 py-2.5" colSpan={2}>
                TOTAL
              </td>
              <td className="px-3 py-2.5">
                <MoneyCell money={leg.budget_total} codes={codes} strong />
              </td>
              <td className="px-3 py-2.5">
                <MoneyCell money={leg.actual_total} codes={codes} strong />
              </td>
              <td className="px-3 py-2.5">
                <MoneyCell money={leg.forecast_total} codes={codes} strong />
              </td>
              <td className="px-3 py-2.5">
                <MoneyCell money={leg.total} codes={codes} strong />
              </td>
              <td></td>
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
              <div
                key={cr.id}
                className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {CR_KINDS.find((k) => k.id === cr.kind)?.label || cr.kind}
                </span>
                <span className="flex-1 truncate text-sm text-slate-600 dark:text-slate-300">
                  {cr.label}
                </span>
                <div className="w-40">
                  <MoneyCell money={cr.amount} codes={codes} />
                </div>
                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button className="btn-ghost px-1.5 py-1" onClick={() => onEditCR(cr)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn-ghost px-1.5 py-1 text-rose-500"
                    onClick={() => onDeleteCR(cr)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-3 dark:border-slate-700">
          <span className="text-sm font-bold">TOTAL with CRs</span>
          <div className="w-48">
            <MoneyCell money={leg.total_with_crs} codes={codes} strong />
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

// ----------------------------------------------------------------- leg modal
function LegModal({ ctx, onClose, onSaved }) {
  const editing = !!ctx.leg;
  const [code, setCode] = useState(ctx.leg?.code || "");
  const [name, setName] = useState(ctx.leg?.name || "");
  const [category, setCategory] = useState(ctx.leg?.category || CATEGORIES[0]);
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
          <button className="btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            Save
          </button>
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
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
  const [responsible, setResponsible] = useState(it?.responsible || "");
  const [isManday, setIsManday] = useState(it?.item_type === "manday");
  const [f, setF] = useState({
    budget_amount: it?.budget_amount ?? 0,
    actual_amount: it?.actual_amount ?? 0,
    forecast_amount: it?.forecast_amount ?? 0,
    budget_manday: it?.budget_manday ?? 0,
    budget_rate: it?.budget_rate ?? 0,
    actual_manday: it?.actual_manday ?? 0,
    actual_rate: it?.actual_rate ?? 0,
    forecast_manday: it?.forecast_manday ?? 0,
    forecast_rate: it?.forecast_rate ?? 0,
  });
  const [busy, setBusy] = useState(false);

  function set(k, v) {
    setF((p) => ({ ...p, [k]: v }));
  }

  const cols = ["budget", "actual", "forecast"];
  const colLabel = { budget: "Budget", actual: "Actual", forecast: "Forecast" };

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        responsible: responsible.trim(),
        item_type: isManday ? "manday" : "fixed",
        budget_amount: num(f.budget_amount),
        actual_amount: num(f.actual_amount),
        forecast_amount: num(f.forecast_amount),
        budget_manday: num(f.budget_manday),
        budget_rate: num(f.budget_rate),
        actual_manday: num(f.actual_manday),
        actual_rate: num(f.actual_rate),
        forecast_manday: num(f.forecast_manday),
        forecast_rate: num(f.forecast_rate),
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
      wide
      title={editing ? "Edit budget item" : "New budget item"}
      footer={
        <>
          <button className="btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Item name">
            <input
              className="input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Responsible / department">
            <input
              className="input"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
          <div>
            <div className="text-sm font-semibold">Manday based</div>
            <div className="text-xs text-slate-500">
              {isManday
                ? `Total = manday × daily rate (${codes.base})`
                : `Fixed amount in ${codes.base}`}
            </div>
          </div>
          <Toggle checked={isManday} onChange={setIsManday} />
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[80px_1fr_1fr] items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <div></div>
            {isManday ? (
              <>
                <div>Manday</div>
                <div>Daily rate ({codes.base})</div>
              </>
            ) : (
              <>
                <div className="col-span-2">Amount ({codes.base})</div>
              </>
            )}
          </div>
          {cols.map((c) => (
            <div key={c} className="grid grid-cols-[80px_1fr_1fr] items-center gap-2">
              <div className="text-sm font-medium text-slate-500">{colLabel[c]}</div>
              {isManday ? (
                <>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    value={f[`${c}_manday`]}
                    onChange={(e) => set(`${c}_manday`, e.target.value)}
                  />
                  <input
                    className="input"
                    type="number"
                    step="any"
                    value={f[`${c}_rate`]}
                    onChange={(e) => set(`${c}_rate`, e.target.value)}
                  />
                </>
              ) : (
                <input
                  className="input col-span-2"
                  type="number"
                  step="any"
                  value={f[`${c}_amount`]}
                  onChange={(e) => set(`${c}_amount`, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
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
  const [amount, setAmount] = useState(cr?.amount?.base ?? cr?.amount ?? 0);
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
          <button className="btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Kind">
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {CR_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Label">
          <input
            className="input"
            value={label}
            placeholder="Optional note"
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field label={`Amount (${codes.base}, can be negative)`}>
          <input
            className="input"
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- settings
function SettingsModal({ project, years, onClose, onProjectChange, onYearsChange }) {
  const [base, setBase] = useState(project.base_currency || "HUF");
  const [rep1, setRep1] = useState(project.reporting_currency_1 || "");
  const [rep2, setRep2] = useState(project.reporting_currency_2 || "");
  const [savingCur, setSavingCur] = useState(false);
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
    } finally {
      setSavingCur(false);
    }
  }

  async function addYear() {
    const y = parseInt(newYear, 10);
    if (!y) return;
    setBusy(true);
    try {
      const created = await api.createYear(project.id, { year: y, rate_1: 0, rate_2: 0 });
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
            Amounts are booked in the base currency. Up to two reporting currencies are
            shown alongside, converted with the per-year rates below.
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
          <h4 className="mb-2 text-sm font-bold">Years & exchange rates</h4>
          <p className="mb-3 text-xs text-slate-500">
            Rate = how many {base || "base"} equal 1 unit of the reporting currency
            (e.g. 405 means 405 {base || "base"} = 1 {rep1 || "EUR"}). Leave 0 to hide that
            reporting currency.
          </p>
          <div className="space-y-2">
            {years.map((y) => (
              <YearRow
                key={y.id}
                year={y}
                rep1={rep1}
                rep2={rep2}
                onChanged={() => onYearsChange(y.id)}
              />
            ))}
            {years.length === 0 && (
              <div className="text-xs text-slate-400">No years yet.</div>
            )}
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

function YearRow({ year, rep1, rep2, onChanged }) {
  const [r1, setR1] = useState(year.rate_1 || 0);
  const [r2, setR2] = useState(year.rate_2 || 0);
  const [dirty, setDirty] = useState(false);

  async function save() {
    await api.updateYear(year.id, { rate_1: num(r1), rate_2: num(r2) });
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
      <span className="w-14 font-bold">{year.year}</span>
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        {rep1 || "Rep1"}
        <input
          className="input h-8 w-24"
          type="number"
          step="any"
          value={r1}
          onChange={(e) => {
            setR1(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        {rep2 || "Rep2"}
        <input
          className="input h-8 w-24"
          type="number"
          step="any"
          value={r2}
          onChange={(e) => {
            setR2(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <div className="ml-auto flex items-center gap-1">
        {dirty && (
          <button className="btn-primary h-8 px-3 text-xs" onClick={save}>
            Save
          </button>
        )}
        <button className="btn-ghost px-2 py-1 text-rose-500" onClick={remove}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
