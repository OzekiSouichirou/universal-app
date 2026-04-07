"""Polonix v0.9.4 - 時間割ルート"""
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

class TimetableEntry(BaseModel):
    day: int
    period: int
    subject: str
    room: Optional[str] = None
    teacher: Optional[str] = None
    memo: Optional[str] = None
    color: str = "#5b6ef5"
    start_time: Optional[str] = None  # 例: "09:00"

@router.get("/")
def get_timetable(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(
        text("SELECT id,day,period,subject,room,teacher,memo,color,start_time FROM timetable WHERE username=:u ORDER BY day,period"),
        {"u": current_user.username}
    ).fetchall()
    return ok(rows_to_list(rows))

@router.post("/")
@router.put("/")
def upsert_timetable(body: TimetableEntry, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not body.subject.strip():
        err(E.VALIDATION, "科目名を入力してください")
    if not (0 <= body.day <= 6):
        err(E.VALIDATION, "無効な曜日です")
    if not (1 <= body.period <= 8):
        err(E.VALIDATION, "無効な時限です")
    row = db.execute(text("""
        INSERT INTO timetable (username,day,period,subject,room,teacher,memo,color,start_time)
        VALUES (:u,:d,:p,:s,:r,:t,:m,:c,:st)
        ON CONFLICT (username,day,period) DO UPDATE
        SET subject=:s, room=:r, teacher=:t, memo=:m, color=:c, start_time=:st
        RETURNING id,day,period,subject,room,teacher,memo,color,start_time
    """), {"u": current_user.username, "d": body.day, "p": body.period,
           "s": body.subject.strip(), "r": body.room, "t": body.teacher,
           "m": body.memo, "c": body.color, "st": body.start_time}).fetchone()
    return ok(row_to_dict(row))

@router.delete("/{entry_id}")
def delete_slot(entry_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    db.execute(
        text("DELETE FROM timetable WHERE id=:id AND username=:u"),
        {"id": entry_id, "u": current_user.username}
    )
    return ok({"message": "削除しました"})
