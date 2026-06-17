import React, { useEffect, useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { api } from "../api";
import { Modal } from "./ui.jsx";

export default function ImportModal({ open, project, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("append");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setFile(null);
      setMode("append");
      setBusy(false);
      setError("");
      setResult(null);
    }
  }, [open]);

  async function run() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const counts = await api.importExcel(project.id, file, mode);
      setResult(counts);
      onDone?.();
    } catch (e) {
      setError(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from Excel"
      wide
      footer={
        result ? (
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn-subtle" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={run} disabled={!file || busy}>
              <Upload size={16} /> {busy ? "Importing..." : "Import"}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 py-2 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500" size={40} />
          <p className="text-base font-semibold">Import complete</p>
          <div className="mx-auto grid max-w-sm grid-cols-2 gap-2 text-sm">
            <ResultPill label="Tasks created" value={result.tasks_created} />
            <ResultPill label="Tasks updated" value={result.tasks_updated} />
            <ResultPill label="Entities created" value={result.entities_created} />
            <ResultPill label="Entities updated" value={result.entities_updated} />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl bg-slate-100 p-4 dark:bg-slate-800/60">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 text-brand-600" size={20} />
              <div className="text-sm">
                <p className="font-semibold">Step 1 — get the template</p>
                <p className="text-slate-500">
                  Download the Excel template, fill the <strong>Tasks</strong> and{" "}
                  <strong>Entities</strong> sheets, then upload it below.
                </p>
              </div>
            </div>
            <a
              href={api.importTemplateUrl()}
              className="btn-subtle mt-3"
              download
            >
              <Download size={16} /> Download Excel template
            </a>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Step 2 — upload your file</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 transition hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:bg-slate-800/40"
            >
              <Upload size={22} />
              {file ? (
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {file.name}
                </span>
              ) : (
                <span>Click to choose an .xlsx file</span>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Step 3 — choose how to apply it</p>
            <div className="grid grid-cols-2 gap-3">
              <ModeCard
                active={mode === "append"}
                onClick={() => setMode("append")}
                title="Append / merge"
                desc="Add rows to existing data. Matching codes/names are updated."
              />
              <ModeCard
                active={mode === "replace"}
                onClick={() => setMode("replace")}
                title="Replace"
                desc="Delete this project's current tasks and entities first."
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ModeCard({ active, onClick, title, desc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        active
          ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500/30 dark:bg-brand-500/10"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-700"
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-0.5 text-xs text-slate-500">{desc}</div>
    </button>
  );
}

function ResultPill({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
      <div className="text-lg font-extrabold text-brand-600">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  );
}
