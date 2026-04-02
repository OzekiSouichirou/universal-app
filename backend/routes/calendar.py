"""Polonix v0.9.2 - カレンダールート"""
import os, sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from models.database import get_db, rows_to_list
from routes.users import get_current_user, calc_level
from response import ok, err, E

router = APIRouter()

XP_MAP = {"create_event":10, "complete_event":30, "complete_exam":50, "daily_login":5}

# カレンダーイベントで更新可能なカラムのホワイトリスト
_EVENT_UPDATABLE = frozenset(["title", "memo", "date", "type", "is_done"])

class EventCreate(BaseModel):
    title: str
    memo: Optional[str] = None
    date: str
    type: str = "memo"

class EventUpdate(BaseModel):
    title: Optional[str] = None
    memo: Optional[str] = None
    date: Optional[str] = None
    type: Optional[str] = None
    is_done: Optional[bool] = None

def _add_xp(db, username: str, amount: int):
    xp_row = db.execute(text("SELECT xp FROM user_xp WHERE username=:u"), {"u": username}).fetchone()
    current = xp_row.xp if xp_row else 0
    new_xp = current + amount
    new_lv = calc_level(new_xp)
    db.execute(text("""
        INSERT INTO user_xp (username,xp,level) VALUES (:u,:xp,:lv)
        ON CONFLICT (username) DO UPDATE SET xp=:xp, level=:lv
    """), {"u": username, "xp": new_xp, "lv": new_lv})
    return new_xp, new_lv

@router.get("/")
def get_events(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(
        text("SELECT id,username,title,memo,date,type,is_done,created_at FROM calendar_events WHERE username=:u ORDER BY date"),
        {"u": current_user.username}
    ).fetchall()
    return ok(rows_to_list(rows))

@router.post("/")
def create_event(body: EventCreate, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not body.title.strip():
        err(E.VALIDATION, "タイトルを入力してください")
    if body.type not in ("memo","schedule","exam","deadline","event"):
        err(E.VALIDATION, "無効なイベント種別です")
    row = db.execute(
        text("INSERT INTO calendar_events (username,title,memo,date,type) VALUES (:u,:t,:m,:d,:ty) RETURNING id,title,memo,date,type,is_done"),
        {"u": current_user.username, "t": body.title.strip(),
         "m": body.memo, "d": body.date, "ty": body.type}
    ).fetchone()
    new_xp, new_lv = _add_xp(db, current_user.username, XP_MAP["create_event"])
    return ok({
        "id": row.id, "title": row.title, "memo": row.memo,
        "date": row.date, "type": row.type, "is_done": row.is_done,
        "xp_gained": XP_MAP["create_event"], "new_xp": new_xp, "new_level": new_lv
    })

@router.patch("/{event_id}")
def update_event(event_id: int, body: EventUpdate, db=Depends(get_db), current_user=Depends(get_current_user)):
    row = db.execute(
        text("SELECT username, type, is_done FROM calendar_events WHERE id=:id"), {"id": event_id}
    ).fetchone()
    if not row:
        err(E.NOT_FOUND, "イベントが見つかりません", 404)
    if row.username != current_user.username:
        err(E.FORBIDDEN, "権限がありません", 403)

    updates = {}
    if body.title   is not None: updates["title"]   = body.title.strip()
    if body.memo    is not None: updates["memo"]    = body.memo
    if body.date    is not None: updates["date"]    = body.date
    if body.type    is not None: updates["type"]    = body.type
    if body.is_done is not None: updates["is_done"] = body.is_done

    xp_gained = 0
    new_xp = new_lv = None

    if updates:
        # ホワイトリスト検証
        for key in updates:
            if key not in _EVENT_UPDATABLE:
                err(E.INVALID_INPUT, f"不正なフィールド: {key}")
        set_clause = ", ".join(f"{k}=:{k}" for k in updates)
        updates["id"] = event_id
        db.execute(text(f"UPDATE calendar_events SET {set_clause} WHERE id=:id"), updates)

        # is_done=True になった場合にXP付与
        if body.is_done is True and not row.is_done:
            xp_key = "complete_exam" if row.type == "exam" else "complete_event"
            new_xp, new_lv = _add_xp(db, current_user.username, XP_MAP[xp_key])
            xp_gained = XP_MAP[xp_key]

    updated = db.execute(
        text("SELECT id,title,memo,date,type,is_done FROM calendar_events WHERE id=:id"),
        {"id": event_id}
    ).fetchone()
    return ok({
        "id": updated.id, "title": updated.title, "memo": updated.memo,
        "date": updated.date, "type": updated.type, "is_done": updated.is_done,
        "xp_gained": xp_gained, "total_xp": new_xp, "level": new_lv,
    })

@router.delete("/{event_id}")
def delete_event(event_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    row = db.execute(
        text("SELECT username FROM calendar_events WHERE id=:id"), {"id": event_id}
    ).fetchone()
    if not row:
        err(E.NOT_FOUND, "イベントが見つかりません", 404)
    if row.username != current_user.username:
        err(E.FORBIDDEN, "権限がありません", 403)
    db.execute(text("DELETE FROM calendar_events WHERE id=:id"), {"id": event_id})
    return ok({"message": "削除しました"})

@router.get("/xp")
def get_xp(db=Depends(get_db), current_user=Depends(get_current_user)):
    from datetime import date
    row = db.execute(
        text("SELECT xp, level, streak, last_login FROM user_xp WHERE username=:u"),
        {"u": current_user.username}
    ).fetchone()
    xp     = row.xp     if row else 0
    lv     = row.level  if row else 1
    streak = row.streak if row else 0
    THRESHOLDS = [0,100,250,450,700,1000,1400,1900,2500,3200,4000]
    cur_lv_xp  = THRESHOLDS[min(lv-1, len(THRESHOLDS)-1)]
    next_lv_xp = THRESHOLDS[min(lv,   len(THRESHOLDS)-1)] if lv < len(THRESHOLDS) else xp

    today = date.today().isoformat()
    bonus = 0
    if not row or row.last_login != today:
        new_xp     = xp + XP_MAP["daily_login"]
        new_lv     = calc_level(new_xp)
        new_streak = (streak + 1) if (row and row.last_login) else 1
        db.execute(text("""
            INSERT INTO user_xp (username,xp,level,streak,last_login)
            VALUES (:u,:xp,:lv,:s,:d)
            ON CONFLICT (username) DO UPDATE SET xp=:xp, level=:lv, streak=:s, last_login=:d
        """), {"u": current_user.username, "xp": new_xp, "lv": new_lv,
               "s": new_streak, "d": today})
        xp, lv, streak, bonus = new_xp, new_lv, new_streak, XP_MAP["daily_login"]

    return ok({"xp": xp, "level": lv, "streak": streak,
               "current_level_xp": cur_lv_xp, "next_level_xp": next_lv_xp,
               "xp_gained_today": bonus})
