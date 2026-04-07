"""Polonix v0.9.4 - ブックマークルート"""
import os, sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends
from sqlalchemy import text
from models.database import get_db, rows_to_list
from routes.users import get_current_user
from response import ok, err, E

router = APIRouter()

@router.get("/")
def get_bookmarks(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(text("""
        SELECT b.id, b.post_id, b.created_at,
               p.content, p.username, p.image, p.created_at AS post_created_at
        FROM bookmarks b
        JOIN posts p ON p.id = b.post_id
        WHERE b.username=:u ORDER BY b.created_at DESC
    """), {"u": current_user.username}).fetchall()
    return ok(rows_to_list(rows))

@router.post("/{post_id}")
def add_bookmark(post_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    existing = db.execute(
        text("SELECT id FROM bookmarks WHERE username=:u AND post_id=:p"),
        {"u": current_user.username, "p": post_id}
    ).fetchone()
    if existing: err(E.DUPLICATE, "既にブックマーク済みです")
    db.execute(
        text("INSERT INTO bookmarks (username,post_id) VALUES (:u,:p)"),
        {"u": current_user.username, "p": post_id}
    )
    return ok({"message": "ブックマークしました"})

@router.delete("/{post_id}")
def remove_bookmark(post_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    db.execute(
        text("DELETE FROM bookmarks WHERE username=:u AND post_id=:p"),
        {"u": current_user.username, "p": post_id}
    )
    return ok({"message": "ブックマーク解除しました"})
