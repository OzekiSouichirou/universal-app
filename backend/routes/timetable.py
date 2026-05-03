"""Polonix v0.9.7 - 時間割ルート"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from models.database import get_db, row_to_dict, rows_to_list
from response import E, err, ok
from routes.users import get_current_user

router = APIRouter()


class TimetableEntry(BaseModel):
    day:        int
    period:     int
    subject:    str
    room:       Optional[str] = None
    teacher:    Optional[str] = None
    memo:       Optional[str] = None
    color:      str           = "#5b6ef5"
    start_time: Optional[str] = None


@router.get("/")
def get_timetable(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(
        text("SELECT id,day,period,subject,room,teacher,memo,color,start_time FROM timetable WHERE username=:u ORDER BY day,period"),
        {"u": current_user.username},
    ).fetchall()
    return ok(rows_to_list(rows))


@router.post("/")
@router.put("/")
def upsert_timetable(body: TimetableEntry, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not body.subject.strip():
        err(E.VALIDATION, "科目名を入力してください")
    if not (0 <= body.day <= 6):
        err(E.VALIDATION, "無効な曜日です（0=月〜6=日）")
    if not (1 <= body.period <= 10):
        err(E.VALIDATION, "無効な時限です（1〜10）")
    row = db.execute(text("""
        INSERT INTO timetable (username,day,period,subject,room,teacher,memo,color,start_time)
        VALUES (:u,:d,:p,:s,:r,:t,:m,:c,:st)
        ON CONFLICT (username,day,period) DO UPDATE
        SET subject=:s, room=:r, teacher=:t, memo=:m, color=:c, start_time=:st
        RETURNING id,day,period,subject,room,teacher,memo,color,start_time
    """), {
        "u": current_user.username, "d": body.day,     "p": body.period,
        "s": body.subject.strip(),  "r": body.room,    "t": body.teacher,
        "m": body.memo,             "c": body.color,   "st": body.start_time,
    }).fetchone()
    return ok(row_to_dict(row))


@router.delete("/{entry_id}")
def delete_slot(entry_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    db.execute(
        text("DELETE FROM timetable WHERE id=:id AND username=:u"),
        {"id": entry_id, "u": current_user.username},
    )
    return ok({"message": "削除しました"})
