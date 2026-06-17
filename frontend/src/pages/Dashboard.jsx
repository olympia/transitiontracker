import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  LayoutGrid,
  RefreshCw,
  CalendarClock,
  Upload,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { api } from "../api";
import { Badge, EmptyState, Spinner, Modal, Field } from "../components/ui.jsx";
import ImportModal from "../components/ImportModal.jsx";
import { STATUS_META, OVERALL_META, fmtDate } from "../lib/status.js";
import EntityDrawer from "./EntityDrawer.jsx";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "delayed", label: "Delayed" },
  { id: "duesoon", label: "Due soon" },
  { id: "ontrack", label: "On track" },
  { id: "completed", label: "Completed" },
  { id: "onhold", label: "On hold" },
  { id: "none", label: "No go-live" },
];

const W_RACK = 184;
const W_GOLIVE = 104;
const W_STATUS = 132;
const MIN_CELL = 12;
const MAX_CELL = 44;

export default function Dashboard({ project }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [openEntity, setOpenEntity] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // zoom: userZoom (px) overrides the auto-fit size; null = auto-fit
  const [userZoom, setUserZoom] = useState(() => {
    const v = Number(localStorage.getItem("tt-zoom"));
    return v > 0 ? v : null;
  });
  const [autoFit, setAutoFit] = useState(28);
  const wrapRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      setData(await api.matrix(project.id));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const defs = data?.task_definitions ?? [];
  const nTasks = Math.max(defs.length, 1);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const isMd = window.matchMedia("(min-width: 768px)").matches;
      const sticky = isMd ? W_RACK + W_GOLIVE + W_STATUS : W_RACK;
      const avail = el.clientWidth - sticky - 6;
      const fit = Math.floor(avail / nTasks);
      setAutoFit(Math.max(MIN_CELL, Math.min(MAX_CELL, fit)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nTasks, data]);

  const cellPx = userZoom ?? autoFit;

  function setZoom(next) {
    const v = Math.max(MIN_CELL, Math.min(MAX_CELL, next));
    setUserZoom(v);
    localStorage.setItem("tt-zoom", String(v));
  }
  function fitZoom() {
    setUserZoom(null);
    localStorage.removeItem("tt-zoom");
  }

  const stats = useMemo(() => {
    const s = { total: 0, completed: 0, ontrack: 0, duesoon: 0, delayed: 0, onhold: 0, none: 0 };
    data?.rows.forEach((r) => {
      s.total++;
      s[r.overall] = (s[r.overall] || 0) + 1;
    });
    return s;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (filter !== "all" && r.overall !== filter) return false;
      if (!needle) return true;
      return (
        r.code.toLowerCase().includes(needle) ||
        r.name.toLowerCase().includes(needle) ||
        r.location.toLowerCase().includes(needle)
      );
    });
  }, [data, q, filter]);

  if (loading && !data) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={project.entity_label + "s"} value={stats.total} tone="brand" />
        <StatCard label="Completed" value={stats.completed} tone="green" />
        <StatCard label="On track" value={stats.ontrack} tone="slate" />
        <StatCard label="Due soon" value={stats.duesoon} tone="amber" />
        <StatCard label="Delayed" value={stats.delayed} tone="red" />
        <StatCard label="On hold" value={stats.onhold} tone="blue" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input w-56 pl-9"
            placeholder={`Search ${project.entity_label.toLowerCase()}s...`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === f.id
                  ? "bg-brand-600 text-white shadow-soft"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {defs.length > 0 && (
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              <button className="btn-ghost px-1.5 py-1" title="Zoom out" onClick={() => setZoom(cellPx - 3)}>
                <ZoomOut size={16} />
              </button>
              <button className="btn-ghost px-1.5 py-1" title="Fit to width" onClick={fitZoom}>
                <Maximize2 size={15} />
              </button>
              <button className="btn-ghost px-1.5 py-1" title="Zoom in" onClick={() => setZoom(cellPx + 3)}>
                <ZoomIn size={16} />
              </button>
            </div>
          )}
          <button className="btn-ghost px-2.5" onClick={load} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button className="btn-subtle" onClick={() => setImportOpen(true)}>
            <Upload size={16} /> Import
          </button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Add {project.entity_label.toLowerCase()}
          </button>
        </div>
      </div>

      <div ref={wrapRef}>
        {rows.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title={data?.rows.length ? "Nothing matches your filters" : `No ${project.entity_label.toLowerCase()}s yet`}
            subtitle={
              data?.rows.length
                ? "Try clearing the search or status filter."
                : defs.length === 0
                ? "Define your repeating tasks in the Task template tab first, then add or import entities here."
                : `Add or import your first ${project.entity_label.toLowerCase()} to start tracking.`
            }
            action={
              <div className="flex gap-2">
                <button className="btn-subtle" onClick={() => setImportOpen(true)}>
                  <Upload size={16} /> Import from Excel
                </button>
                <button className="btn-primary" onClick={() => setAddOpen(true)}>
                  <Plus size={16} /> Add {project.entity_label.toLowerCase()}
                </button>
              </div>
            }
          />
        ) : (
          <Matrix
            defs={defs}
            rows={rows}
            entityLabel={project.entity_label}
            cellPx={cellPx}
            onOpen={(id) => setOpenEntity(id)}
          />
        )}
      </div>

      <Legend />

      {openEntity && (
        <EntityDrawer entityId={openEntity} onClose={() => setOpenEntity(null)} onSaved={load} />
      )}

      <AddEntityModal
        open={addOpen}
        project={project}
        onClose={() => setAddOpen(false)}
        onCreated={(e) => {
          setAddOpen(false);
          load();
          setOpenEntity(e.id);
        }}
      />

      <ImportModal open={importOpen} project={project} onClose={() => setImportOpen(false)} onDone={load} />
    </div>
  );
}

