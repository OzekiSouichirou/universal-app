"""Polonix v0.9.7 - 統計ルート"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import text

from models.database import get_db, rows_to_list
from response import ok
from routes.users import get_current_user, require_admin

router = APIRouter()


def _date_range(days: int) -> list[str]:
    """今日から遡って days 日分の日付リスト（古い順）を返す。"""
    today = date.today()
    return [(today - timedelta(days=i)).strftime("%m/%d") for i in range(days - 1, -1, -1)]


def _date_range_iso(days: int) -> list[str]:
    today = date.today()
    return [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]


# ================================================================
# 管理者統計
# ================================================================
@router.get("/admin")
def get_admin_stats(db=Depends(get_db), _=Depends(require_admin)):
    # 基本カウント（1クエリ）
    stats = db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM users)           AS total_users,
            (SELECT COUNT(*) FROM users WHERE role='admin') AS admin_count,
            (SELECT COUNT(*) FROM posts)            AS total_posts,
            (SELECT COUNT(*) FROM comments)         AS total_comments,
            (SELECT COUNT(*) FROM likes)            AS total_likes
    """)).fetchone()

    # 過去7日投稿推移（1クエリ）
    trend_rows = db.execute(text("""
        SELECT TO_CHAR(DATE(created_at), 'MM/DD') AS d, COUNT(*) AS c
        FROM posts
        WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(created_at)
    """)).fetchall()
    trend_map  = {r.d: int(r.c) for r in trend_rows}
    post_trend = [{"date": d, "count": trend_map.get(d, 0)} for d in _date_range(7)]

    # XPランキング上位5（1クエリ）
    xp_rows = db.execute(text("""
        SELECT u.username, COALESCE(x.xp,0) AS xp, COALESCE(x.level,1) AS level
        FROM users u
        LEFT JOIN user_xp x ON x.username = u.username
        WHERE u.role != 'admin'
        ORDER BY COALESCE(x.xp,0) DESC
        LIMIT 5
    """)).fetchall()
    xp_ranking = [{"username": r.username, "xp": int(r.xp), "level": int(r.level)} for r in xp_rows]

    # 時間帯別投稿数（1クエリ）
    hourly_rows = db.execute(text("""
        SELECT EXTRACT(HOUR FROM created_at) AS hour, COUNT(*) AS count
        FROM posts GROUP BY hour ORDER BY hour
    """)).fetchall()
    hourly_posts = [{"hour": int(r.hour), "count": int(r.count)} for r in hourly_rows if r.hour is not None]

    # 過去30日アクティビティ（1クエリ）
    act_rows = db.execute(text("""
        SELECT TO_CHAR(DATE(created_at), 'MM/DD') AS d, COUNT(DISTINCT username) AS c
        FROM logs
        WHERE action LIKE '%ログイン%'
          AND created_at >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY DATE(created_at)
    """)).fetchall()
    act_map  = {r.d: int(r.c) for r in act_rows}
    activity = [{"date": d, "count": act_map.get(d, 0)} for d in _date_range(30)]

    # 成績・課題統計（2クエリ、エラー時は0）
    try:
        g = db.execute(text(
            "SELECT COUNT(*) AS total, AVG(score/max_score*100) AS avg_pct FROM grades"
        )).fetchone()
        total_grades = int(g.total or 0)
        grade_avg    = round(float(g.avg_pct or 0), 1)
    except Exception:
        total_grades, grade_avg = 0, 0.0

    try:
        t = db.execute(text("""
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN due_date < CURRENT_DATE AND status!='done' THEN 1 ELSE 0 END) AS overdue
            FROM tasks
        """)).fetchone()
        total_tasks   = int(t.total or 0)
        done_tasks    = int(t.done  or 0)
        overdue_tasks = int(t.overdue or 0)
    except Exception:
        total_tasks = done_tasks = overdue_tasks = 0

    return ok({
        "total_users":    int(stats.total_users),
        "admin_count":    int(stats.admin_count),
        "total_posts":    int(stats.total_posts),
        "total_comments": int(stats.total_comments),
        "total_likes":    int(stats.total_likes),
        "post_trend":     post_trend,
        "xp_ranking":     xp_ranking,
        "hourly_posts":   hourly_posts,
        "activity":       activity,
        "grade_avg_pct":  grade_avg,
        "total_grades":   total_grades,
        "total_tasks":    total_tasks,
        "done_tasks":     done_tasks,
        "overdue_tasks":  overdue_tasks,
    })


# ================================================================
# 個人統計
# ================================================================
@router.get("/me")
def get_me_stats(db=Depends(get_db), current_user=Depends(get_current_user)):
    u = current_user.username

    # 投稿数・いいね・コメント（1クエリ）
    me_stats = db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM posts WHERE username=:u) AS my_posts,
            (SELECT COUNT(*) FROM likes l JOIN posts p ON l.post_id=p.id WHERE p.username=:u) AS my_likes,
            (SELECT COUNT(*) FROM comments WHERE username=:u) AS my_comments
    """), {"u": u}).fetchone()

    # XP（1クエリ）
    xp_row = db.execute(
        text("SELECT xp, level, streak FROM user_xp WHERE username=:u"), {"u": u}
    ).fetchone()

    # 過去7日投稿推移（1クエリ）
    trend_rows = db.execute(text("""
        SELECT TO_CHAR(DATE(created_at), 'MM/DD') AS d, COUNT(*) AS c
        FROM posts
        WHERE username=:u AND created_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(created_at)
    """), {"u": u}).fetchall()
    trend_map  = {r.d: int(r.c) for r in trend_rows}
    post_trend = [{"date": d, "count": trend_map.get(d, 0)} for d in _date_range(7)]

    # 過去30日個人アクティビティ（1クエリ）
    act_rows = db.execute(text("""
        SELECT TO_CHAR(DATE(created_at), 'MM/DD') AS d, COUNT(*) AS c
        FROM logs
        WHERE username=:u AND created_at >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY DATE(created_at)
    """), {"u": u}).fetchall()
    act_map  = {r.d: int(r.c) for r in act_rows}
    activity = [{"date": d, "count": act_map.get(d, 0)} for d in _date_range(30)]

    # 成績・課題数（2クエリ、エラー時は0）
    try:
        my_grades = int(db.execute(
            text("SELECT COUNT(*) AS c FROM grades WHERE username=:u"), {"u": u}
        ).fetchone().c or 0)
    except Exception:
        my_grades = 0

    try:
        my_tasks = int(db.execute(
            text("SELECT COUNT(*) AS c FROM tasks WHERE username=:u AND status!='done'"), {"u": u}
        ).fetchone().c or 0)
    except Exception:
        my_tasks = 0

    return ok({
        "my_posts":    int(me_stats.my_posts    or 0),
        "my_likes":    int(me_stats.my_likes    or 0),
        "my_comments": int(me_stats.my_comments or 0),
        "xp":          xp_row.xp     if xp_row else 0,
        "level":       xp_row.level  if xp_row else 1,
        "streak":      xp_row.streak if xp_row else 0,
        "post_trend":  post_trend,
        "activity":    activity,
        "my_grades":   my_grades,
        "my_tasks":    my_tasks,
    })
