from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
from models.database import get_db, CalendarEvent, UserXP, Log
from routes.users import get_current_user
from models.database import User

router = APIRouter()

XP_TABLE = {
    "create_event": 10,
    "complete_event": 30,
    "complete_exam": 50,
    "daily_login": 5,
}

LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000]

def calc_level(xp: int) -> int:
    for i in range(len(LEVEL_THRESHOLDS) - 1, -1, -1):
        if xp >= LEVEL_THRESHOLDS[i]:
            return i + 1
    return 1

def add_xp(db: Session, username: str, amount: int):
    xp_row = db.query(UserXP).filter(UserXP.username == username).first()
    if not xp_row:
        xp_row = UserXP(username=username, xp=0, level=1, streak=0)
        db.add(xp_row)
    xp_row.xp += amount
    xp_row.level = calc_level(xp_row.xp)
    xp_row.updated_at = datetime.utcnow()
    db.commit()
    return xp_row

class EventCreate(BaseModel):
    title: str
    memo: Optional[str] = None
    date: str
    type: str = "memo"

class EventUpdate(BaseModel):
    title: str
    memo: Optional[str] = None
    date: str
    type: str
    is_done: bool

@router.get("/events")
def get_events(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    events = db.query(CalendarEvent).filter(
        CalendarEvent.username == current_user.username
    ).order_by(CalendarEvent.date.asc()).all()
    return [{
        "id": e.id, "title": e.title, "memo": e.memo,
        "date": e.date, "type": e.type, "is_done": e.is_done
    } for e in events]

@router.post("/events")
def create_event(body: EventCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = CalendarEvent(
        username=current_user.username,
        title=body.title, memo=body.memo,
        date=body.date, type=body.type
    )
    db.add(event)
    xp_row = add_xp(db, current_user.username, XP_TABLE["create_event"])
    db.commit()
    db.refresh(event)
    return {
        "id": event.id, "title": event.title, "memo": event.memo,
        "date": event.date, "type": event.type, "is_done": event.is_done,
        "xp_gained": XP_TABLE["create_event"], "total_xp": xp_row.xp, "level": xp_row.level
    }

@router.patch("/events/{event_id}")
def update_event(event_id: int, body: EventUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id, CalendarEvent.username == current_user.username
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="イベントが見つかりません")
    xp_gained = 0
    if not event.is_done and body.is_done:
        amount = XP_TABLE["complete_exam"] if event.type == "exam" else XP_TABLE["complete_event"]
        xp_row = add_xp(db, current_user.username, amount)
        xp_gained = amount
    event.title = body.title
    event.memo = body.memo
    event.date = body.date
    event.type = body.type
    event.is_done = body.is_done
    db.commit()
    xp_row = db.query(UserXP).filter(UserXP.username == current_user.username).first()
    return {
        "id": event.id, "title": event.title, "memo": event.memo,
        "date": event.date, "type": event.type, "is_done": event.is_done,
        "xp_gained": xp_gained,
        "total_xp": xp_row.xp if xp_row else 0,
        "level": xp_row.level if xp_row else 1
    }

@router.delete("/events/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id, CalendarEvent.username == current_user.username
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="イベントが見つかりません")
    db.delete(event)
    db.commit()
    return {"message": "削除しました"}

@router.get("/xp")
def get_xp(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    xp_row = db.query(UserXP).filter(UserXP.username == current_user.username).first()
    if not xp_row:
        xp_row = UserXP(username=current_user.username, xp=0, level=1, streak=0)
        db.add(xp_row)
        db.commit()
    today = date.today().isoformat()
    xp_gained = 0
    if xp_row.last_login != today:
        if xp_row.last_login:
            from datetime import date as d, timedelta
            yesterday = (d.today() - timedelta(days=1)).isoformat()
            xp_row.streak = xp_row.streak + 1 if xp_row.last_login == yesterday else 1
        else:
            xp_row.streak = 1
        xp_row.last_login = today
        xp_row.xp += XP_TABLE["daily_login"]
        xp_row.level = calc_level(xp_row.xp)
        xp_gained = XP_TABLE["daily_login"]
        db.commit()
    next_level_xp = LEVEL_THRESHOLDS[min(xp_row.level, len(LEVEL_THRESHOLDS) - 1)]
    current_level_xp = LEVEL_THRESHOLDS[xp_row.level - 1]
    return {
        "xp": xp_row.xp, "level": xp_row.level,
        "streak": xp_row.streak,
        "xp_gained_today": xp_gained,
        "current_level_xp": current_level_xp,
        "next_level_xp": next_level_xp
    }
