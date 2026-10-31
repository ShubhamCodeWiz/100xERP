"""Tenure calculations and date formatting."""
from datetime import date, datetime


def parse_date(value: str | None) -> date:
    if not value:
        return date.today()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except Exception:
        try:
            return date.fromisoformat(value[:10])
        except Exception:
            return date.today()


def fmt_date(d: date) -> str:
    return d.strftime("%d %B %Y")


def span_text(start: date, end: date) -> str:
    days = (end - start).days
    if days < 0:
        return "0 days"
    months = days // 30
    rem_days = days % 30
    parts = []
    if months > 0:
        parts.append(f"{months} month{'s' if months != 1 else ''}")
    if rem_days > 0 or not parts:
        parts.append(f"{rem_days} day{'s' if rem_days != 1 else ''}")
    return ", ".join(parts)


def completion(tasks: list) -> dict:
    total = len(tasks)
    done = sum(1 for t in tasks if t.get("status") == "completed")
    return {
        "tasks_total": total,
        "tasks_completed": done,
        "completion_rate": f"{(done / total * 100):.0f}%" if total > 0 else "N/A",
    }

