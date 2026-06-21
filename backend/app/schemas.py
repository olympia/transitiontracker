"""Pydantic schemas (API request/response shapes)."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


# ---------- Project ----------
class ProjectBase(BaseModel):
    name: str
    description: str = ""
    entity_label: str = "Entity"
    due_soon_days: int = 3
    base_currency: str = "HUF"
    reporting_currency_1: str = ""
    reporting_currency_2: str = ""


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    entity_label: str | None = None
    due_soon_days: int | None = None
    base_currency: str | None = None
    reporting_currency_1: str | None = None
    reporting_currency_2: str | None = None


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
    next_step: str | None = None
    next_step_due: date | None = None
    clear_next_step_due: bool = False


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
    on_hold: bool = False
    notes: str = ""
    contact_name: str = ""
    contact_phone: str = ""
    contact_email: str = ""
    position: int = 0


class EntityCreate(EntityBase):
    pass


class EntityUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    location: str | None = None
    golive_date: date | None = None
    clear_golive: bool = False
    on_hold: bool | None = None
    notes: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
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
    next_step: str
    next_step_due: date | None


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
    has_notes: bool
    next_steps_due: int
    on_hold: bool
    overall: str
    overdue_count: int
    cells: list[MatrixCell]


class MatrixOut(BaseModel):
    project: ProjectOut
    task_definitions: list[TaskDefinitionOut]
    rows: list[MatrixRow]


# ============================================================ financial tracker
# ---------- WBS category (defined at project setup) ----------
class WbsCategoryBase(BaseModel):
    name: str = ""
    position: int = 0


class WbsCategoryCreate(WbsCategoryBase):
    pass


class WbsCategoryUpdate(BaseModel):
    name: str | None = None
    position: int | None = None


class WbsCategoryOut(WbsCategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int


# ---------- Budget month ----------
class BudgetMonthOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_id: int
    month: int
    budget_value: float
    realized_value: float
    po_committed: bool = False
    po_number: str = ""


class BudgetMonthUpdate(BaseModel):
    budget_value: float | None = None
    realized_value: float | None = None
    po_committed: bool | None = None
    po_number: str | None = None


# ---------- Budget item ----------
class BudgetItemBase(BaseModel):
    name: str = ""
    item_type: str = "fixed"  # fixed | manday
    daily_rate: float = 0.0
    is_cr: bool = False
    cr_kind: str = ""  # carry_over | reallocation | cancelation | cr
    partner_item_id: int | None = None
    position: int = 0


class BudgetItemCreate(BudgetItemBase):
    pass


class BudgetItemUpdate(BaseModel):
    name: str | None = None
    item_type: str | None = None
    daily_rate: float | None = None
    is_cr: bool | None = None
    cr_kind: str | None = None
    partner_item_id: int | None = None
    position: int | None = None


class BudgetItemOut(BudgetItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    leg_id: int


class BudgetItemFull(BudgetItemOut):
    months: list[BudgetMonthOut]


# ---------- Change request ----------
class ChangeRequestBase(BaseModel):
    kind: str = "cr"  # carry_over | reallocation | cancelation | cr
    label: str = ""
    amount: float = 0.0
    position: int = 0


class ChangeRequestCreate(ChangeRequestBase):
    pass


class ChangeRequestUpdate(BaseModel):
    kind: str | None = None
    label: str | None = None
    amount: float | None = None
    position: int | None = None


class ChangeRequestOut(ChangeRequestBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    leg_id: int


# ---------- WBS leg ----------
class WbsLegBase(BaseModel):
    code: str = ""
    name: str = ""
    category: str = ""
    position: int = 0


class WbsLegCreate(WbsLegBase):
    pass


class WbsLegUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    category: str | None = None
    position: int | None = None


class WbsLegOut(WbsLegBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    year_id: int


class WbsLegFull(WbsLegOut):
    items: list[BudgetItemFull]
    change_requests: list[ChangeRequestOut]


# ---------- Financial year ----------
class FinancialYearBase(BaseModel):
    year: int
    rate_1: float = 0.0
    rate_2: float = 0.0
    forecast_from_month: int = 1


class FinancialYearCreate(FinancialYearBase):
    pass


class FinancialYearUpdate(BaseModel):
    year: int | None = None
    rate_1: float | None = None
    rate_2: float | None = None
    forecast_from_month: int | None = None


class FinancialYearOut(FinancialYearBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int


# ---------- Raw nested view (aggregates computed client-side) ----------
class FinanceYearData(BaseModel):
    project: ProjectOut
    year: FinancialYearOut
    legs: list[WbsLegFull]
