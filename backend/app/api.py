"""REST API routes."""
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app import imports, models, schemas, status as status_logic
from app.database import get_db

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------- helpers
def _sync_instances_for_entity(db: Session, entity: models.Entity) -> None:
    """Make sure the entity has exactly one TaskInstance per task definition."""
    existing = {i.task_def_id for i in entity.instances}
    defs = (
        db.query(models.TaskDefinition)
        .filter(models.TaskDefinition.project_id == entity.project_id)
        .all()
    )
    for d in defs:
        if d.id not in existing:
            db.add(models.TaskInstance(entity_id=entity.id, task_def_id=d.id))
    db.flush()


def _sync_instances_for_taskdef(db: Session, taskdef: models.TaskDefinition) -> None:
    entities = (
        db.query(models.Entity)
        .filter(models.Entity.project_id == taskdef.project_id)
        .all()
    )
    existing = {
        i.entity_id
        for i in db.query(models.TaskInstance)
        .filter(models.TaskInstance.task_def_id == taskdef.id)
        .all()
    }
    for e in entities:
        if e.id not in existing:
            db.add(models.TaskInstance(entity_id=e.id, task_def_id=taskdef.id))
    db.flush()


def _get_project(db: Session, project_id: int) -> models.Project:
    obj = db.get(models.Project, project_id)
    if not obj:
        raise HTTPException(404, "Project not found")
    return obj


def _get_entity(db: Session, entity_id: int) -> models.Entity:
    obj = db.get(models.Entity, entity_id)
    if not obj:
        raise HTTPException(404, "Entity not found")
    return obj


