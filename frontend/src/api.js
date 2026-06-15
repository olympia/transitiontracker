// Thin fetch wrapper around the REST API.
const BASE = "/api";

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  // projects
  listProjects: () => req("GET", "/projects"),
  createProject: (p) => req("POST", "/projects", p),
  updateProject: (id, p) => req("PUT", `/projects/${id}`, p),
  deleteProject: (id) => req("DELETE", `/projects/${id}`),

  // task definitions
  listTaskDefs: (pid) => req("GET", `/projects/${pid}/task-definitions`),
  createTaskDef: (pid, d) => req("POST", `/projects/${pid}/task-definitions`, d),
  updateTaskDef: (id, d) => req("PUT", `/task-definitions/${id}`, d),
  deleteTaskDef: (id) => req("DELETE", `/task-definitions/${id}`),
  reorderTaskDefs: (pid, ids) =>
    req("PUT", `/projects/${pid}/task-definitions/reorder`, ids),

  // entities
  listEntities: (pid) => req("GET", `/projects/${pid}/entities`),
  createEntity: (pid, e) => req("POST", `/projects/${pid}/entities`, e),
  getEntity: (id) => req("GET", `/entities/${id}`),
  updateEntity: (id, e) => req("PUT", `/entities/${id}`, e),
  deleteEntity: (id) => req("DELETE", `/entities/${id}`),

  // task instances
  updateInstance: (id, p) => req("PUT", `/task-instances/${id}`, p),

  // inventory
  addInventory: (eid, i) => req("POST", `/entities/${eid}/inventory`, i),
  updateInventory: (id, i) => req("PUT", `/inventory/${id}`, i),
  deleteInventory: (id) => req("DELETE", `/inventory/${id}`),

  // matrix
  matrix: (pid) => req("GET", `/projects/${pid}/matrix`),
};