function Matrix({ defs, rows, entityLabel, cellPx, onOpen }) {
  const square = Math.max(8, Math.min(cellPx - 8, 26));
  const headBase =
    "sticky z-20 bg-slate-50/95 px-3 py-3 text-left align-bottom backdrop-blur dark:bg-slate-900/95";
  const stickyHead = (left, width, extra = "") => ({
    className: `${headBase} ${extra}`,
    style: { left, width, minWidth: width, maxWidth: width },
  });
  const bodyBase =
    "sticky z-10 box-border border-t border-slate-100 bg-white px-3 py-2.5 group-hover:bg-brand-50/60 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800/60";
  const stickyBody = (left, width, extra = "") => ({
    className: `${bodyBase} ${extra}`,
    style: { left, width, minWidth: width, maxWidth: width },
  });

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th {...stickyHead(0, W_RACK, "px-4")}>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{entityLabel}</span>
              </th>
              <th {...stickyHead(W_RACK, W_GOLIVE, "hidden md:table-cell")}>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Go-live</span>
              </th>
              <th {...stickyHead(W_RACK + W_GOLIVE, W_STATUS, "hidden md:table-cell")}>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</span>
              </th>
              {defs.map((d) => (
                <th
                  key={d.id}
                  className="h-40 bg-slate-50/95 align-bottom backdrop-blur dark:bg-slate-900/95"
                  style={{ width: cellPx, minWidth: cellPx, maxWidth: cellPx }}
                >
                  <div className="flex h-36 items-end justify-center pb-2">
                    <span
                      className="font-semibold text-slate-600 dark:text-slate-300"
                      style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                        maxHeight: "8.5rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: cellPx < 20 ? "10px" : "12px",
                      }}
                      title={`${d.name}${d.responsible ? " — " + d.responsible : ""}`}
                    >
                      {d.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const om = OVERALL_META[r.overall] || OVERALL_META.none;
              return (
                <tr key={r.entity_id} className="group cursor-pointer" onClick={() => onOpen(r.entity_id)}>
                  <td {...stickyBody(0, W_RACK, "px-4")}>
                    <div className="truncate text-sm font-semibold">{r.code || "—"}</div>
                    <div className="truncate text-xs text-slate-400">{r.name || r.location}</div>
                  </td>
                  <td {...stickyBody(W_RACK, W_GOLIVE, "hidden md:table-cell")}>
                    <span className="whitespace-nowrap text-xs text-slate-500">
                      {r.golive_date ? fmtDate(r.golive_date) : "—"}
                    </span>
                  </td>
                  <td {...stickyBody(W_RACK + W_GOLIVE, W_STATUS, "hidden md:table-cell")}>
                    <Badge meta={om} />
                  </td>
                  {r.cells.map((c) => {
                    const m = STATUS_META[c.status] || STATUS_META.none;
                    const tip =
                      `${defs.find((d) => d.id === c.task_def_id)?.name || ""}\n` +
                      `${m.label}` +
                      (c.planned_date ? `\nDeadline: ${c.planned_date}` : "");
                    return (
                      <td
                        key={c.task_def_id}
                        className="border-t border-slate-100 py-1.5 text-center dark:border-slate-800"
                        style={{ width: cellPx, minWidth: cellPx, maxWidth: cellPx }}
                      >
                        <div
                          title={tip}
                          className={`mx-auto rounded ring-1 ring-inset ring-black/5 transition group-hover:scale-110 dark:ring-white/5 ${m.cell}`}
                          style={{ width: square, height: square }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend() {
  const items = ["done", "overdue", "duesoon", "future", "none"];
  return (
    <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-slate-500">
      {items.map((k) => (
        <div key={k} className="flex items-center gap-1.5">
          <span className={`h-3.5 w-3.5 rounded ${STATUS_META[k].cell} ring-1 ring-inset ring-black/10 dark:ring-white/10`} />
          {STATUS_META[k].label}
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const tones = {
    brand: "text-brand-600",
    green: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-rose-600",
    blue: "text-blue-600",
    slate: "text-slate-500",
  };
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function AddEntityModal({ open, project, onClose, onCreated }) {
  const [form, setForm] = useState({ code: "", name: "", golive_date: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ code: "", name: "", golive_date: "" });
  }, [open]);

  async function submit() {
    if (!form.code.trim() && !form.name.trim()) return;
    setBusy(true);
    try {
      const e = await api.createEntity(project.id, {
        code: form.code.trim(),
        name: form.name.trim(),
        golive_date: form.golive_date || null,
      });
      onCreated(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add ${project.entity_label.toLowerCase()}`}
      footer={
        <>
          <button className="btn-subtle" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy}>Create</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code">
            <input className="input" autoFocus value={form.code} placeholder="001D"
              onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Go-live date">
            <input className="input" type="date" value={form.golive_date}
              onChange={(e) => setForm({ ...form, golive_date: e.target.value })} />
          </Field>
        </div>
        <Field label="Name / building">
          <input className="input" value={form.name} placeholder="Central Office Building"
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarClock size={14} />
          Task deadlines are calculated automatically from the go-live date.
        </p>
      </div>
    </Modal>
  );
}
