"""Polonix v0.9.0 - 時間割ルート（生SQL統一）"""
import os, sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from database import get_db, rows_to_list
from users import get_current_user
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

@router.get("/")
def get_timetable(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(
        text("SELECT id,day,period,subject,room,teacher,memo,color FROM timetable WHERE username=:u"),
        {"u": current_user.username}
    ).fetchall()
    return ok(rows_to_list(rows))

@router.put("/")
def upsert_timetable(body: TimetableEntry, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not body.subject.strip():
        err(E.VALIDATION, "科目名を入力してください")
    db.execute(text("""
        INSERT INTO timetable (username,day,period,subject,room,teacher,memo,color)
        VALUES (:u,:d,:p,:s,:r,:t,:m,:c)
        ON CONFLICT (username,day,period) DO UPDATE
        SET subject=:s, room=:r, teacher=:t, memo=:m, color=:c
    """), {"u": current_user.username, "d": body.day, "p": body.period,
           "s": body.subject.strip(), "r": body.room, "t": body.teacher,
           "m": body.memo, "c": body.color})
    return ok({"message": "保存しました"})

@router.delete("/")
def delete_slot(day: int, period: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    db.execute(
        text("DELETE FROM timetable WHERE username=:u AND day=:d AND period=:p"),
        {"u": current_user.username, "d": day, "p": period}
    )
    return ok({"message": "削除しました"})
