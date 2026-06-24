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
  bulkUpdateInstances: (ids, done) =>
    req("PUT", "/task-instances/bulk", { ids, done }),

  // inventory
  addInventory: (eid, i) => req("POST", `/entities/${eid}/inventory`, i),
  updateInventory: (id, i) => req("PUT", `/inventory/${id}`, i),
  deleteInventory: (id) => req("DELETE", `/inventory/${id}`),

  // matrix
  matrix: (pid) => req("GET", `/projects/${pid}/matrix`),

  // ---- financial tracker ----
  // years
  listYears: (pid) => req("GET", `/projects/${pid}/financial-years`),
  createYear: (pid, y) => req("POST", `/projects/${pid}/financial-years`, y),
  updateYear: (id, y) => req("PUT", `/financial-years/${id}`, y),
  deleteYear: (id) => req("DELETE", `/financial-years/${id}`),
  financeView: (yearId) => req("GET", `/financial-years/${yearId}/view`),
  financeData: (pid) => req("GET", `/projects/${pid}/finance-data`),
  // wbs legs
  listLegs: (yearId) => req("GET", `/financial-years/${yearId}/wbs-legs`),
  createLeg: (yearId, l) => req("POST", `/financial-years/${yearId}/wbs-legs`, l),
  updateLeg: (id, l) => req("PUT", `/wbs-legs/${id}`, l),
  deleteLeg: (id) => req("DELETE", `/wbs-legs/${id}`),
  // wbs categories (project-level pick list)
  listCategories: (pid) => req("GET", `/projects/${pid}/wbs-categories`),
  createCategory: (pid, c) => req("POST", `/projects/${pid}/wbs-categories`, c),
  updateCategory: (id, c) => req("PUT", `/wbs-categories/${id}`, c),
  deleteCategory: (id) => req("DELETE", `/wbs-categories/${id}`),
  // budget items
  createItem: (legId, it) => req("POST", `/wbs-legs/${legId}/budget-items`, it),
  updateItem: (id, it) => req("PUT", `/budget-items/${id}`, it),
  deleteItem: (id) => req("DELETE", `/budget-items/${id}`),
  // budget months (cell saves)
  updateMonth: (id, m) => req("PUT", `/budget-months/${id}`, m),
  // change requests
  createCR: (legId, cr) => req("POST", `/wbs-legs/${legId}/change-requests`, cr),
  updateCR: (id, cr) => req("PUT", `/change-requests/${id}`, cr),
  deleteCR: (id) => req("DELETE", `/change-requests/${id}`),

  // import
  importTemplateUrl: () => BASE + "/import-template",
  importExcel: async (pid, file, mode) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/projects/${pid}/import?mode=${mode}`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        detail = (await res.json()).detail || detail;
      } catch (_) {}
      throw new Error(detail);
    }
    return res.json();
  },
};
