"""Polonix v0.9.7 - 成績管理ルート"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from models.database import get_db, row_to_dict, rows_to_list
from response import E, err, ok
from routes.users import get_current_user

router = APIRouter()

_VALID_GRADE_TYPES = frozenset(["exam", "quiz", "report", "practice", "other"])


class GradeBody(BaseModel):
    subject:    str
    score:      float
    max_score:  float        = 100
    grade_type: str          = "exam"
    memo:       Optional[str] = None
    date:       str


@router.get("/")
def get_grades(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(
        text("SELECT id,subject,score,max_score,grade_type,memo,date FROM grades WHERE username=:u ORDER BY date DESC"),
        {"u": current_user.username},
    ).fetchall()
    return ok(rows_to_list(rows))


@router.post("/")
def add_grade(body: GradeBody, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not body.subject.strip():
        err(E.VALIDATION, "科目名を入力してください")
    if not (0 <= body.score <= body.max_score):
        err(E.VALIDATION, "点数が不正です")
    if body.grade_type not in _VALID_GRADE_TYPES:
        err(E.VALIDATION, "無効な種別です")
    row = db.execute(text("""
        INSERT INTO grades (username,subject,score,max_score,grade_type,memo,date)
        VALUES (:u,:s,:sc,:ms,:gt,:m,:d)
        RETURNING id,subject,score,max_score,grade_type,memo,date
    """), {"u": current_user.username, "s": body.subject.strip(),
           "sc": body.score, "ms": body.max_score, "gt": body.grade_type,
           "m": body.memo, "d": body.date}).fetchone()
    return ok(row_to_dict(row))


@router.patch("/{grade_id}")
def update_grade(grade_id: int, body: GradeBody, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not (0 <= body.score <= body.max_score):
        err(E.VALIDATION, "点数が不正です")
    row = db.execute(text("""
        UPDATE grades
        SET subject=:s, score=:sc, max_score=:ms, grade_type=:gt, memo=:m, date=:d
        WHERE id=:id AND username=:u
        RETURNING id,subject,score,max_score,grade_type,memo,date
    """), {"id": grade_id, "u": current_user.username, "s": body.subject.strip(),
           "sc": body.score, "ms": body.max_score, "gt": body.grade_type,
           "m": body.memo, "d": body.date}).fetchone()
    if not row:
        err(E.NOT_FOUND, "記録が見つかりません", 404)
    return ok(row_to_dict(row))


@router.delete("/{grade_id}")
def delete_grade(grade_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    db.execute(
        text("DELETE FROM grades WHERE id=:id AND username=:u"),
        {"id": grade_id, "u": current_user.username},
    )
    return ok({"message": "削除しました"})
