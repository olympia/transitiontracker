import React, { useState } from "react";
import { FolderKanban, Plus, Trash2, Check, Pencil } from "lucide-react";
import { api } from "../api";
import { EmptyState, Modal, Field } from "../components/ui.jsx";

export default function Projects({ projects, onChange, activeId, onSelect }) {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  async function remove(p) {
    if (
      !window.confirm(
        `Delete project "${p.name}" and all its entities and tasks? This cannot be undone.`
      )
    )
      return;
    await api.deleteProject(p.id);
    onChange();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold">Projects</h2>
          <p className="text-sm text-slate-500">
            Each project has its own entities and task template.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New project
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          subtitle="Create a project to start tracking repeating tasks across your entities."
          action={
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New project
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className={`card p-4 transition hover:shadow-md ${
                p.id === activeId ? "ring-2 ring-brand-500/40" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                  <FolderKanban size={18} />
                </div>
                <div className="flex gap-1">
                  <button
                    className="btn-ghost px-2 py-1"
                    onClick={() => setEditing(p)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="btn-ghost px-2 py-1 text-slate-400 hover:text-rose-500"
                    onClick={() => remove(p)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <h3 className="mt-3 truncate text-base font-bold">{p.name}</h3>
              <p className="line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">
                {p.description || "No description"}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800">
                  {p.entity_label}
                </span>
                {onSelect &&
                  (p.id === activeId ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-brand-600">
                      <Check size={14} /> Selected
                    </span>
                  ) : (
                    <button
                      className="text-xs font-semibold text-brand-600 hover:underline"
                      onClick={() => onSelect(p.id)}
                    >
                      Select
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ProjectModal
        open={creating || !!editing}
        project={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onDone={() => {
          setCreating(false);
          setEditing(null);
          onChange();
        }}
      />
    </div>
  );
}

function ProjectModal({ open, project, onClose, onDone }) {
  const [form, setForm] = useState(null);

  React.useEffect(() => {
    if (open)
      setForm(
        project
          ? { ...project }
          : { name: "", description: "", entity_label: "Rack", due_soon_days: 3 }
      );
  }, [open, project]);

  if (!form) return null;

  async function submit() {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      description: form.description || "",
      entity_label: form.entity_label.trim() || "Entity",
      due_soon_days: Number(form.due_soon_days) || 3,
    };
    if (project) await api.updateProject(project.id, payload);
    else await api.createProject(payload);
    onDone();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Edit project" : "New project"}
      footer={
        <>
          <button className="btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            {project ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input
            className="input"
            value={form.name}
            autoFocus
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Description">
          <textarea
            className="input min-h-[80px]"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Entity label">
            <input
              className="input"
              value={form.entity_label}
              onChange={(e) =>
                setForm({ ...form, entity_label: e.target.value })
              }
            />
          </Field>
          <Field label="Due-soon window (days)">
            <input
              className="input"
              type="number"
              value={form.due_soon_days}
              onChange={(e) =>
                setForm({ ...form, due_soon_days: e.target.value })
              }
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
