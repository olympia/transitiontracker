import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Flag, TrendingUp } from "lucide-react";
import { api } from "../api";
import { Spinner, EmptyState } from "../components/ui.jsx";

function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? null : d;
}

function weekStart(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function periodInfo(date, granularity) {
  if (granularity === "month") {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    return { key, label, sort: date.getFullYear() * 12 + date.getMonth() };
  }
  const ws = weekStart(date);
  const key = ws.toISOString().slice(0, 10);
  const label = ws.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { key, label, sort: ws.getTime() };
}

export default function Report({ project }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState(
    () => localStorage.getItem("tt-report-gran") || "month"
  );

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

  function setGran(g) {
    setGranularity(g);
    localStorage.setItem("tt-report-gran", g);
  }

  const goliveDef = useMemo(
    () => data?.task_definitions.find((d) => d.is_golive) || null,
    [data]
  );

  const { buckets, total } = useMemo(() => {
    if (!data || !goliveDef) return { buckets: [], total: 0 };
    const map = new Map();
    let total = 0;
    for (const r of data.rows) {
      const date = parseDate(r.golive_date);
      if (!date) continue;
      const cell = r.cells.find((c) => c.task_def_id === goliveDef.id);
      if (!cell || cell.status !== "done") continue;
      total++;
      const p = periodInfo(date, granularity);
      const cur = map.get(p.key) || { ...p, count: 0 };
      cur.count++;
      map.set(p.key, cur);
    }
    const arr = [...map.values()].sort((a, b) => a.sort - b.sort);
    let run = 0;
    for (const b of arr) {
      run += b.count;
      b.cumulative = run;
    }
    return { buckets: arr, total };
  }, [data, goliveDef, granularity]);

  if (loading && !data) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Go-live report</h2>
          <p className="text-sm text-slate-500">
            {project.entity_label}s whose go-live task is checked, by their go-live date.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
          {["week", "month"].map((g) => (
            <button
              key={g}
              onClick={() => setGran(g)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition ${
                granularity === g
                  ? "bg-white text-brand-600 shadow-soft dark:bg-slate-900"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {!goliveDef ? (
        <EmptyState
          icon={Flag}
          title="No go-live task marked"
          subtitle="Open the Task template tab and mark which task represents go-live. The report then tracks entities whose go-live task is checked."
        />
      ) : buckets.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nothing live yet"
          subtitle={`No ${project.entity_label.toLowerCase()} has its go-live task ("${goliveDef.name}") checked with a go-live date set.`}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="card px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Gone live
              </div>
              <div className="mt-1 text-2xl font-extrabold text-emerald-600">{total}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Go-live task
              </div>
              <div className="mt-1 truncate text-sm font-semibold" title={goliveDef.name}>
                {goliveDef.name}
              </div>
            </div>
          </div>
          <div className="card p-5">
            <ComboChart buckets={buckets} />
            <ChartLegend />
          </div>
        </>
      )}
    </div>
  );
}

function ComboChart({ buckets }) {
  const H = 320;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 56;
  const barGap = 14;
  const minBarW = 26;
  const colW = Math.max(minBarW + barGap, 60);
  const W = padL + padR + buckets.length * colW;
  const innerH = H - padT - padB;

  const maxVal = Math.max(1, ...buckets.map((b) => b.cumulative));
  const ticks = niceTicks(maxVal, 4);
  const top = ticks[ticks.length - 1];
  const y = (v) => padT + innerH - (v / top) * innerH;

  const linePts = buckets.map((b, i) => {
    const cx = padL + i * colW + colW / 2;
    return [cx, y(b.cumulative)];
  });
  const linePath = linePts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="block" role="img">
        {/* grid + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(t)}
              y2={y(t)}
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="fill-slate-400"
              fontSize="11"
            >
              {t}
            </text>
          </g>
        ))}

        {/* bars */}
        {buckets.map((b, i) => {
          const bx = padL + i * colW + barGap / 2;
          const bw = colW - barGap;
          const by = y(b.count);
          return (
            <g key={b.key}>
              <rect
                x={bx}
                y={by}
                width={bw}
                height={padT + innerH - by}
                rx="4"
                className="fill-brand-500/80"
              >
                <title>
                  {b.label}: {b.count} live
                </title>
              </rect>
              <text
                x={bx + bw / 2}
                y={by - 5}
                textAnchor="middle"
                className="fill-slate-500"
                fontSize="11"
                fontWeight="600"
              >
                {b.count}
              </text>
              <text
                x={padL + i * colW + colW / 2}
                y={H - padB + 18}
                textAnchor="middle"
                className="fill-slate-400"
                fontSize="11"
                transform={
                  buckets.length > 8
                    ? `rotate(40 ${padL + i * colW + colW / 2} ${H - padB + 18})`
                    : undefined
                }
              >
                {b.label}
              </text>
            </g>
          );
        })}

        {/* cumulative line */}
        <path d={linePath} fill="none" className="stroke-emerald-500" strokeWidth="2.5" />
        {linePts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="3.5" className="fill-emerald-500">
            <title>Cumulative: {buckets[i].cumulative}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="mt-3 flex items-center gap-5 text-xs text-slate-500">
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-brand-500/80" /> Per period
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center">
          <TrendingUp size={14} className="text-emerald-500" />
        </span>
        Cumulative total
      </div>
    </div>
  );
}

function niceTicks(max, count) {
  const step = Math.max(1, Math.ceil(max / count));
  const ticks = [];
  for (let v = 0; v <= max + step - 1; v += step) ticks.push(v);
  return ticks;
}
