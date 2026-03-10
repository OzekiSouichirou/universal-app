import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, Notice, Log
from routes.users import get_current_user, require_admin
from models.database import User

router = APIRouter()

class NoticeCreate(BaseModel):
    title: str
    content: str

class NoticeUpdate(BaseModel):
    title: str
    content: str
    is_active: bool

@router.get("/")
def get_notices(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notices = db.query(Notice).filter(Notice.is_active == True).order_by(Notice.created_at.desc()).all()
    return [{"id": n.id, "title": n.title, "content": n.content, "created_at": n.created_at} for n in notices]

@router.get("/all")
def get_all_notices(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    notices = db.query(Notice).order_by(Notice.created_at.desc()).all()
    return [{"id": n.id, "title": n.title, "content": n.content, "is_active": n.is_active, "created_at": n.created_at} for n in notices]

@router.post("/")
def create_notice(body: NoticeCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    notice = Notice(title=body.title, content=body.content)
    db.add(notice)
    db.add(Log(username=admin.username, action="お知らせ追加", detail=body.title))
    db.commit()
    return {"message": "お知らせを作成しました"}

@router.patch("/{notice_id}")
def update_notice(notice_id: int, body: NoticeUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="お知らせが見つかりません")
    notice.title = body.title
    notice.content = body.content
    notice.is_active = body.is_active
    db.add(Log(username=admin.username, action="お知らせ更新", detail=body.title))
    db.commit()
    return {"message": "お知らせを更新しました"}

@router.delete("/{notice_id}")
def delete_notice(notice_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    notice = db.query(Notice).filter(Notice.id == notice_id).first()
    if not notice:
        raise HTTPException(status_code=404, detail="お知らせが見つかりません")
    db.add(Log(username=admin.username, action="お知らせ削除", detail=notice.title))
    db.delete(notice)
    db.commit()
    return {"message": "お知らせを削除しました"}