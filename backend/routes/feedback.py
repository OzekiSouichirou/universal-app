from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from models.database import get_db, Feedback
from routes.users import get_current_user
from models.database import User

router = APIRouter()

class FeedbackCreate(BaseModel):
    type: str
    title: str
    content: str
    is_anonymous: bool = False

class FeedbackStatusUpdate(BaseModel):
    status: str

@router.get("/")
def get_feedbacks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="管理者のみ")
    items = db.query(Feedback).order_by(Feedback.created_at.desc()).all()
    return [{
        "id": f.id,
        "type": f.type,
        "title": f.title,
        "content": f.content,
        "username": f.username if not f.is_anonymous else "匿名",
        "is_anonymous": f.is_anonymous,
        "status": f.status,
        "created_at": f.created_at.isoformat()
    } for f in items]

@router.get("/mine")
def get_my_feedbacks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    items = db.query(Feedback).filter(
        Feedback.username == current_user.username
    ).order_by(Feedback.created_at.desc()).all()
    return [{
        "id": f.id,
        "type": f.type,
        "title": f.title,
        "content": f.content,
        "is_anonymous": f.is_anonymous,
        "status": f.status,
        "created_at": f.created_at.isoformat()
    } for f in items]

@router.post("/")
def create_feedback(body: FeedbackCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not body.title.strip() or not body.content.strip():
        raise HTTPException(status_code=400, detail="タイトルと内容を入力してください")
    if len(body.title) > 50:
        raise HTTPException(status_code=400, detail="タイトルは50文字以内")
    if len(body.content) > 500:
        raise HTTPException(status_code=400, detail="内容は500文字以内")
    f = Feedback(
        username=current_user.username,
        type=body.type,
        title=body.title,
        content=body.content,
        is_anonymous=body.is_anonymous,
        status="open"
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return {"id": f.id, "message": "送信しました"}

@router.patch("/{feedback_id}/status")
def update_status(feedback_id: int, body: FeedbackStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="管理者のみ")
    f = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="見つかりません")
    if body.status not in ["open", "in_progress", "done"]:
        raise HTTPException(status_code=400, detail="無効なステータス")
    f.status = body.status
    db.commit()
    return {"message": "更新しました"}

@router.delete("/{feedback_id}")
def delete_feedback(feedback_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    f = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="見つかりません")
    if current_user.role != "admin" and f.username != current_user.username:
        raise HTTPException(status_code=403, detail="権限がありません")
    db.delete(f)
    db.commit()
    return {"message": "削除しました"}
