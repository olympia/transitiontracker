import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutGrid,
  ListChecks,
  FolderKanban,
  BarChart3,
  Moon,
  Sun,
  ChevronDown,
  Plus,
} from "lucide-react";
import { api } from "./api";
import { Spinner, Modal, Field } from "./components/ui.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import TemplateEditor from "./pages/TemplateEditor.jsx";
import Projects from "./pages/Projects.jsx";
import Report from "./pages/Report.jsx";

function useTheme() {
  const [dark, setDark] = useState(
    () =>
      localStorage.getItem("tt-theme") === "dark" ||
      (!localStorage.getItem("tt-theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("tt-theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark];
}

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "report", label: "Report", icon: BarChart3 },
  { id: "template", label: "Task template", icon: ListChecks },
  { id: "projects", label: "Projects", icon: FolderKanban },
];

export default function App() {
  const [dark, setDark] = useTheme();
  const [projects, setProjects] = useState(null);
  const [projectId, setProjectId] = useState(
    () => Number(localStorage.getItem("tt-project")) || null
  );
  const [tab, setTab] = useState("dashboard");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [drill, setDrill] = useState(null);

  async function loadProjects(selectId) {
    const list = await api.listProjects();
    setProjects(list);
    setProjectId((cur) => {
      const target = selectId ?? cur;
      if (target && list.some((p) => p.id === target)) return target;
      return list[0]?.id ?? null;
    });
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (projectId) localStorage.setItem("tt-project", String(projectId));
    setDrill(null);
  }, [projectId]);

  const project = useMemo(
    () => projects?.find((p) => p.id === projectId) || null,
    [projects, projectId]
  );

  if (projects === null)
    return (
      <div className="min-h-screen">
        <Spinner />
      </div>
    );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-[2400px] items-center gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-soft">
              <LayoutGrid size={18} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight">
                Transition Tracker
              </div>
              <div className="text-[11px] font-medium text-slate-400">
                lifecycle migration
              </div>
            </div>
          </div>

          {/* project picker */}
          <div className="relative ml-2">
            <button
              className="btn-subtle min-w-[200px] justify-between"
              onClick={() => setPickerOpen((v) => !v)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
            >
              <span className="truncate">
                {project ? project.name : "No project"}
              </span>
              <ChevronDown size={16} className="opacity-60" />
            </button>
            {pickerOpen && (
              <div className="card absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden p-1.5">
                <div className="max-h-72 overflow-y-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        p.id === projectId ? "font-semibold text-brand-600" : ""
                      }`}
                      onMouseDown={() => {
                        setProjectId(p.id);
                        setPickerOpen(false);
                      }}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-[11px] text-slate-400">
                        {p.entity_label}
                      </span>
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <div className="px-3 py-4 text-center text-sm text-slate-400">
                      No projects yet
                    </div>
                  )}
                </div>
                <button
                  className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-slate-100 px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  onMouseDown={() => {
                    setPickerOpen(false);
                    setNewOpen(true);
                  }}
                >
                  <Plus size={15} /> New project
                </button>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              className="btn-ghost px-2.5"
              onClick={() => setDark(!dark)}
              title="Toggle theme"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="mx-auto max-w-[2400px] px-4 sm:px-6">
          <nav className="flex gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setDrill(null); }}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${
                    active
                      ? "border-brand-600 text-brand-600"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon size={16} /> {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[2400px] px-4 py-6 sm:px-6">
        {!project ? (
          <Projects projects={projects} onChange={loadProjects} />
        ) : tab === "dashboard" ? (
          <Dashboard project={project} drill={drill} onClearDrill={() => setDrill(null)} />
        ) : tab === "report" ? (
          <Report project={project} onDrill={(ids, label) => { setDrill({ ids, label }); setTab("dashboard"); }} />
        ) : tab === "template" ? (
          <TemplateEditor project={project} />
        ) : (
          <Projects
            projects={projects}
            onChange={loadProjects}
            activeId={projectId}
            onSelect={setProjectId}
          />
        )}
      </main>

      <NewProjectModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(p) => {
          setNewOpen(false);
          loadProjects(p.id);
          setTab("template");
        }}
      />
    </div>
  );
}

function NewProjectModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("Rack");
  const [dueSoon, setDueSoon] = useState(3);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setLabel("Rack");
      setDueSoon(3);
    }
  }, [open]);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await api.createProject({
        name: name.trim(),
        entity_label: label.trim() || "Entity",
        due_soon_days: Number(dueSoon) || 3,
      });
      onCreated(p);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <button className="btn-subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            Create project
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Project name">
          <input
            className="input"
            value={name}
            autoFocus
            placeholder="e.g. SZHB LAN Migration"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Entity label">
            <input
              className="input"
              value={label}
              placeholder="Rack / Site / Country"
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label="Due-soon window (days)">
            <input
              className="input"
              type="number"
              value={dueSoon}
              onChange={(e) => setDueSoon(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          The entity label names what the tasks repeat over (racks, sites,
          countries, anything).
        </p>
      </div>
    </Modal>
  );
}
