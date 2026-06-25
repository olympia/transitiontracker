"""SQLAlchemy ORM models."""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Double,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    # name shown for the repeating axis, e.g. "Rack", "Site", "Country"
    entity_label: Mapped[str] = mapped_column(String(100), default="Entity")
    # status thresholds (mirrors the Excel logic; configurable per project)
    due_soon_days: Mapped[int] = mapped_column(Integer, default=3)
    # financial tracker: the booking currency and up to two reporting currencies
    base_currency: Mapped[str] = mapped_column(String(10), default="HUF")
    reporting_currency_1: Mapped[str] = mapped_column(String(10), default="")
    reporting_currency_2: Mapped[str] = mapped_column(String(10), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task_definitions: Mapped[list["TaskDefinition"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="TaskDefinition.position",
    )
    entities: Mapped[list["Entity"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Entity.position",
    )
    financial_years: Mapped[list["FinancialYear"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="FinancialYear.year",
    )
    wbs_categories: Mapped[list["WbsCategory"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="WbsCategory.position",
    )


class TaskDefinition(Base):
    """A repeating task in the template (the 'PlnDateRecalc' equivalent)."""

    __tablename__ = "task_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    responsible: Mapped[str] = mapped_column(String(150), default="")
    # days relative to go-live. Positive = days BEFORE go-live, negative = after.
    offset_days: Mapped[int] = mapped_column(Integer, default=0)
    # if true, this task has no hard deadline (never flagged overdue/due-soon)
    no_deadline: Mapped[bool] = mapped_column(Boolean, default=False)
    # marks the task that represents "go-live" (one per project); used by reports
    is_golive: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped["Project"] = relationship(back_populates="task_definitions")
    instances: Mapped[list["TaskInstance"]] = relationship(
        back_populates="task_definition", cascade="all, delete-orphan"
    )


class Entity(Base):
    """An entity the tasks repeat over (a rack, site, country, anything)."""

    __tablename__ = "entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    code: Mapped[str] = mapped_column(String(100), default="")
    name: Mapped[str] = mapped_column(String(300), default="")
    location: Mapped[str] = mapped_column(String(500), default="")  # GPS / address / link
    golive_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    next_step: Mapped[str] = mapped_column(String(500), default="")
    next_step_due: Mapped[Date | None] = mapped_column(Date, nullable=True)
    on_hold: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    contact_name: Mapped[str] = mapped_column(String(200), default="")
    contact_phone: Mapped[str] = mapped_column(String(100), default="")
    contact_email: Mapped[str] = mapped_column(String(200), default="")

    project: Mapped["Project"] = relationship(back_populates="entities")
    instances: Mapped[list["TaskInstance"]] = relationship(
        back_populates="entity", cascade="all, delete-orphan"
    )
    inventory: Mapped[list["InventoryItem"]] = relationship(
        back_populates="entity",
        cascade="all, delete-orphan",
        order_by="InventoryItem.position",
    )


class TaskInstance(Base):
    """One task for one entity. Planned date is computed from go-live + offset."""

    __tablename__ = "task_instances"
    __table_args__ = (
        UniqueConstraint("entity_id", "task_def_id", name="uq_entity_taskdef"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[int] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"), index=True
    )
    task_def_id: Mapped[int] = mapped_column(
        ForeignKey("task_definitions.id", ondelete="CASCADE"), index=True
    )
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    actual_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    comment: Mapped[str] = mapped_column(String(500), default="")
    next_step: Mapped[str] = mapped_column(String(500), default="")
    next_step_due: Mapped[Date | None] = mapped_column(Date, nullable=True)

    entity: Mapped["Entity"] = relationship(back_populates="instances")
    task_definition: Mapped["TaskDefinition"] = relationship(back_populates="instances")


class InventoryItem(Base):
    """Equipment row attached to an entity (old or new device)."""

    __tablename__ = "inventory_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_id: Mapped[int] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str] = mapped_column(String(20), default="new")  # "old" | "new"
    host: Mapped[str] = mapped_column(String(200), default="")
    ip_address: Mapped[str] = mapped_column(String(100), default="")
    model: Mapped[str] = mapped_column(String(150), default="")
    serial: Mapped[str] = mapped_column(String(150), default="")
    cmdb_ok: Mapped[bool] = mapped_column(Boolean, default=False)

    entity: Mapped["Entity"] = relationship(back_populates="inventory")


# ============================================================ financial tracker
class FinancialYear(Base):
    """A budget year for a project. Holds the manual FX rates for that year
    (how many base-currency units equal one unit of each reporting currency)."""

    __tablename__ = "financial_years"
    __table_args__ = (
        UniqueConstraint("project_id", "year", name="uq_project_year"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    # base-currency units per 1 unit of reporting currency (e.g. 405 HUF / EUR)
    rate_1: Mapped[float] = mapped_column(Double, default=0.0)
    rate_2: Mapped[float] = mapped_column(Double, default=0.0)
    # months >= this are Forecast, months below are Actual (1..13). 1 = all FC.
    forecast_from_month: Mapped[int] = mapped_column(Integer, default=1)

    project: Mapped["Project"] = relationship(back_populates="financial_years")
    wbs_legs: Mapped[list["WbsLeg"]] = relationship(
        back_populates="year_ref",
        cascade="all, delete-orphan",
        order_by="WbsLeg.position",
    )


class WbsLeg(Base):
    """A SAP WBS element ('leg') inside a budget year. Budget items hang off it."""

    __tablename__ = "wbs_legs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year_id: Mapped[int] = mapped_column(
        ForeignKey("financial_years.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    code: Mapped[str] = mapped_column(String(120), default="")  # SAP WBS code
    name: Mapped[str] = mapped_column(String(300), default="")
    # Internal CAPEX | External CAPEX Tangible | External CAPEX Intangible | External OPEX
    category: Mapped[str] = mapped_column(String(60), default="")

    year_ref: Mapped["FinancialYear"] = relationship(back_populates="wbs_legs")
    items: Mapped[list["BudgetItem"]] = relationship(
        back_populates="leg",
        cascade="all, delete-orphan",
        order_by="BudgetItem.position",
    )
    change_requests: Mapped[list["ChangeRequest"]] = relationship(
        back_populates="leg",
        cascade="all, delete-orphan",
        order_by="ChangeRequest.position",
    )


class WbsCategory(Base):
    """A WBS category label defined at project setup (e.g. Internal CAPEX).
    WBS legs reference one of these by name."""

    __tablename__ = "wbs_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(120), default="")

    project: Mapped["Project"] = relationship(back_populates="wbs_categories")


class BudgetItem(Base):
    """A budget line inside a WBS leg. Values are entered per month (see
    BudgetMonth); the yearly Budget/Actual/Forecast aggregates are computed from
    them. 'fixed' items store a base-currency amount per month; 'manday' items
    store a manday count per month, multiplied by the item's single daily_rate."""

    __tablename__ = "budget_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    leg_id: Mapped[int] = mapped_column(
        ForeignKey("wbs_legs.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(400), default="")
    item_type: Mapped[str] = mapped_column(String(20), default="fixed")  # fixed | manday
    # daily rate (base currency) for manday-type items
    daily_rate: Mapped[float] = mapped_column(Double, default=0.0)
    # marks a hardware (HW) line, used to scope future reports
    is_hw: Mapped[bool] = mapped_column(Boolean, default=False)
    # change-request rows live in the same table, flagged and kinded
    is_cr: Mapped[bool] = mapped_column(Boolean, default=False)
    cr_kind: Mapped[str] = mapped_column(String(30), default="")  # carry_over|reallocation|cancelation|cr
    # for a Budget Reallocation: the paired reallocation item on the other leg.
    # Editing a month mirrors the negated value into the partner's same month.
    partner_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("budget_items.id", ondelete="SET NULL"), nullable=True
    )

    leg: Mapped["WbsLeg"] = relationship(back_populates="items")
    months: Mapped[list["BudgetMonth"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="BudgetMonth.month",
    )


class BudgetMonth(Base):
    """One month of a budget item. For 'fixed' items the values are amounts in
    base currency; for 'manday' items they are manday counts (amount = value *
    item.daily_rate). 'realized_value' shows as Actual or Forecast depending on
    the year's forecast_from_month cutoff."""

    __tablename__ = "budget_months"
    __table_args__ = (
        UniqueConstraint("item_id", "month", name="uq_item_month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("budget_items.id", ondelete="CASCADE"), index=True
    )
    month: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..12
    budget_value: Mapped[float] = mapped_column(Double, default=0.0)
    realized_value: Mapped[float] = mapped_column(Double, default=0.0)
    # for forecast months: whether the PO is out / committed (obligó) in SAP
    po_committed: Mapped[bool] = mapped_column(Boolean, default=False)
    po_number: Mapped[str] = mapped_column(String(60), default="")

    item: Mapped["BudgetItem"] = relationship(back_populates="months")


class ChangeRequest(Base):
    """A budget adjustment on a WBS leg (carry over, reallocation, cancelation,
    CR). Amount is in base currency and may be negative."""

    __tablename__ = "change_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    leg_id: Mapped[int] = mapped_column(
        ForeignKey("wbs_legs.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    # carry_over | reallocation | cancelation | cr
    kind: Mapped[str] = mapped_column(String(30), default="cr")
    label: Mapped[str] = mapped_column(String(300), default="")
    amount: Mapped[float] = mapped_column(Float, default=0.0)

    leg: Mapped["WbsLeg"] = relationship(back_populates="change_requests")
