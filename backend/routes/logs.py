import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from models.database import get_db, Log
from routes.users import require_admin
from models.database import User

router = APIRouter()

@router.get("/")
def get_logs(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    logs = db.query(Log).order_by(Log.created_at.desc()).limit(200).all()
    return [
        {
            "id": l.id,
            "username": l.username,
            "action": l.action,
            "detail": l.detail,
            "created_at": l.created_at
        } for l in logs
    ]