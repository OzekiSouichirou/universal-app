"""Polonix v0.9.7 - お知らせルート"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from models.database import get_db, rows_to_list
from response import E, err, ok
from routes.users import get_current_user, require_admin

router = APIRouter()

_VALID_PRIORITY = frozenset(["normal", "important", "urgent"])


class NoticeBody(BaseModel):
    title:     str
    content:   str
    is_active: bool = True
    is_pinned: bool = False
    priority:  str  = "normal"


@router.get("/")
def get_notices(db=Depends(get_db), _=Depends(get_current_user)):
    rows = db.execute(text("""
        SELECT id,title,content,is_active,is_pinned,priority,created_at
        FROM notices
        WHERE is_active=true
        ORDER BY is_pinned DESC,
                 CASE priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
                 created_at DESC
    """)).fetchall()
    return ok(rows_to_list(rows))


@router.get("/all")
def get_all_notices(db=Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(text("""
        SELECT id,title,content,is_active,is_pinned,priority,created_at
        FROM notices ORDER BY is_pinned DESC, created_at DESC
    """)).fetchall()
    return ok(rows_to_list(rows))


@router.post("/")
def create_notice(body: NoticeBody, db=Depends(get_db), admin=Depends(require_admin)):
    if not body.title.strip():
        err(E.VALIDATION, "タイトルを入力してください")
    if body.priority not in _VALID_PRIORITY:
        err(E.VALIDATION, "無効な優先度です")
    db.execute(
        text("INSERT INTO notices (title,content,is_active,is_pinned,priority) VALUES (:t,:c,:a,:p,:pr)"),
        {"t": body.title.strip(), "c": body.content, "a": body.is_active,
         "p": body.is_pinned, "pr": body.priority},
    )
    db.execute(
        text("INSERT INTO logs (username,action) VALUES (:u,'お知らせ追加')"),
        {"u": admin.username},
    )
    return ok({"message": "お知らせを追加しました"})


@router.patch("/{notice_id}")
def update_notice(notice_id: int, body: NoticeBody, db=Depends(get_db), _=Depends(require_admin)):
    if body.priority not in _VALID_PRIORITY:
        err(E.VALIDATION, "無効な優先度です")
    db.execute(text("""
        UPDATE notices
        SET title=:t, content=:c, is_active=:a, is_pinned=:p, priority=:pr
        WHERE id=:id
    """), {"t": body.title, "c": body.content, "a": body.is_active,
           "p": body.is_pinned, "pr": body.priority, "id": notice_id})
    return ok({"message": "更新しました"})


@router.delete("/{notice_id}")
def delete_notice(notice_id: int, db=Depends(get_db), _=Depends(require_admin)):
    db.execute(text("DELETE FROM notices WHERE id=:id"), {"id": notice_id})
    return ok({"message": "削除しました"})
