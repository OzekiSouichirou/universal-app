"""Polonix v0.9.7 - フィードバックルート"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from models.database import get_db, rows_to_list
from response import E, err, ok
from routes.users import get_current_user, require_admin

router = APIRouter()

_VALID_TYPES  = frozenset(["idea", "bug", "request", "other"])
_VALID_STATUS = frozenset(["open", "in_progress", "done"])


class FeedbackCreate(BaseModel):
    type:         str
    title:        str
    content:      str
    is_anonymous: bool = False


class StatusUpdate(BaseModel):
    status: str


@router.post("/")
def submit_feedback(body: FeedbackCreate, db=Depends(get_db), current_user=Depends(get_current_user)):
    if body.type not in _VALID_TYPES:
        err(E.VALIDATION, "無効な種別です")
    if not body.title.strip():
        err(E.VALIDATION, "タイトルを入力してください")
    if not body.content.strip():
        err(E.VALIDATION, "内容を入力してください")
    db.execute(text("""
        INSERT INTO feedback (username,type,title,content,is_anonymous)
        VALUES (:u,:t,:ti,:c,:a)
    """), {"u": current_user.username, "t": body.type,
           "ti": body.title.strip(), "c": body.content.strip(), "a": body.is_anonymous})
    return ok({"message": "送信しました"})


@router.get("/my")
def get_my_feedback(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(text("""
        SELECT id,type,title,content,is_anonymous,status,created_at
        FROM feedback WHERE username=:u ORDER BY created_at DESC
    """), {"u": current_user.username}).fetchall()
    return ok(rows_to_list(rows))


@router.get("/all")
def get_all_feedback(db=Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(text("""
        SELECT id,username,type,title,content,is_anonymous,status,created_at
        FROM feedback ORDER BY created_at DESC
    """)).fetchall()
    return ok(rows_to_list(rows))


@router.patch("/{fb_id}/status")
def update_status(fb_id: int, body: StatusUpdate, db=Depends(get_db), _=Depends(require_admin)):
    if body.status not in _VALID_STATUS:
        err(E.VALIDATION, "無効なステータスです")
    db.execute(text("UPDATE feedback SET status=:s WHERE id=:id"), {"s": body.status, "id": fb_id})
    return ok({"message": "ステータスを更新しました"})


@router.delete("/{fb_id}")
def delete_feedback(fb_id: int, db=Depends(get_db), _=Depends(require_admin)):
    db.execute(text("DELETE FROM feedback WHERE id=:id"), {"id": fb_id})
    return ok({"message": "削除しました"})
