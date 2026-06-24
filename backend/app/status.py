"""RAG status logic, mirroring the original Excel tracker.

Per task (entity x task definition):
  - done            -> "done"     (green)   actual filled / marked done
  - planned <= today-1 & not done -> "overdue"  (red)
  - planned <= today + due_soon_days & not done -> "duesoon" (amber)
  - planned in the further future -> "future" (grey)
  - no go-live date, or task has no deadline -> "none" (blank)

Per entity (overall) = the status of its go-live milestone task (go-live-centric):
  - on hold        -> "onhold"  (blue, overrides everything)
  - no go-live     -> "none"
  - go-live done   -> "completed" (green)
  - go-live overdue -> "delayed"  (red)
  - go-live duesoon -> "duesoon"  (orange)
  - go-live future  -> "ontrack"  (grey: scheduled, nothing pressing)
Per-task signals live in the task-level cells/chips, not the entity roll-up.
If no go-live task is defined, fall back to the worst status among all tasks
("none" tasks are ignored in that fallback).
"""
from datetime import date, timedelta


def planned_date(golive: date | None, offset_days: int) -> date | None:
    if golive is None:
        return None
    return golive - timedelta(days=offset_days)


def task_status(
    golive: date | None,
    offset_days: int,
    no_deadline: bool,
    done: bool,
    actual_date,
    due_soon_days: int,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    is_done = bool(done or actual_date)
    # no-deadline tasks never get a calculated deadline date
    planned = None if no_deadline else planned_date(golive, offset_days)

    if is_done:
        status = "done"
    elif golive is None or no_deadline or planned is None:
        status = "none"
    elif planned <= today - timedelta(days=1):
        status = "overdue"
    elif planned <= today + timedelta(days=due_soon_days):
        status = "duesoon"
    else:
        status = "future"

    return {
        "status": status,
        "planned_date": planned.isoformat() if planned else None,
        "actual_date": actual_date.isoformat() if actual_date else None,
        "done": is_done,
    }


def overall_status(
    on_hold: bool,
    golive: date | None,
    cell_statuses: list[str],
    golive_status: str | None = None,
) -> str:
    if on_hold:
        return "onhold"
    if golive is None:
        return "none"
    # Go-live-centric: the entity's overall status follows its go-live
    # milestone task. Per-task signals live in the task-level cells/chips.
    if golive_status is not None:
        return {
            "done": "completed",
            "overdue": "delayed",
            "duesoon": "duesoon",
            "future": "ontrack",
            "none": "none",
        }.get(golive_status, "none")
    # Fallback (no go-live task defined): worst status among all tasks.
    countable = [s for s in cell_statuses if s != "none"]
    if "overdue" in countable:
        return "delayed"
    if "duesoon" in countable:
        return "duesoon"
    if "future" in countable:
        return "ontrack"
    if "done" in countable:
        return "completed"
    return "none"
