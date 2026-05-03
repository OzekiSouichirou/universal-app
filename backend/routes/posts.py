"""Polonix v0.9.7 - 投稿ルート"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import text

from models.database import get_db, row_to_dict, rows_to_list
from response import E, err, ok
from routes.users import get_current_user
from security import RATE, check_rate_limit, validate_post_content

router = APIRouter()
logger = logging.getLogger("polonix.posts")

_POST_RELATED = frozenset(["likes", "comments", "notifications"])

_VALID_TAGS = frozenset([
    "数学", "英語", "国語", "理科", "社会", "物理", "化学", "生物",
    "歴史", "地理", "情報", "体育", "音楽", "美術", "その他",
])


class PostCreate(BaseModel):
    content: str
    image:   Optional[str] = None
    tag:     Optional[str] = None


class CommentCreate(BaseModel):
    content: str


# ================================================================
# 投稿
# ================================================================
@router.get("/")
def get_posts(
    q:     Optional[str] = Query(None),
    limit: int           = Query(50, ge=1, le=100),
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    base = """
        SELECT p.id, p.username, p.content, p.image, p.tag, p.created_at,
               u.avatar, u.selected_title, u.selected_title_a, u.selected_title_b,
               COUNT(DISTINCT l.id)                                  AS likes,
               MAX(CASE WHEN l.username=:me THEN 1 ELSE 0 END)      AS liked,
               COUNT(DISTINCT c.id)                                  AS comment_count
        FROM posts p
        LEFT JOIN users    u ON u.username = p.username
        LEFT JOIN likes    l ON l.post_id  = p.id
        LEFT JOIN comments c ON c.post_id  = p.id
        {where}
        GROUP BY p.id, u.avatar, u.selected_title, u.selected_title_a, u.selected_title_b
        ORDER BY p.created_at DESC
        LIMIT :limit
    """
    params: dict = {"me": current_user.username, "limit": limit}
    if q and q.strip():
        params["kw"] = f"%{q.strip()}%"
        rows = db.execute(text(base.format(where="WHERE p.content ILIKE :kw")), params).fetchall()
    else:
        rows = db.execute(text(base.format(where="")), params).fetchall()

    result = []
    for r in rows:
        d = row_to_dict(r)
        d["liked"]   = bool(d.get("liked", 0))
        d["title"]   = d.pop("selected_title",   "") or ""
        d["title_a"] = d.pop("selected_title_a", "") or ""
        d["title_b"] = d.pop("selected_title_b", "") or ""
        result.append(d)
    return ok(result)


@router.post("/")
def create_post(
    body: PostCreate,
    request: Request,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    check_rate_limit(f"post:{current_user.username}", *RATE["post"])
    content = validate_post_content(body.content)

    tag: Optional[str] = None
    if body.tag and body.tag.strip():
        tag = body.tag.strip()

    if body.image:
        if not body.image.startswith("data:image/"):
            err(E.INVALID_INPUT, "無効な画像データです")
        if len(body.image) > 1_500_000:
            err(E.INVALID_INPUT, "画像サイズが大きすぎます（上限約1MB）")

    row = db.execute(
        text("INSERT INTO posts (username,content,image,tag) VALUES (:u,:c,:i,:t) RETURNING id"),
        {"u": current_user.username, "c": content, "i": body.image, "t": tag},
    ).fetchone()
    return ok({"id": row.id, "message": "投稿しました"})


@router.delete("/{post_id}")
def delete_post(post_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    row = db.execute(text("SELECT username FROM posts WHERE id=:id"), {"id": post_id}).fetchone()
    if not row:
        err(E.NOT_FOUND, "投稿が見つかりません", 404)
    if row.username != current_user.username and current_user.role != "admin":
        err(E.FORBIDDEN, "削除権限がありません", 403)
    for tbl in _POST_RELATED:
        db.execute(text(f"DELETE FROM {tbl} WHERE post_id=:id"), {"id": post_id})
    db.execute(text("DELETE FROM posts WHERE id=:id"), {"id": post_id})
    return ok({"message": "投稿を削除しました"})


# ================================================================
# いいね
# ================================================================
@router.post("/{post_id}/like")
def toggle_like(post_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    check_rate_limit(f"like:{current_user.username}", *RATE["like"])
    existing = db.execute(
        text("SELECT id FROM likes WHERE post_id=:p AND username=:u"),
        {"p": post_id, "u": current_user.username},
    ).fetchone()

    if existing:
        db.execute(text("DELETE FROM likes WHERE post_id=:p AND username=:u"),
                   {"p": post_id, "u": current_user.username})
        liked = False
    else:
        db.execute(
            text("INSERT INTO likes (post_id,username) VALUES (:p,:u) ON CONFLICT DO NOTHING"),
            {"p": post_id, "u": current_user.username},
        )
        post = db.execute(text("SELECT username FROM posts WHERE id=:id"), {"id": post_id}).fetchone()
        if post and post.username != current_user.username:
            db.execute(text("""
                INSERT INTO notifications (username,type,post_id,from_username)
                VALUES (:u,'like',:p,:f)
            """), {"u": post.username, "p": post_id, "f": current_user.username})
        liked = True

    count = db.execute(
        text("SELECT COUNT(*) AS c FROM likes WHERE post_id=:p"), {"p": post_id}
    ).fetchone().c
    return ok({"liked": liked, "likes": int(count)})


# ================================================================
# コメント
# ================================================================
@router.get("/{post_id}/comments")
def get_comments(post_id: int, db=Depends(get_db), _=Depends(get_current_user)):
    rows = db.execute(text("""
        SELECT c.id, c.username, c.content, c.created_at,
               u.selected_title, u.selected_title_a
        FROM comments c
        LEFT JOIN users u ON u.username = c.username
        WHERE c.post_id = :p
        ORDER BY c.created_at ASC
    """), {"p": post_id}).fetchall()
    result = []
    for r in rows:
        d = row_to_dict(r)
        d["title"]   = d.pop("selected_title",   "") or ""
        d["title_a"] = d.pop("selected_title_a", "") or ""
        result.append(d)
    return ok(result)


@router.post("/{post_id}/comments")
def add_comment(
    post_id: int,
    body: CommentCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    check_rate_limit(f"comment:{current_user.username}", *RATE["comment"])
    if not body.content or not body.content.strip():
        err(E.VALIDATION, "コメント内容を入力してください")
    if len(body.content) > 200:
        err(E.VALIDATION, "コメントは200文字以内にしてください")
    db.execute(
        text("INSERT INTO comments (post_id,username,content) VALUES (:p,:u,:c)"),
        {"p": post_id, "u": current_user.username, "c": body.content.strip()},
    )
    post = db.execute(text("SELECT username FROM posts WHERE id=:id"), {"id": post_id}).fetchone()
    if post and post.username != current_user.username:
        db.execute(text("""
            INSERT INTO notifications (username,type,post_id,from_username)
            VALUES (:u,'comment',:p,:f)
        """), {"u": post.username, "p": post_id, "f": current_user.username})
    return ok({"message": "コメントを投稿しました"})


@router.delete("/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: int,
    comment_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = db.execute(
        text("SELECT username FROM comments WHERE id=:id AND post_id=:p"),
        {"id": comment_id, "p": post_id},
    ).fetchone()
    if not row:
        err(E.NOT_FOUND, "コメントが見つかりません", 404)
    if row.username != current_user.username and current_user.role != "admin":
        err(E.FORBIDDEN, "削除権限がありません", 403)
    db.execute(text("DELETE FROM comments WHERE id=:id"), {"id": comment_id})
    return ok({"message": "コメントを削除しました"})


# ================================================================
# 通知
# ================================================================
@router.get("/notifications/list")
def get_notifications(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(text("""
        SELECT id, type, post_id, from_username, is_read, created_at
        FROM notifications WHERE username=:u
        ORDER BY created_at DESC LIMIT 30
    """), {"u": current_user.username}).fetchall()
    return ok(rows_to_list(rows))


@router.patch("/notifications/read-all")
def mark_all_read(db=Depends(get_db), current_user=Depends(get_current_user)):
    db.execute(
        text("UPDATE notifications SET is_read=true WHERE username=:u"),
        {"u": current_user.username},
    )
    return ok({"message": "既読にしました"})
