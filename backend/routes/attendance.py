"""Polonix v0.9.6 - 出席管理ルート"""
import os, sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from models.database import get_db, rows_to_list, row_to_dict
from routes.users import get_current_user
from response import ok, err, E

router = APIRouter()

class AttendanceBody(BaseModel):
    subject: str
    total_classes: int
    attended: int
    max_absences: int = 5

class AttendanceUpdate(BaseModel):
    delta: int  # +1 or -1

@router.get("/")
def get_attendance(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(
        text("SELECT id,subject,total_classes,attended,max_absences,updated_at FROM attendance WHERE username=:u ORDER BY subject"),
        {"u": current_user.username}
    ).fetchall()
    result = []
    for r in rows_to_list(rows):
        absences = r["total_classes"] - r["attended"]
        rate     = round(r["attended"] / r["total_classes"] * 100, 1) if r["total_classes"] > 0 else 100.0
        can_skip = max(0, r["max_absences"] - absences)
        r["absences"]      = absences
        r["attend_rate"]   = rate
        r["can_skip"]      = can_skip
        r["danger"]        = can_skip <= 1
        result.append(r)
    return ok(result)

@router.post("/")
def upsert_attendance(body: AttendanceBody, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not body.subject.strip(): err(E.VALIDATION, "科目名を入力してください")
    if body.attended > body.total_classes: err(E.VALIDATION, "出席数が授業数を超えています")
    row = db.execute(text("""
        INSERT INTO attendance (username,subject,total_classes,attended,max_absences,updated_at)
        VALUES (:u,:s,:t,:a,:m,NOW())
        ON CONFLICT (username,subject) DO UPDATE
        SET total_classes=:t, attended=:a, max_absences=:m, updated_at=NOW()
        RETURNING id,subject,total_classes,attended,max_absences
    """), {"u": current_user.username, "s": body.subject.strip(),
           "t": body.total_classes, "a": body.attended, "m": body.max_absences}).fetchone()
    return ok(row_to_dict(row))

@router.patch("/{att_id}/attend")
def record_attend(att_id: int, body: AttendanceUpdate, db=Depends(get_db), current_user=Depends(get_current_user)):
    """出席/欠席を+1/-1で記録"""
    row = db.execute(text("""
        UPDATE attendance
        SET total_classes = total_classes + 1,
            attended = attended + CASE WHEN :delta > 0 THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE id=:id AND username=:u
        RETURNING id,subject,total_classes,attended,max_absences
    """), {"id": att_id, "delta": body.delta, "u": current_user.username}).fetchone()
    if not row: err(E.NOT_FOUND, "記録が見つかりません", 404)
    return ok(row_to_dict(row))

@router.delete("/{att_id}")
def delete_attendance(att_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    db.execute(text("DELETE FROM attendance WHERE id=:id AND username=:u"),
               {"id": att_id, "u": current_user.username})
    return ok({"message": "削除しました"})
