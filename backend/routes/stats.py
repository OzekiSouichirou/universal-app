"""Polonix v0.9.0 - 統計ルート（生SQL統一）"""
import os, sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends
from sqlalchemy import text
from datetime import date, timedelta
from database import get_db, rows_to_list
from users import get_current_user, require_admin
from response import ok

router = APIRouter()

@router.get("/admin")
def get_admin_stats(db=Depends(get_db), _=Depends(require_admin)):
    r = db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM users) AS total_users,
            (SELECT COUNT(*) FROM users WHERE role='admin') AS admin_count,
            (SELECT COUNT(*) FROM posts) AS total_posts,
            (SELECT COUNT(*) FROM comments) AS total_comments,
            (SELECT COUNT(*) FROM likes) AS total_likes
    """)).fetchone()
    trend = []
    for i in range(6, -1, -1):
        d = date.today() - timedelta(days=i)
        count = db.execute(
            text("SELECT COUNT(*) AS c FROM posts WHERE DATE(created_at)=:d"), {"d": d}
        ).fetchone().c
        trend.append({"date": d.strftime("%m/%d"), "count": count})
    return ok({"total_users": r.total_users, "admin_count": r.admin_count,
               "total_posts": r.total_posts, "total_comments": r.total_comments,
               "total_likes": r.total_likes, "post_trend": trend})

@router.get("/me")
def get_me_stats(db=Depends(get_db), current_user=Depends(get_current_user)):
    r = db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM posts WHERE username=:u) AS my_posts,
            (SELECT COUNT(*) FROM likes l JOIN posts p ON l.post_id=p.id WHERE p.username=:u) AS my_likes,
            (SELECT COUNT(*) FROM comments WHERE username=:u) AS my_comments
    """), {"u": current_user.username}).fetchone()
    xp_row = db.execute(
        text("SELECT xp, level, streak FROM user_xp WHERE username=:u"),
        {"u": current_user.username}
    ).fetchone()
    trend = []
    for i in range(6, -1, -1):
        d = date.today() - timedelta(days=i)
        count = db.execute(
            text("SELECT COUNT(*) AS c FROM posts WHERE username=:u AND DATE(created_at)=:d"),
            {"u": current_user.username, "d": d}
        ).fetchone().c
        trend.append({"date": d.strftime("%m/%d"), "count": count})
    return ok({
        "my_posts":   r.my_posts,
        "my_likes":   r.my_likes,
        "my_comments":r.my_comments,
        "xp":         xp_row.xp if xp_row else 0,
        "level":      xp_row.level if xp_row else 1,
        "streak":     xp_row.streak if xp_row else 0,
        "post_trend": trend,
    })
