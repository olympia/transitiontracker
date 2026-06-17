"""SQLAlchemy ORM models."""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
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
    on_hold: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")

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
