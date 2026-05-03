"""Polonix v0.9.7 - ログルート"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from models.database import get_db, rows_to_list
from response import ok
from routes.users import require_admin

router = APIRouter()


@router.get("/")
def get_logs(
    limit: int = Query(200, ge=1, le=500),
    db=Depends(get_db),
    _=Depends(require_admin),
):
    rows = db.execute(
        text("SELECT id,username,action,detail,created_at FROM logs ORDER BY created_at DESC LIMIT :limit"),
        {"limit": limit},
    ).fetchall()
    return ok(rows_to_list(rows))
