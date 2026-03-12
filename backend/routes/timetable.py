from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from models.database import get_db, Timetable
from routes.users import get_current_user
from models.database import User

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
def get_timetable(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    entries = db.query(Timetable).filter(Timetable.username == current_user.username).all()
    return [{
        "id": e.id, "day": e.day, "period": e.period,
        "subject": e.subject, "room": e.room, "teacher": e.teacher,
        "memo": e.memo, "color": e.color
    } for e in entries]

@router.post("/")
def upsert_entry(body: TimetableEntry, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(Timetable).filter(
        Timetable.username == current_user.username,
        Timetable.day == body.day,
        Timetable.period == body.period
    ).first()
    if existing:
        existing.subject = body.subject
        existing.room = body.room
        existing.teacher = body.teacher
        existing.memo = body.memo
        existing.color = body.color
        db.commit()
        entry = existing
    else:
        entry = Timetable(
            username=current_user.username,
            day=body.day, period=body.period,
            subject=body.subject, room=body.room,
            teacher=body.teacher, memo=body.memo, color=body.color
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
    return {"id": entry.id, "day": entry.day, "period": entry.period,
            "subject": entry.subject, "room": entry.room, "teacher": entry.teacher,
            "memo": entry.memo, "color": entry.color}

@router.delete("/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    entry = db.query(Timetable).filter(
        Timetable.id == entry_id, Timetable.username == current_user.username
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="見つかりません")
    db.delete(entry)
    db.commit()
    return {"message": "削除しました"}
