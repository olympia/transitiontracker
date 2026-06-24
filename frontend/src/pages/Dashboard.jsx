import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Search, LayoutGrid, RefreshCw, CalendarClock, Upload,
  ZoomIn, ZoomOut, Maximize2, ChevronDown, Filter, StickyNote, X,
  CheckSquare, Check, Ban,
} from "lucide-react";
import { api } from "../api";
import { Badge, EmptyState, Spinner, Modal, Field } from "../components/ui.jsx";
import ImportModal from "../components/ImportModal.jsx";
import { STATUS_META, OVERALL_META, fmtDate } from "../lib/status.js";
import EntityDrawer from "./EntityDrawer.jsx";

const FILTERS = [
  { id: "all", label: "All" }, { id: "delayed", label: "Overdue" }, { id: "duesoon", label: "Due soon" },
  { id: "ontrack", label: "Scheduled" }, { id: "completed", label: "Completed" }, { id: "onhold", label: "On hold" }, { id: "none", label: "Not Scheduled" },
];
const TASK_FILTER_OPTIONS = [
  { v: "", l: "Any status" }, { v: "done", l: "Completed" }, { v: "overdue", l: "Overdue" },
  { v: "duesoon", l: "Due soon" }, { v: "future", l: "Scheduled" }, { v: "onhold", l: "On hold" }, { v: "none", l: "Not set" },
];
const GOLIVE_FILTER_OPTIONS = [{ v: "all", l: "All" }, { v: "has", l: "Has date" }, { v: "none", l: "No date" }];
const W_RACK = 240, W_GOLIVE = 116, W_STATUS = 168, W_NEXT = 120, MIN_CELL = 12, MAX_CELL = 44;
function lsBool(key, def) { const v = localStorage.getItem(key); return v === null ? def : v === "1"; }
function pct1(v, total) { return total > 0 ? ((v / total) * 100).toFixed(1) + "%" : "0.0%"; }

