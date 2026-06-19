"""Financial tracker computations.

All raw amounts are stored in the project's base currency. Reporting currencies
are derived by dividing by the year's manual FX rate (base units per 1 unit of
the reporting currency, e.g. 405 HUF / EUR -> EUR = HUF / 405).
"""
from app import models, schemas


def _money(base: float, rate_1: float, rate_2: float) -> schemas.Money:
    return schemas.Money(
        base=base,
        rep1=(base / rate_1) if rate_1 else None,
        rep2=(base / rate_2) if rate_2 else None,
    )


def _column_total(item: models.BudgetItem, which: str) -> float:
    """Base-currency total for 'budget' | 'actual' | 'forecast'."""
    if item.item_type == "manday":
        manday = getattr(item, f"{which}_manday") or 0.0
        rate = getattr(item, f"{which}_rate") or 0.0
        return manday * rate
    return getattr(item, f"{which}_amount") or 0.0


def compute_item(item: models.BudgetItem, r1: float, r2: float) -> schemas.BudgetItemComputed:
    budget = _column_total(item, "budget")
    actual = _column_total(item, "actual")
    forecast = _column_total(item, "forecast")
    total = actual + forecast
    return schemas.BudgetItemComputed(
        id=item.id,
        name=item.name,
        responsible=item.responsible,
        item_type=item.item_type,
        position=item.position,
        budget_amount=item.budget_amount,
        actual_amount=item.actual_amount,
        forecast_amount=item.forecast_amount,
        budget_manday=item.budget_manday,
        budget_rate=item.budget_rate,
        actual_manday=item.actual_manday,
        actual_rate=item.actual_rate,
        forecast_manday=item.forecast_manday,
        forecast_rate=item.forecast_rate,
        budget=_money(budget, r1, r2),
        actual=_money(actual, r1, r2),
        forecast=_money(forecast, r1, r2),
        total=_money(total, r1, r2),
    )


def compute_leg(leg: models.WbsLeg, r1: float, r2: float) -> schemas.WbsLegComputed:
    items = [compute_item(it, r1, r2) for it in leg.items]
    budget_total = sum(it.budget.base for it in items)
    actual_total = sum(it.actual.base for it in items)
    forecast_total = sum(it.forecast.base for it in items)
    total = actual_total + forecast_total

    crs = [
        schemas.ChangeRequestComputed(
            id=cr.id,
            kind=cr.kind,
            label=cr.label,
            position=cr.position,
            amount=_money(cr.amount or 0.0, r1, r2),
        )
        for cr in leg.change_requests
    ]
    cr_total = sum(cr.amount.base for cr in crs)

    return schemas.WbsLegComputed(
        id=leg.id,
        code=leg.code,
        name=leg.name,
        category=leg.category,
        position=leg.position,
        items=items,
        change_requests=crs,
        budget_total=_money(budget_total, r1, r2),
        actual_total=_money(actual_total, r1, r2),
        forecast_total=_money(forecast_total, r1, r2),
        total=_money(total, r1, r2),
        cr_total=_money(cr_total, r1, r2),
        total_with_crs=_money(budget_total + cr_total, r1, r2),
    )


def compute_year_view(
    project: models.Project, year: models.FinancialYear
) -> schemas.FinanceYearView:
    r1 = year.rate_1 or 0.0
    r2 = year.rate_2 or 0.0
    legs = [compute_leg(leg, r1, r2) for leg in year.wbs_legs]

    budget_total = sum(lg.budget_total.base for lg in legs)
    actual_total = sum(lg.actual_total.base for lg in legs)
    forecast_total = sum(lg.forecast_total.base for lg in legs)
    total = actual_total + forecast_total
    cr_total = sum(lg.cr_total.base for lg in legs)

    return schemas.FinanceYearView(
        project=schemas.ProjectOut.model_validate(project),
        year=schemas.FinancialYearOut.model_validate(year),
        legs=legs,
        budget_total=_money(budget_total, r1, r2),
        actual_total=_money(actual_total, r1, r2),
        forecast_total=_money(forecast_total, r1, r2),
        total=_money(total, r1, r2),
        cr_total=_money(cr_total, r1, r2),
        total_with_crs=_money(budget_total + cr_total, r1, r2),
    )