# ---------------------------------------------------------------- projects
@router.get("/projects", response_model=list[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.name).all()


@router.post("/projects", response_model=schemas.ProjectOut)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)):
    obj = models.Project(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/projects/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return _get_project(db, project_id)


@router.put("/projects/{project_id}", response_model=schemas.ProjectOut)
def update_project(
    project_id: int, payload: schemas.ProjectUpdate, db: Session = Depends(get_db)
):
    obj = _get_project(db, project_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    obj = _get_project(db, project_id)
    db.delete(obj)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- task definitions
@router.get(
    "/projects/{project_id}/task-definitions",
    response_model=list[schemas.TaskDefinitionOut],
)
def list_task_defs(project_id: int, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    return (
        db.query(models.TaskDefinition)
        .filter(models.TaskDefinition.project_id == project_id)
        .order_by(models.TaskDefinition.position, models.TaskDefinition.id)
        .all()
    )


@router.post(
    "/projects/{project_id}/task-definitions",
    response_model=schemas.TaskDefinitionOut,
)
def create_task_def(
    project_id: int,
    payload: schemas.TaskDefinitionCreate,
    db: Session = Depends(get_db),
):
    _get_project(db, project_id)
    data = payload.model_dump()
    if not data.get("position"):
        max_pos = (
            db.query(models.TaskDefinition)
            .filter(models.TaskDefinition.project_id == project_id)
            .count()
        )
        data["position"] = max_pos
    obj = models.TaskDefinition(project_id=project_id, **data)
    db.add(obj)
    db.flush()
    _sync_instances_for_taskdef(db, obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put(
    "/task-definitions/{task_def_id}", response_model=schemas.TaskDefinitionOut
)
def update_task_def(
    task_def_id: int,
    payload: schemas.TaskDefinitionUpdate,
    db: Session = Depends(get_db),
):
    obj = db.get(models.TaskDefinition, task_def_id)
    if not obj:
        raise HTTPException(404, "Task definition not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/task-definitions/{task_def_id}")
def delete_task_def(task_def_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.TaskDefinition, task_def_id)
    if not obj:
        raise HTTPException(404, "Task definition not found")
    db.delete(obj)
    db.commit()
    return {"ok": True}


@router.put("/projects/{project_id}/task-definitions/reorder")
def reorder_task_defs(
    project_id: int, ordered_ids: list[int], db: Session = Depends(get_db)
):
    _get_project(db, project_id)
    for pos, tid in enumerate(ordered_ids):
        obj = db.get(models.TaskDefinition, tid)
        if obj and obj.project_id == project_id:
            obj.position = pos
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- entities
@router.get(
    "/projects/{project_id}/entities", response_model=list[schemas.EntityOut]
)
def list_entities(project_id: int, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    return (
        db.query(models.Entity)
        .filter(models.Entity.project_id == project_id)
        .order_by(models.Entity.position, models.Entity.id)
        .all()
    )


@router.post(
    "/projects/{project_id}/entities", response_model=schemas.EntityOut
)
def create_entity(
    project_id: int, payload: schemas.EntityCreate, db: Session = Depends(get_db)
):
    _get_project(db, project_id)
    data = payload.model_dump()
    if not data.get("position"):
        data["position"] = (
            db.query(models.Entity)
            .filter(models.Entity.project_id == project_id)
            .count()
        )
    obj = models.Entity(project_id=project_id, **data)
    db.add(obj)
    db.flush()
    _sync_instances_for_entity(db, obj)
    db.commit()
    db.refresh(obj)
    return obj


def _entity_detail(db: Session, entity: models.Entity) -> schemas.EntityDetail:
    project = db.get(models.Project, entity.project_id)
    defs = (
        db.query(models.TaskDefinition)
        .filter(models.TaskDefinition.project_id == entity.project_id)
        .order_by(models.TaskDefinition.position, models.TaskDefinition.id)
        .all()
    )
    inst_by_def = {i.task_def_id: i for i in entity.instances}
    tasks = []
    cell_statuses = []
    for d in defs:
        inst = inst_by_def.get(d.id)
        if inst is None:
            inst = models.TaskInstance(entity_id=entity.id, task_def_id=d.id)
            db.add(inst)
            db.flush()
        st = status_logic.task_status(
            entity.golive_date,
            d.offset_days,
            d.no_deadline,
            inst.done,
            inst.actual_date,
            project.due_soon_days,
        )
        cell_statuses.append(st["status"])
        tasks.append(
            schemas.TaskCellDetail(
                task_def_id=d.id,
                name=d.name,
                responsible=d.responsible,
                offset_days=d.offset_days,
                instance_id=inst.id,
                status=st["status"],
                planned_date=st["planned_date"],
                actual_date=st["actual_date"],
                done=st["done"],
                comment=inst.comment,
            )
        )
    overall = status_logic.overall_status(
        entity.on_hold, entity.golive_date, cell_statuses
    )
    base = schemas.EntityOut.model_validate(entity).model_dump()
    return schemas.EntityDetail(
        **base,
        tasks=tasks,
        inventory=[schemas.InventoryItemOut.model_validate(i) for i in entity.inventory],
        overall=overall,
    )


@router.get("/entities/{entity_id}", response_model=schemas.EntityDetail)
def get_entity(entity_id: int, db: Session = Depends(get_db)):
    entity = _get_entity(db, entity_id)
    detail = _entity_detail(db, entity)
    db.commit()
    return detail


@router.put("/entities/{entity_id}", response_model=schemas.EntityDetail)
def update_entity(
    entity_id: int, payload: schemas.EntityUpdate, db: Session = Depends(get_db)
):
    entity = _get_entity(db, entity_id)
    data = payload.model_dump(exclude_unset=True)
    clear = data.pop("clear_golive", False)
    for k, v in data.items():
        setattr(entity, k, v)
    if clear:
        entity.golive_date = None
    db.flush()
    detail = _entity_detail(db, entity)
    db.commit()
    return detail


@router.delete("/entities/{entity_id}")
def delete_entity(entity_id: int, db: Session = Depends(get_db)):
    entity = _get_entity(db, entity_id)
    db.delete(entity)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- task instances
@router.put(
    "/task-instances/{instance_id}", response_model=schemas.TaskInstanceOut
)
def update_instance(
    instance_id: int,
    payload: schemas.TaskInstanceUpdate,
    db: Session = Depends(get_db),
):
    obj = db.get(models.TaskInstance, instance_id)
    if not obj:
        raise HTTPException(404, "Task instance not found")
    data = payload.model_dump(exclude_unset=True)
    clear = data.pop("clear_actual", False)
    for k, v in data.items():
        setattr(obj, k, v)
    if clear:
        obj.actual_date = None
    db.commit()
    db.refresh(obj)
    return obj


# ---------------------------------------------------------------- inventory
@router.post(
    "/entities/{entity_id}/inventory", response_model=schemas.InventoryItemOut
)
def add_inventory(
    entity_id: int,
    payload: schemas.InventoryItemCreate,
    db: Session = Depends(get_db),
):
    _get_entity(db, entity_id)
    data = payload.model_dump()
    if not data.get("position"):
        data["position"] = (
            db.query(models.InventoryItem)
            .filter(models.InventoryItem.entity_id == entity_id)
            .count()
        )
    obj = models.InventoryItem(entity_id=entity_id, **data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put(
    "/inventory/{item_id}", response_model=schemas.InventoryItemOut
)
def update_inventory(
    item_id: int,
    payload: schemas.InventoryItemBase,
    db: Session = Depends(get_db),
):
    obj = db.get(models.InventoryItem, item_id)
    if not obj:
        raise HTTPException(404, "Inventory item not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/inventory/{item_id}")
def delete_inventory(item_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.InventoryItem, item_id)
    if not obj:
        raise HTTPException(404, "Inventory item not found")
    db.delete(obj)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- matrix
@router.get("/projects/{project_id}/matrix", response_model=schemas.MatrixOut)
def get_matrix(project_id: int, db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    defs = (
        db.query(models.TaskDefinition)
        .filter(models.TaskDefinition.project_id == project_id)
        .order_by(models.TaskDefinition.position, models.TaskDefinition.id)
        .all()
    )
    entities = (
        db.query(models.Entity)
        .filter(models.Entity.project_id == project_id)
        .order_by(models.Entity.position, models.Entity.id)
        .all()
    )
    rows = []
    for e in entities:
        inst_by_def = {i.task_def_id: i for i in e.instances}
        cells = []
        cell_statuses = []
        overdue_count = 0
        for d in defs:
            inst = inst_by_def.get(d.id)
            if inst is None:
                inst = models.TaskInstance(entity_id=e.id, task_def_id=d.id)
                db.add(inst)
                db.flush()
            st = status_logic.task_status(
                e.golive_date,
                d.offset_days,
                d.no_deadline,
                inst.done,
                inst.actual_date,
                project.due_soon_days,
            )
            if st["status"] == "overdue":
                overdue_count += 1
            cell_statuses.append(st["status"])
            cells.append(
                schemas.MatrixCell(
                    task_def_id=d.id,
                    instance_id=inst.id,
                    status=st["status"],
                    planned_date=st["planned_date"],
                    actual_date=st["actual_date"],
                )
            )
        overall = status_logic.overall_status(e.on_hold, e.golive_date, cell_statuses)
        rows.append(
            schemas.MatrixRow(
                entity_id=e.id,
                code=e.code,
                name=e.name,
                location=e.location,
                golive_date=e.golive_date,
                next_step=e.next_step,
                on_hold=e.on_hold,
                overall=overall,
                overdue_count=overdue_count,
                cells=cells,
            )
        )
    db.commit()
    return schemas.MatrixOut(
        project=schemas.ProjectOut.model_validate(project),
        task_definitions=[schemas.TaskDefinitionOut.model_validate(d) for d in defs],
        rows=rows,
    )


# ---------------------------------------------------------------- import / template
XLSX_MEDIA = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


@router.get("/import-template")
def download_import_template():
    data = imports.build_template()
    return Response(
        content=data,
        media_type=XLSX_MEDIA,
        headers={
            "Content-Disposition": 'attachment; filename="transition-tracker-import-template.xlsx"'
        },
    )


@router.post("/projects/{project_id}/import")
async def import_excel(
    project_id: int,
    mode: str = Query("append", pattern="^(append|replace)$"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _get_project(db, project_id)
    raw = await file.read()
    try:
        parsed = imports.parse_workbook(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Could not read the Excel file: {exc}")
    if not parsed["tasks"] and not parsed["entities"]:
        raise HTTPException(
            400,
            "No rows found. Make sure the file has 'Tasks' and/or 'Entities' "
            "sheets with the template headers.",
        )
    counts = imports.apply_import(db, project_id, parsed, mode)
    return counts
