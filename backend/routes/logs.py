"""Polonix v0.9.0 - ログルート（生SQL統一）"""
import os, sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends
from sqlalchemy import text
from models.database import get_db, rows_to_list
from routes.users import require_admin
from response import ok

router = APIRouter()

@router.get("/")
def get_logs(db=Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(
        text("SELECT id,username,action,detail,created_at FROM logs ORDER BY created_at DESC LIMIT 200")
    ).fetchall()
    return ok(rows_to_list(rows))
