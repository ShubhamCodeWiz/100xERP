"""Request models. Messages here are shown to the user in the error overlay."""
import re
from datetime import date
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, StringConstraints, field_validator

from config import ADMIN_ID

_USER_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

Role = Literal["executive", "employee", "intern"]
TaskStatus = Literal["pending", "in_progress", "completed"]

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Department = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]
Email = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
Password = Annotated[str, StringConstraints(min_length=6, max_length=128)]

TaskTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
TaskDetails = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
TaskRemarks = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
DueDate = Annotated[str, StringConstraints(strip_whitespace=True, max_length=10)]


def _check_email(value):
    if value and not _EMAIL_RE.match(value):
        raise ValueError("Enter a valid email address.")
    return value


def _check_due_date(value):
    if not value:
        return value
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise ValueError("Enter the due date as YYYY-MM-DD.")


class LoginRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class UserCreate(BaseModel):
    user_id: str
    name: Name
    email: Email = ""
    role: Role
    department: Department = ""
    description: Description = ""   # only kept for executives and employees
    password: Password

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, value: str) -> str:
        value = value.strip().lower()
        if value == ADMIN_ID:
            raise ValueError("This User ID is reserved.")
        if not _USER_ID_RE.match(value):
            raise ValueError(
                "User ID must be 3-32 characters (letters, numbers, dot, dash, underscore) "
                "and start with a letter or number."
            )
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value):
        return _check_email(value)


class UserUpdate(BaseModel):
    """`role` may be sent by anyone but is only applied for the admin (panel.py
    rejects everyone else); each change is written to the promotion history."""
    name: Optional[Name] = None
    email: Optional[Email] = None
    department: Optional[Department] = None
    description: Optional[Description] = None
    password: Optional[Password] = None
    role: Optional[Role] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value):
        return _check_email(value)


class TaskCreate(BaseModel):
    title: TaskTitle
    details: TaskDetails = ""
    due_date: DueDate = ""
    status: TaskStatus = "pending"
    remarks: TaskRemarks = ""

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, value):
        return _check_due_date(value)


class TaskUpdate(BaseModel):
    title: Optional[TaskTitle] = None
    details: Optional[TaskDetails] = None
    due_date: Optional[DueDate] = None
    status: Optional[TaskStatus] = None
    remarks: Optional[TaskRemarks] = None

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, value):
        return _check_due_date(value)
