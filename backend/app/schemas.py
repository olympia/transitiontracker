"""Pydantic schemas (API request/response shapes)."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


# ---------- Project ----------
class ProjectBase(BaseModel):
    name: str
    description: str = ""
    entity_label: str = "Entity"
    due_soon_days: int = 3


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    entity_label: str | None = None
    due_soon_days: int | None = None


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ---------- Task definition ----------
class TaskDefinitionBase(BaseModel):
    name: str
    responsible: str = ""
    offset_days: int = 0
    no_deadline: bool = False
    is_golive: bool = False
    position: int = 0


class TaskDefinitionCreate(TaskDefinitionBase):
    pass


class TaskDefinitionUpdate(BaseModel):
    name: str | None = None
    responsible: str | None = None
    offset_days: int | None = None
    no_deadline: bool | None = None
    is_golive: bool | None = None
    position: int | None = None


class TaskDefinitionOut(TaskDefinitionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int


# ---------- Inventory ----------
class InventoryItemBase(BaseModel):
    category: str = "new"
    host: str = ""
    ip_address: str = ""
    model: str = ""
    serial: str = ""
    cmdb_ok: bool = False
    position: int = 0


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemOut(InventoryItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_id: int


# ---------- Task instance ----------
class TaskInstanceUpdate(BaseModel):
    done: bool | None = None
    actual_date: date | None = None
    comment: str | None = None
    clear_actual: bool = False  # explicitly clear the date


class TaskInstanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    entity_id: int
    task_def_id: int
    done: bool
    actual_date: date | None
    comment: str


# ---------- Entity ----------
class EntityBase(BaseModel):
    code: str = ""
    name: str = ""
    location: str = ""
    golive_date: date | None = None
    next_step: str = ""
    on_hold: bool = False
    notes: str = ""
    position: int = 0


class EntityCreate(EntityBase):
    pass


class EntityUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    location: str | None = None
    golive_date: date | None = None
    clear_golive: bool = False
    next_step: str | None = None
    on_hold: bool | None = None
    notes: str | None = None
    position: int | None = None


class EntityOut(EntityBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int


class TaskCellDetail(BaseModel):
    task_def_id: int
    name: str
    responsible: str
    offset_days: int
    instance_id: int
    status: str
    planned_date: str | None
    actual_date: str | None
    done: bool
    comment: str


class EntityDetail(EntityOut):
    tasks: list[TaskCellDetail]
    inventory: list[InventoryItemOut]
    overall: str


# ---------- Matrix ----------
class MatrixCell(BaseModel):
    task_def_id: int
    instance_id: int
    status: str
    planned_date: str | None
    actual_date: str | None


class MatrixRow(BaseModel):
    entity_id: int
    code: str
    name: str
    location: str
    golive_date: date | None
    next_step: str
    has_notes: bool
    on_hold: bool
    overall: str
    overdue_count: int
    cells: list[MatrixCell]


class MatrixOut(BaseModel):
    project: ProjectOut
    task_definitions: list[TaskDefinitionOut]
    rows: list[MatrixRow]
