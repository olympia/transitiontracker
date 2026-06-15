// Shared status visuals for RAG cells and badges.

export const STATUS_META = {
  done: {
    label: "Done",
    dot: "bg-emerald-500",
    cell: "bg-emerald-500",
    soft: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20",
  },
  overdue: {
    label: "Overdue",
    dot: "bg-rose-500",
    cell: "bg-rose-500",
    soft: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20",
  },
  duesoon: {
    label: "Due soon",
    dot: "bg-amber-400",
    cell: "bg-amber-400",
    soft: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/20",
  },
  future: {
    label: "Scheduled",
    dot: "bg-slate-300 dark:bg-slate-600",
    cell: "bg-slate-200 dark:bg-slate-700",
    soft: "bg-slate-100 text-slate-500 ring-slate-400/20 dark:bg-slate-800 dark:text-slate-400",
  },
  none: {
    label: "Not set",
    dot: "bg-slate-200 dark:bg-slate-700",
    cell: "bg-transparent",
    soft: "bg-slate-50 text-slate-400 ring-slate-300/30 dark:bg-slate-900 dark:text-slate-500",
  },
};

export const OVERALL_META = {
  green: {
    label: "On track",
    soft: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  amber: {
    label: "In progress",
    soft: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/15 dark:text-amber-300",
    dot: "bg-amber-400",
  },
  red: {
    label: "Delayed",
    soft: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  onhold: {
    label: "On hold",
    soft: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  none: {
    label: "No go-live",
    soft: "bg-slate-100 text-slate-500 ring-slate-400/20 dark:bg-slate-800 dark:text-slate-400",
    dot: "bg-slate-400",
  },
};

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