export default function Dashboard({ project, drill, onClearDrill }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [goliveFilter, setGoliveFilter] = useState("all");
  const [taskFilters, setTaskFilters] = useState({});
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [entityStatsOpen, setEntityStatsOpen] = useState(() => lsBool("tt-stats-entity", true));
  const [taskStatsOpen, setTaskStatsOpen] = useState(() => lsBool("tt-stats-task", true));
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [userZoom, setUserZoom] = useState(() => { const v = Number(localStorage.getItem("tt-zoom")); return v > 0 ? v : null; });
  const [autoFit, setAutoFit] = useState(28);
  const wrapRef = useRef(null);

  async function load() { setLoading(true); try { setData(await api.matrix(project.id)); } finally { setLoading(false); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [project.id]);

  const defs = data?.task_definitions ?? [];
  const nTasks = Math.max(defs.length, 1);
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measure = () => {
      const isMd = window.matchMedia("(min-width: 768px)").matches;
      const sticky = isMd ? W_RACK + W_GOLIVE + W_STATUS + W_NEXT : W_RACK;
      setAutoFit(Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((el.clientWidth - sticky - 6) / nTasks))));
    };
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, [nTasks, data]);
  const cellPx = userZoom ?? autoFit;
  function setZoom(next) { const v = Math.max(MIN_CELL, Math.min(MAX_CELL, next)); setUserZoom(v); localStorage.setItem("tt-zoom", String(v)); }
  function fitZoom() { setUserZoom(null); localStorage.removeItem("tt-zoom"); }
  function toggleEntityStats() { setEntityStatsOpen((v) => { localStorage.setItem("tt-stats-entity", v ? "0" : "1"); return !v; }); }
  function toggleTaskStats() { setTaskStatsOpen((v) => { localStorage.setItem("tt-stats-task", v ? "0" : "1"); return !v; }); }
  function setTaskFilter(id, val) { setTaskFilters((cur) => { const next = { ...cur }; if (!val) delete next[id]; else next[id] = val; return next; }); }
  async function saveGolive(entityId, date) { await api.updateEntity(entityId, { golive_date: date || null, clear_golive: !date }); await load(); }

  function askToggle(cell, name) { setConfirm({ instanceId: cell.instance_id, done: cell.status === "done", name }); }
  async function applyToggle() { const c = confirm; setConfirm(null); await api.updateInstance(c.instanceId, { done: !c.done, clear_actual: c.done }); await load(); }

  const stats = useMemo(() => {
    const s = { total: 0, completed: 0, ontrack: 0, duesoon: 0, delayed: 0, onhold: 0, none: 0 };
    data?.rows.forEach((r) => { s.total++; s[r.overall] = (s[r.overall] || 0) + 1; });
    return s;
  }, [data]);
  const taskStats = useMemo(() => {
    const s = { total: 0, done: 0, overdue: 0, duesoon: 0, future: 0, onhold: 0, none: 0 };
    data?.rows.forEach((r) => r.cells.forEach((c) => { s.total++; s[c.status] = (s[c.status] || 0) + 1; }));
    return s;
  }, [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const tf = Object.entries(taskFilters);
    const drillSet = drill ? new Set(drill.ids) : null;
    return data.rows.filter((r) => {
      if (drillSet && !drillSet.has(r.entity_id)) return false;
      if (filter !== "all" && r.overall !== filter) return false;
      if (goliveFilter === "has" && !r.golive_date) return false;
      if (goliveFilter === "none" && r.golive_date) return false;
      for (const [tid, st] of tf) { const cell = r.cells.find((c) => String(c.task_def_id) === tid); if (!cell || cell.status !== st) return false; }
      if (!needle) return true;
      return r.code.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle) || r.location.toLowerCase().includes(needle);
    });
  }, [data, q, filter, goliveFilter, taskFilters, drill]);

  function toggleSelectMode() { setSelectMode((v) => { if (v) setSelected(new Set()); return !v; }); }
  function toggleCell(instanceId) {
    setSelected((cur) => { const next = new Set(cur); next.has(instanceId) ? next.delete(instanceId) : next.add(instanceId); return next; });
  }
  function toggleIds(ids) {
    setSelected((cur) => {
      const next = new Set(cur);
      const allIn = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  }
  function selectRow(entityId) { const r = rows.find((x) => x.entity_id === entityId); if (r) toggleIds(r.cells.map((c) => c.instance_id)); }
  function selectColumn(defId) { toggleIds(rows.map((r) => r.cells.find((c) => c.task_def_id === defId)?.instance_id).filter(Boolean)); }
  function clearSel() { setSelected(new Set()); }
  async function applyBulk(done) {
    const ids = [...selected];
    if (ids.length === 0) return;
    await api.bulkUpdateInstances(ids, done);
    setSelected(new Set());
    await load();
  }

  if (loading && !data) return <Spinner />;

  return (
    <div className="space-y-4">
      <StatSection title="Entities" open={entityStatsOpen} onToggle={toggleEntityStats}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label={project.entity_label + "s"} value={stats.total} tone="brand" />
          <StatCard label="Completed" value={stats.completed} pct={pct1(stats.completed, stats.total)} tone="green" />
          <StatCard label="Scheduled" value={stats.ontrack} pct={pct1(stats.ontrack, stats.total)} tone="slate" />
          <StatCard label="Due soon" value={stats.duesoon} pct={pct1(stats.duesoon, stats.total)} tone="amber" />
          <StatCard label="Overdue" value={stats.delayed} pct={pct1(stats.delayed, stats.total)} tone="red" />
          <StatCard label="On hold" value={stats.onhold} pct={pct1(stats.onhold, stats.total)} tone="blue" />
        </div>
      </StatSection>
      <StatSection title="Tasks" open={taskStatsOpen} onToggle={toggleTaskStats}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Tasks done" value={`${taskStats.done} / ${taskStats.total}`} pct={pct1(taskStats.done, taskStats.total)} tone="green" />
          <StatCard label="Overdue" value={taskStats.overdue} pct={pct1(taskStats.overdue, taskStats.total)} tone="red" />
          <StatCard label="Due soon" value={taskStats.duesoon} pct={pct1(taskStats.duesoon, taskStats.total)} tone="amber" />
          <StatCard label="Scheduled" value={taskStats.future} pct={pct1(taskStats.future, taskStats.total)} tone="slate" />
        </div>
      </StatSection>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input w-56 pl-9" placeholder={`Search ${project.entity_label.toLowerCase()}s...`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === f.id ? "bg-brand-600 text-white shadow-soft" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}>{f.label}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {defs.length > 0 && (
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
              <button className="btn-ghost px-1.5 py-1" title="Zoom out" onClick={() => setZoom(cellPx - 3)}><ZoomOut size={16} /></button>
              <button className="btn-ghost px-1.5 py-1" title="Fit to width" onClick={fitZoom}><Maximize2 size={15} /></button>
              <button className="btn-ghost px-1.5 py-1" title="Zoom in" onClick={() => setZoom(cellPx + 3)}><ZoomIn size={16} /></button>
            </div>
          )}
          <button className="btn-ghost px-2.5" onClick={load} title="Refresh"><RefreshCw size={16} /></button>
          <button className={`btn-subtle ${selectMode ? "text-brand-600 ring-2 ring-brand-500" : ""}`} onClick={toggleSelectMode} title="Bulk select tasks"><CheckSquare size={16} /> Select</button>
          <button className="btn-subtle" onClick={() => setImportOpen(true)}><Upload size={16} /> Import</button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} /> Add {project.entity_label.toLowerCase()}</button>
        </div>
      </div>

      {drill && (
        <div className="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-2.5 text-sm ring-1 ring-inset ring-brand-500/20 dark:bg-brand-500/10">
          <span className="text-brand-700 dark:text-brand-300">Live in <span className="font-semibold">{drill.label}</span>: {rows.length} {project.entity_label.toLowerCase()}{rows.length === 1 ? "" : "s"}</span>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onClearDrill}><X size={14} /> Clear</button>
        </div>
      )}
      <div ref={wrapRef}>
        {rows.length === 0 ? (
          <EmptyState icon={LayoutGrid}
            title={data?.rows.length ? "Nothing matches your filters" : `No ${project.entity_label.toLowerCase()}s yet`}
            subtitle={data?.rows.length ? "Try clearing the search or filters." : defs.length === 0 ? "Define your repeating tasks in the Task template tab first, then add or import entities here." : `Add or import your first ${project.entity_label.toLowerCase()} to start tracking.`}
            action={<div className="flex gap-2"><button className="btn-subtle" onClick={() => setImportOpen(true)}><Upload size={16} /> Import from Excel</button><button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} /> Add {project.entity_label.toLowerCase()}</button></div>} />
        ) : (
          <Matrix defs={defs} rows={rows} entityLabel={project.entity_label} cellPx={cellPx}
            goliveFilter={goliveFilter} setGoliveFilter={setGoliveFilter} taskFilters={taskFilters} setTaskFilter={setTaskFilter}
            onOpen={(id, tab) => setOpen({ id, tab })} onToggleTask={askToggle} onGoliveSave={saveGolive}
            selectMode={selectMode} selected={selected} onToggleCell={toggleCell} onSelectRow={selectRow} onSelectColumn={selectColumn} />
        )}
      </div>

      <Legend />
      {open && <EntityDrawer entityId={open.id} initialTab={open.tab} onClose={() => setOpen(null)} onSaved={load} />}
      {confirm && (
        <Modal open onClose={() => setConfirm(null)} title={confirm.done ? "Mark as not completed?" : "Mark as completed?"}
          footer={<><button className="btn-subtle" onClick={() => setConfirm(null)}>Cancel</button><button className="btn-primary" onClick={applyToggle}>{confirm.done ? "Mark not completed" : "Mark completed"}</button></>}>
          <p className="text-sm text-slate-600 dark:text-slate-300">Task: <span className="font-semibold">{confirm.name}</span></p>
        </Modal>
      )}
      <AddEntityModal open={addOpen} project={project} onClose={() => setAddOpen(false)} onCreated={(e) => { setAddOpen(false); load(); setOpen({ id: e.id, tab: "tasks" }); }} />
      <ImportModal open={importOpen} project={project} onClose={() => setImportOpen(false)} onDone={load} />
      {selectMode && (
        <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
          <div className="card flex flex-wrap items-center gap-2 px-4 py-2.5 shadow-soft ring-1 ring-brand-500/30">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{selected.size} selected</span>
            <span className="hidden text-xs text-slate-400 sm:inline">Click cells, an entity name (row) or a task header (column)</span>
            <div className="ml-1 flex items-center gap-1.5">
              <button className="btn-primary px-3 py-1.5 text-sm disabled:opacity-40" disabled={!selected.size} onClick={() => applyBulk(true)}><Check size={15} /> Mark completed</button>
              <button className="btn-subtle px-3 py-1.5 text-sm disabled:opacity-40" disabled={!selected.size} onClick={() => applyBulk(false)}><Ban size={15} /> Mark not completed</button>
              <button className="btn-ghost px-2.5 py-1.5 text-sm disabled:opacity-40" disabled={!selected.size} onClick={clearSel}>Clear</button>
              <button className="btn-ghost px-2.5 py-1.5 text-sm" onClick={toggleSelectMode}><X size={15} /> Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatSection({ title, open, onToggle, children }) {
  return (
    <div>
      <button onClick={onToggle} className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
        <ChevronDown size={14} className={`transition ${open ? "" : "-rotate-90"}`} />{title}
      </button>
      {open && children}
    </div>
  );
}

function Matrix({ defs, rows, entityLabel, cellPx, goliveFilter, setGoliveFilter, taskFilters, setTaskFilter, onOpen, onToggleTask, onGoliveSave, selectMode, selected, onToggleCell, onSelectRow, onSelectColumn }) {
  const square = Math.max(5, Math.min(cellPx - 14, 9));
  const goliveId = defs.find((d) => d.is_golive)?.id;
  const [popover, setPopover] = useState(null);
  function openGoliveFilter(ev) { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); setPopover({ kind: "golive", x: r.left, y: r.bottom + 4, options: GOLIVE_FILTER_OPTIONS, current: goliveFilter }); }
  function openTaskFilter(ev, id) { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); setPopover({ kind: "task", id, x: r.left, y: r.bottom + 4, options: TASK_FILTER_OPTIONS, current: taskFilters[id] || "" }); }
  function choose(v) { if (popover.kind === "golive") setGoliveFilter(v || "all"); else setTaskFilter(popover.id, v); setPopover(null); }
  const headBase = "sticky bg-slate-50/95 backdrop-blur dark:bg-slate-900/95";
  const cornerStyle = (left, width, extra = "") => ({ className: `${headBase} top-0 z-30 px-3 py-3 text-left align-bottom ${extra}`, style: { left, width, minWidth: width, maxWidth: width } });
  const bodyBase = "sticky z-10 box-border border-t border-slate-100 bg-white px-3 py-2.5 group-hover:bg-brand-50/60 dark:border-slate-800 dark:bg-slate-900 dark:group-hover:bg-slate-800/60";
  const stickyBody = (left, width, extra = "") => ({ className: `${bodyBase} ${extra}`, style: { left, width, minWidth: width, maxWidth: width } });
  return (
    <div className="card overflow-hidden">
      <div className="max-h-[64vh] overflow-auto">
        <table className="border-separate border-spacing-0" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th {...cornerStyle(0, W_RACK, "px-4")}><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{entityLabel}</span></th>
              <th {...cornerStyle(W_RACK, W_GOLIVE, "hidden md:table-cell")}>
                <button onClick={openGoliveFilter} className={`flex items-center gap-1 text-xs font-bold uppercase tracking-wide ${goliveFilter !== "all" ? "text-brand-600" : "text-slate-500 hover:text-slate-700"}`}>Go-live <Filter size={11} /></button>
              </th>
              <th {...cornerStyle(W_RACK + W_GOLIVE, W_STATUS, "hidden md:table-cell")}><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</span></th>
              <th {...cornerStyle(W_RACK + W_GOLIVE + W_STATUS, W_NEXT, "hidden md:table-cell")}><span className="text-xs font-bold uppercase tracking-wide text-slate-500" title="Next steps whose due date has arrived or passed">Overdue next steps</span></th>
              {defs.map((d) => {
                const active = !!taskFilters[d.id];
                return (
                  <th key={d.id} className={`sticky top-0 z-20 h-40 align-bottom backdrop-blur ${d.is_golive ? "bg-emerald-500/[0.28]" : "bg-slate-50/95 dark:bg-slate-900/95"}`} style={{ width: cellPx, minWidth: cellPx, maxWidth: cellPx }}>
                    <button onClick={(ev) => (selectMode ? (ev.stopPropagation(), onSelectColumn(d.id)) : openTaskFilter(ev, d.id))} className="relative flex h-36 w-full items-end justify-center pb-2" title={selectMode ? `${d.name} (click to select column)` : `${d.name}${d.responsible ? " — " + d.responsible : ""} (click to filter)`}>
                      {active && <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-brand-600" />}
                      <span className={`font-normal ${active ? "text-brand-600" : "text-slate-600 dark:text-slate-300"}`}
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: "8.5rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: cellPx < 20 ? "10px" : "12px" }}>{d.name}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const om = OVERALL_META[r.overall] || OVERALL_META.none;
              return (
                <tr key={r.entity_id} className="group">
                  <td {...stickyBody(0, W_RACK, "px-4")}>
                    <div className="flex items-start justify-between gap-1.5">
                      <button className="group/ent min-w-0 flex-1 text-left" onClick={() => (selectMode ? onSelectRow(r.entity_id) : onOpen(r.entity_id, "tasks"))} title={selectMode ? "Select whole row" : "Open"}>
                        <div className="truncate text-sm font-semibold group-hover/ent:text-brand-600">{r.code || "—"}</div>
                        <div className="truncate text-xs text-slate-400 group-hover/ent:text-brand-500">{r.name || r.location}</div>
                      </button>
                      {r.has_notes && <button className="mt-0.5 shrink-0" onClick={() => onOpen(r.entity_id, "notes")} title="Notes"><StickyNote size={13} className="text-amber-500" /></button>}
                    </div>
                  </td>
                  <td {...stickyBody(W_RACK, W_GOLIVE, "hidden md:table-cell")}><GoliveCell row={r} onSave={onGoliveSave} /></td>
                  <td {...stickyBody(W_RACK + W_GOLIVE, W_STATUS, "hidden md:table-cell cursor-pointer")} onClick={() => onOpen(r.entity_id, "tasks")}><Badge meta={om} /></td>
                  <td {...stickyBody(W_RACK + W_GOLIVE + W_STATUS, W_NEXT, "hidden md:table-cell cursor-pointer")} onClick={() => onOpen(r.entity_id, "tasks")}>
                    {r.next_steps_due > 0 ? (
                      <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300">{r.next_steps_due}</span>
                    ) : (
                      <span className="text-xs text-slate-300 dark:text-slate-600">0</span>
                    )}
                  </td>
                  {r.cells.map((c) => {
                    const m = STATUS_META[c.status] || STATUS_META.none;
                    const name = defs.find((d) => d.id === c.task_def_id)?.name || "";
                    const isSel = selectMode && selected.has(c.instance_id);
                    const tip = selectMode
                      ? `${name}\n${m.label}\n(click to ${isSel ? "deselect" : "select"})`
                      : `${name}\n${m.label}` + (c.planned_date ? `\nDeadline: ${c.planned_date}` : "") + "\n(click to mark)";
                    return (
                      <td key={c.task_def_id} onClick={() => (selectMode ? onToggleCell(c.instance_id) : onToggleTask(c, name))}
                        className={`cursor-pointer border-t border-slate-100 py-1.5 text-center dark:border-slate-800 ${isSel ? "bg-brand-500/20 ring-2 ring-inset ring-brand-500" : c.task_def_id === goliveId ? "bg-emerald-500/[0.18]" : ""}`} style={{ width: cellPx, minWidth: cellPx, maxWidth: cellPx }}>
                        <div title={tip} className={`mx-auto rounded-full ring-1 ring-inset ring-black/5 transition hover:scale-150 dark:ring-white/5 ${m.cell}`} style={{ width: square, height: square }} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {popover && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setPopover(null)} />
          <div className="card fixed z-50 w-44 overflow-hidden p-1" style={{ left: Math.min(popover.x, window.innerWidth - 190), top: popover.y }}>
            {popover.options.map((o) => (
              <button key={o.v} onClick={() => choose(o.v)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${popover.current === o.v ? "font-semibold text-brand-600" : ""}`}>
                {o.l}{popover.current === o.v && <span className="text-brand-600">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Legend() {
  const items = ["done", "overdue", "duesoon", "future", "onhold", "none"];
  return (
    <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-slate-500">
      {items.map((k) => (<div key={k} className="flex items-center gap-1.5"><span className={`h-3.5 w-3.5 rounded-full ${STATUS_META[k].cell} ring-1 ring-inset ring-black/10 dark:ring-white/10`} />{STATUS_META[k].label}</div>))}
    </div>
  );
}

function StatCard({ label, value, pct, tone }) {
  const tones = { brand: "text-brand-600", green: "text-emerald-600", amber: "text-amber-600", red: "text-rose-600", blue: "text-blue-600", slate: "text-slate-500" };
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-2xl font-extrabold ${tones[tone]}`}>{value}</span>
        {pct && <span className="text-xs font-semibold text-slate-400">{pct}</span>}
      </div>
    </div>
  );
}

function GoliveCell({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.golive_date || "");
  useEffect(() => setVal(row.golive_date || ""), [row.golive_date]);
  async function commit() {
    setEditing(false);
    if ((val || "") === (row.golive_date || "")) return;
    await onSave(row.entity_id, val || null);
  }
  return (
    <div onClick={(e) => e.stopPropagation()}>
      {editing ? (
        <input
          type="date"
          autoFocus
          className="input w-[112px] px-2 py-1 text-xs"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      ) : (
        <button className="whitespace-nowrap text-xs text-slate-500 hover:text-brand-600" onClick={() => setEditing(true)}>
          {row.golive_date ? fmtDate(row.golive_date) : "Set date"}
        </button>
      )}
    </div>
  );
}

function AddEntityModal({ open, project, onClose, onCreated }) {
  const [form, setForm] = useState({ code: "", name: "", golive_date: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ code: "", name: "", golive_date: "" }); }, [open]);
  async function submit() {
    if (!form.code.trim() && !form.name.trim()) return;
    setBusy(true);
    try { const e = await api.createEntity(project.id, { code: form.code.trim(), name: form.name.trim(), golive_date: form.golive_date || null }); onCreated(e); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Add ${project.entity_label.toLowerCase()}`}
      footer={<><button className="btn-subtle" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>Create</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code"><input className="input" autoFocus value={form.code} placeholder="001D" onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Field label="Go-live date"><input className="input" type="date" value={form.golive_date} onChange={(e) => setForm({ ...form, golive_date: e.target.value })} /></Field>
        </div>
        <Field label="Name / building"><input className="input" value={form.name} placeholder="Central Office Building" onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock size={14} /> Task deadlines are calculated automatically from the go-live date.</p>
      </div>
    </Modal>
  );
}
