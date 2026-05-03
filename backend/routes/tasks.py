"""Polonix v0.9.7 - 課題管理ルート"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from models.database import get_db, row_to_dict, rows_to_list
from response import E, err, ok
from routes.users import get_current_user

router = APIRouter()

_VALID_PRIORITY = frozenset(["high", "medium", "low"])
_VALID_STATUS   = frozenset(["pending", "in_progress", "done"])


class TaskBody(BaseModel):
    title:    str
    subject:  Optional[str] = None
    due_date: str
    priority: str            = "medium"
    memo:     Optional[str] = None


class StatusBody(BaseModel):
    status: str


@router.get("/")
def get_tasks(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(
        text("SELECT id,title,subject,due_date,priority,status,memo FROM tasks WHERE username=:u ORDER BY due_date ASC"),
        {"u": current_user.username},
    ).fetchall()
    return ok(rows_to_list(rows))


@router.post("/")
def add_task(body: TaskBody, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not body.title.strip():
        err(E.VALIDATION, "タイトルを入力してください")
    if body.priority not in _VALID_PRIORITY:
        err(E.VALIDATION, "優先度が不正です")
    row = db.execute(text("""
        INSERT INTO tasks (username,title,subject,due_date,priority,memo)
        VALUES (:u,:t,:s,:d,:p,:m)
        RETURNING id,title,subject,due_date,priority,status,memo
    """), {"u": current_user.username, "t": body.title.strip(),
           "s": body.subject, "d": body.due_date, "p": body.priority, "m": body.memo}).fetchone()
    return ok(row_to_dict(row))


@router.patch("/{task_id}")
def update_task(task_id: int, body: TaskBody, db=Depends(get_db), current_user=Depends(get_current_user)):
    if body.priority not in _VALID_PRIORITY:
        err(E.VALIDATION, "優先度が不正です")
    row = db.execute(text("""
        UPDATE tasks SET title=:t, subject=:s, due_date=:d, priority=:p, memo=:m
        WHERE id=:id AND username=:u
        RETURNING id,title,subject,due_date,priority,status,memo
    """), {"id": task_id, "u": current_user.username, "t": body.title.strip(),
           "s": body.subject, "d": body.due_date, "p": body.priority, "m": body.memo}).fetchone()
    if not row:
        err(E.NOT_FOUND, "課題が見つかりません", 404)
    return ok(row_to_dict(row))


@router.patch("/{task_id}/status")
def update_status(task_id: int, body: StatusBody, db=Depends(get_db), current_user=Depends(get_current_user)):
    if body.status not in _VALID_STATUS:
        err(E.VALIDATION, "ステータスが不正です")
    row = db.execute(text("""
        UPDATE tasks SET status=:st
        WHERE id=:id AND username=:u
        RETURNING id,title,subject,due_date,priority,status,memo
    """), {"st": body.status, "id": task_id, "u": current_user.username}).fetchone()
    if not row:
        err(E.NOT_FOUND, "課題が見つかりません", 404)
    return ok(row_to_dict(row))


@router.delete("/{task_id}")
def delete_task(task_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    db.execute(
        text("DELETE FROM tasks WHERE id=:id AND username=:u"),
        {"id": task_id, "u": current_user.username},
    )
    return ok({"message": "削除しました"})
