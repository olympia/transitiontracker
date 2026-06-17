import React, { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ListChecks,
  Flag,
  Upload,
} from "lucide-react";
import { api } from "../api";
import { EmptyState, Spinner } from "../components/ui.jsx";
import ImportModal from "../components/ImportModal.jsx";

function offsetLabel(days, noDeadline) {
  if (noDeadline) return "No deadline";
  if (days === 0) return "On go-live";
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} before`;
  return `${-days} day${days === -1 ? "" : "s"} after`;
}

export default function TemplateEditor({ project }) {
  const [defs, setDefs] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  async function load() {
    setDefs(await api.listTaskDefs(project.id));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function addRow() {
    await api.createTaskDef(project.id, {
      name: "New task",
      responsible: "",
      offset_days: 0,
    });
    await load();
  }
  async function move(idx, dir) {
    const next = [...defs];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setDefs(next);
    await api.reorderTaskDefs(
      project.id,
      next.map((d) => d.id)
    );
  }

  if (defs === null) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Task template</h2>
          <p className="text-sm text-slate-500">
            The repeating tasks tracked for every {project.entity_label.toLowerCase()}.
            Deadlines are derived from each {project.entity_label.toLowerCase()}'s go-live
            date using the offset below.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-subtle" onClick={() => setImportOpen(true)}>
            <Upload size={16} /> Import
          </button>
          <button className="btn-primary" onClick={addRow}>
            <Plus size={16} /> Add task
          </button>
        </div>
      </div>

      {defs.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No tasks yet"
          subtitle="Add the recurring tasks that should be tracked across every entity. Positive offset = days before go-live, negative = days after."
          action={
            <button className="btn-primary" onClick={addRow}>
              <Plus size={16} /> Add first task
            </button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_11rem_7rem_7rem_5.5rem_2.5rem] items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900">
            <span></span>
            <span>Task</span>
            <span>Responsible</span>
            <span>Offset (days)</span>
            <span>Timing</span>
            <span>Go-live</span>
            <span></span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {defs.map((d, idx) => (
              <Row
                key={d.id}
                d={d}
                idx={idx}
                count={defs.length}
                onChanged={load}
                onMove={move}
              />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-500 dark:bg-slate-900">
        <strong>How offset works:</strong> planned date = go-live − offset. So{" "}
        <code>30</code> means 30 days before go-live, <code>0</code> is the go-live day,
        and <code>-3</code> is 3 days after. Toggle <strong>No deadline</strong> for tasks
        that should never be flagged as overdue.
      </div>

      <ImportModal
        open={importOpen}
        project={project}
        onClose={() => setImportOpen(false)}
        onDone={load}
      />
    </div>
  );
}

function Row({ d, idx, count, onChanged, onMove }) {
  const [local, setLocal] = useState(d);
  useEffect(() => setLocal(d), [d]);

  async function save(patch) {
    const next = { ...local, ...patch };
    setLocal(next);
    await api.updateTaskDef(d.id, {
      name: next.name,
      responsible: next.responsible,
      offset_days: Number(next.offset_days) || 0,
      no_deadline: next.no_deadline,
      is_golive: next.is_golive,
    });
    onChanged?.();
  }
  async function remove() {
    await api.deleteTaskDef(d.id);
    onChanged?.();
  }

  return (
    <div className="grid grid-cols-[2.5rem_1fr_11rem_7rem_7rem_5.5rem_2.5rem] items-center gap-2 px-3 py-2">
      <div className="flex flex-col items-center text-slate-300">
        <button
          className="hover:text-brand-600 disabled:opacity-30"
          disabled={idx === 0}
          onClick={() => onMove(idx, -1)}
        >
          <ChevronUp size={15} />
        </button>
        <button
          className="hover:text-brand-600 disabled:opacity-30"
          disabled={idx === count - 1}
          onClick={() => onMove(idx, 1)}
        >
          <ChevronDown size={15} />
        </button>
      </div>
      <input
        className="input py-1.5"
        value={local.name}
        onChange={(e) => setLocal({ ...local, name: e.target.value })}
        onBlur={() => save({})}
      />
      <input
        className="input py-1.5"
        value={local.responsible}
        placeholder="Team / owner"
        onChange={(e) => setLocal({ ...local, responsible: e.target.value })}
        onBlur={() => save({})}
      />
      <input
        className="input py-1.5"
        type="number"
        disabled={local.no_deadline}
        value={local.offset_days}
        onChange={(e) => setLocal({ ...local, offset_days: e.target.value })}
        onBlur={() => save({})}
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">
          {offsetLabel(Number(local.offset_days) || 0, local.no_deadline)}
        </span>
        <button
          className={`text-left text-[11px] font-semibold ${
            local.no_deadline ? "text-violet-600" : "text-slate-400 hover:text-slate-600"
          }`}
          onClick={() => save({ no_deadline: !local.no_deadline })}
        >
          {local.no_deadline ? "✓ No deadline" : "Set no deadline"}
        </button>
      </div>
      <button
        onClick={() => save({ is_golive: !local.is_golive })}
        title={local.is_golive ? "Go-live milestone" : "Mark as go-live milestone"}
        className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
          local.is_golive
            ? "bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
            : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        <Flag size={14} />
        {local.is_golive ? "Go-live" : "Set"}
      </button>
      <button className="text-slate-300 hover:text-rose-500" onClick={remove}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}
