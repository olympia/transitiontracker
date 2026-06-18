import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Trash2,
  Check,
  Plus,
  MapPin,
  Server,
  StickyNote,
  Footprints,
  Save,
} from "lucide-react";
import { api } from "../api";
import { Badge, Spinner, Toggle } from "../components/ui.jsx";
import { STATUS_META, OVERALL_META, fmtDate } from "../lib/status.js";

export default function EntityDrawer({ entityId, initialTab, onClose, onSaved }) {
  const [e, setE] = useState(null);
  const [tab, setTab] = useState(initialTab || "tasks");
  const [savingMeta, setSavingMeta] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function load() {
    setE(await api.getEntity(entityId));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  function patch(p) {
    setE((cur) => ({ ...cur, ...p }));
    setDirty(true);
  }

  async function saveMeta(overrides = {}) {
    setSavingMeta(true);
    try {
      const m = { ...e, ...overrides };
      const payload = {
        code: m.code,
        name: m.name,
        location: m.location,
        next_step: m.next_step,
        next_step_due: m.next_step_due || null,
        clear_next_step_due: !m.next_step_due,
        on_hold: m.on_hold,
        notes: m.notes,
        golive_date: m.golive_date || null,
        clear_golive: !m.golive_date,
      };
      const fresh = await api.updateEntity(entityId, payload);
      setE(fresh);
      setDirty(false);
      onSaved?.();
    } finally {
      setSavingMeta(false);
    }
  }

  function toggleOnHold() {
    if (!e) return;
    setE((cur) => ({ ...cur, on_hold: !cur.on_hold }));
    saveMeta({ on_hold: !e.on_hold });
  }

  async function toggleTask(t) {
    const next = !t.done;
    await api.updateInstance(t.instance_id, { done: next, clear_actual: !next });
    await load();
    onSaved?.();
  }

  const om = e ? OVERALL_META[e.overall] || OVERALL_META.none : OVERALL_META.none;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-slate-50 shadow-2xl dark:bg-slate-950"
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-extrabold">
                  {e?.code || e?.name || "Entity"}
                </h2>
                {e && <Badge meta={om} />}
              </div>
              {e?.name && e?.code && (
                <p className="truncate text-sm text-slate-500">{e.name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleOnHold}
                title="Toggle on hold (saved immediately)"
                className={`btn ${
                  e?.on_hold
                    ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                    : "btn-subtle"
                }`}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded border ${
                    e?.on_hold
                      ? "border-blue-500 bg-blue-500 text-white"
                      : "border-slate-300 dark:border-slate-600"
                  }`}
                >
                  {e?.on_hold && <Check size={12} />}
                </span>
                On hold
              </button>
              {dirty && (
                <button
                  className="btn-primary"
                  onClick={() => saveMeta()}
                  disabled={savingMeta}
                >
                  <Save size={16} /> Save
                </button>
              )}
              <button className="btn-ghost px-2" onClick={onClose}>
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-1">
            {[
              { id: "tasks", label: "Tasks", icon: Check },
              { id: "nextstep", label: "Next step", icon: Footprints },
              { id: "details", label: "Details", icon: MapPin },
              { id: "inventory", label: "Inventory", icon: Server },
              { id: "notes", label: "Notes", icon: StickyNote },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    tab === t.id
                      ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {!e ? (
          <Spinner />
        ) : (
          <div className="p-6">
            {tab === "tasks" && <TasksTab e={e} onToggle={toggleTask} />}
            {tab === "nextstep" && <NextStepTab e={e} patch={patch} />}
            {tab === "details" && <DetailsTab e={e} patch={patch} />}
            {tab === "inventory" && (
              <InventoryTab e={e} reload={load} onSaved={onSaved} />
            )}
            {tab === "notes" && (
              <div>
                <label className="label">Notes</label>
                <textarea
                  className="input min-h-[260px] font-mono text-[13px] leading-relaxed"
                  value={e.notes || ""}
                  placeholder="Free-form notes about this entity..."
                  onChange={(ev) => patch({ notes: ev.target.value })}
                />
                <p className="mt-2 text-xs text-slate-400">
                  Remember to press Save in the header.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TasksTab({ e, onToggle, focusId }) {
  const done = e.tasks.filter((t) => t.done).length;
  const pct = e.tasks.length ? Math.round((done / e.tasks.length) * 100) : 0;
  const refs = useRef({});
  const [highlight, setHighlight] = useState(null);
  useEffect(() => {
    if (focusId && refs.current[focusId]) {
      refs.current[focusId].scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlight(focusId);
      const t = setTimeout(() => setHighlight(null), 2400);
      return () => clearTimeout(t);
    }
  }, [focusId, e.tasks.length]);
  return (
    <div className="space-y-4">
      {!e.golive_date && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300">
          No go-live date set. Add one in the Details tab to calculate deadlines.
        </div>
      )}
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">Progress</span>
          <span className="text-slate-500">
            {done} / {e.tasks.length} done ({pct}%)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: pct + "%" }}
          />
        </div>
      </div>

      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {e.tasks.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No tasks defined. Add them in the Task template tab.
          </div>
        )}
        {e.tasks.map((t) => {
          const m = STATUS_META[t.status] || STATUS_META.none;
          const isFocus = highlight === t.task_def_id;
          return (
            <div
              key={t.task_def_id}
              ref={(el) => (refs.current[t.task_def_id] = el)}
              className={`flex items-center gap-3 px-4 py-3 transition ${
                isFocus
                  ? "bg-brand-50 ring-2 ring-inset ring-brand-500/40 dark:bg-brand-500/10"
                  : ""
              }`}
            >
              <button
                onClick={() => onToggle(t)}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border transition ${
                  t.done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300 hover:border-brand-500 dark:border-slate-600"
                }`}
              >
                {t.done && <Check size={15} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.name}</div>
                {t.responsible && (
                  <div className="truncate text-xs text-slate-400">{t.responsible}</div>
                )}
              </div>
              <div className="w-28 shrink-0 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Deadline
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t.planned_date ? fmtDate(t.planned_date) : "—"}
                </div>
              </div>
              <Badge meta={m} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailsTab({ e, patch }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Code</label>
          <input
            className="input"
            value={e.code || ""}
            onChange={(ev) => patch({ code: ev.target.value })}
          />
        </div>
        <div>
          <label className="label">Go-live date</label>
          <input
            className="input"
            type="date"
            value={e.golive_date || ""}
            onChange={(ev) => patch({ golive_date: ev.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="label">Name / building</label>
        <input
          className="input"
          value={e.name || ""}
          onChange={(ev) => patch({ name: ev.target.value })}
        />
      </div>
      <div>
        <label className="label">Location / GPS link</label>
        <input
          className="input"
          value={e.location || ""}
          placeholder="https://maps.google.com/..."
          onChange={(ev) => patch({ location: ev.target.value })}
        />
      </div>
      <div className="card flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-sm font-semibold">On hold</div>
          <div className="text-xs text-slate-400">
            Excludes this entity from delay/in-progress roll-ups.
          </div>
        </div>
        <Toggle
          checked={!!e.on_hold}
          onChange={(v) => patch({ on_hold: v })}
        />
      </div>
      <p className="text-xs text-slate-400">
        Changes are applied when you press Save in the header.
      </p>
    </div>
  );
}

function NextStepTab({ e, patch }) {
  const due = e.next_step_due ? new Date(e.next_step_due + "T00:00:00") : null;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
  const overdue = due && due < today;
  return (
    <div className="space-y-4">
      <div>
        <label className="label">Next step</label>
        <input
          className="input"
          value={e.next_step || ""}
          placeholder='e.g. "Waiting for cabling access"'
          onChange={(ev) => patch({ next_step: ev.target.value })}
        />
      </div>
      <div>
        <label className="label">Next step due</label>
        <input
          className="input"
          type="date"
          value={e.next_step_due || ""}
          onChange={(ev) => patch({ next_step_due: ev.target.value })}
        />
      </div>
      {e.next_step && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${
            !e.next_step_due
              ? "bg-slate-100 text-slate-500 ring-slate-300/30 dark:bg-slate-800 dark:text-slate-400"
              : overdue
              ? "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300"
              : "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
        >
          {!e.next_step_due
            ? "No due date set — the matrix flag shows grey."
            : overdue
            ? `Overdue since ${fmtDate(e.next_step_due)} — the matrix flag shows red.`
            : `Due ${fmtDate(e.next_step_due)} — the matrix flag shows green.`}
        </div>
      )}
      <p className="text-xs text-slate-400">Changes are applied when you press Save in the header.</p>
    </div>
  );
}

const EMPTY_ITEM = {
  category: "new",
  host: "",
  ip_address: "",
  model: "",
  serial: "",
  cmdb_ok: false,
};

function InventoryTab({ e, reload, onSaved }) {
  async function add(category) {
    await api.addInventory(e.id, { ...EMPTY_ITEM, category });
    await reload();
    onSaved?.();
  }
  return (
    <div className="space-y-6">
      {["old", "new"].map((cat) => {
        const items = e.inventory.filter((i) => i.category === cat);
        return (
          <div key={cat}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold capitalize">
                {cat === "old" ? "Old / removed equipment" : "New equipment"}
              </h3>
              <button className="btn-subtle py-1.5" onClick={() => add(cat)}>
                <Plus size={15} /> Add row
              </button>
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Host</th>
                    <th className="px-3 py-2 font-semibold">IP</th>
                    <th className="px-3 py-2 font-semibold">Model</th>
                    <th className="px-3 py-2 font-semibold">Serial</th>
                    <th className="px-3 py-2 font-semibold">CMDB</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-4 text-center text-xs text-slate-400"
                      >
                        No items.
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <InventoryRow
                      key={it.id}
                      item={it}
                      reload={reload}
                      onSaved={onSaved}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InventoryRow({ item, reload, onSaved }) {
  const [local, setLocal] = useState(item);
  useEffect(() => setLocal(item), [item]);

  function field(name) {
    return {
      value: local[name] ?? "",
      onChange: (e) => setLocal({ ...local, [name]: e.target.value }),
      onBlur: save,
    };
  }
  async function save() {
    await api.updateInventory(item.id, {
      category: local.category,
      host: local.host,
      ip_address: local.ip_address,
      model: local.model,
      serial: local.serial,
      cmdb_ok: local.cmdb_ok,
      position: local.position ?? 0,
    });
    onSaved?.();
  }
  async function toggleCmdb() {
    const next = { ...local, cmdb_ok: !local.cmdb_ok };
    setLocal(next);
    await api.updateInventory(item.id, next);
    onSaved?.();
  }
  async function remove() {
    await api.deleteInventory(item.id);
    await reload();
    onSaved?.();
  }

  const cell =
    "w-full bg-transparent px-1 py-1 text-sm outline-none focus:rounded focus:bg-slate-100 dark:focus:bg-slate-800";

  return (
    <tr>
      <td className="px-2 py-1.5">
        <input className={cell} {...field("host")} placeholder="host" />
      </td>
      <td className="px-2 py-1.5">
        <input className={cell} {...field("ip_address")} placeholder="10.0.0.1" />
      </td>
      <td className="px-2 py-1.5">
        <input className={cell} {...field("model")} placeholder="model" />
      </td>
      <td className="px-2 py-1.5">
        <input className={cell} {...field("serial")} placeholder="serial" />
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          onClick={toggleCmdb}
          className={`grid h-5 w-5 place-items-center rounded border ${
            local.cmdb_ok
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 dark:border-slate-600"
          }`}
        >
          {local.cmdb_ok && <Check size={13} />}
        </button>
      </td>
      <td className="px-2 py-1.5">
        <button
          className="text-slate-300 hover:text-rose-500"
          onClick={remove}
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </td>
    </tr>
  );
}
