"""
Polonix v0.9.0 - 投稿ルート
- 生SQL統一
- APIレスポンス統一
- レート制限
- 投稿検索追加
"""
import os, sys, logging
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional

from models.database import get_db, row_to_dict, rows_to_list
from routes.users import get_current_user
from response import ok, err, E
from security import check_rate_limit, RATE, validate_post_content

router = APIRouter()
logger = logging.getLogger("polonix.posts")

class PostCreate(BaseModel):
    content: str
    image: Optional[str] = None

class CommentCreate(BaseModel):
    content: str

@router.get("/")
def get_posts(
    q: Optional[str] = Query(None, description="検索キーワード"),
    limit: int = Query(100, le=100),
    db=Depends(get_db),
    current_user=Depends(get_current_user)
):
    if q and q.strip():
        keyword = f"%{q.strip()}%"
        rows = db.execute(text("""
            SELECT p.id, p.username, p.content, p.image, p.created_at,
                   u.avatar, u.selected_title, u.selected_title_a, u.selected_title_b,
                   COUNT(DISTINCT l.id) AS likes,
                   MAX(CASE WHEN l.username=:me THEN 1 ELSE 0 END) AS liked,
                   COUNT(DISTINCT c.id) AS comment_count
            FROM posts p
            LEFT JOIN users u ON u.username = p.username
            LEFT JOIN likes l ON l.post_id = p.id
            LEFT JOIN comments c ON c.post_id = p.id
            WHERE p.content ILIKE :kw
            GROUP BY p.id, u.avatar, u.selected_title, u.selected_title_a, u.selected_title_b
            ORDER BY p.created_at DESC
            LIMIT :limit
        """), {"me": current_user.username, "kw": keyword, "limit": limit}).fetchall()
    else:
        rows = db.execute(text("""
            SELECT p.id, p.username, p.content, p.image, p.created_at,
                   u.avatar, u.selected_title, u.selected_title_a, u.selected_title_b,
                   COUNT(DISTINCT l.id) AS likes,
                   MAX(CASE WHEN l.username=:me THEN 1 ELSE 0 END) AS liked,
                   COUNT(DISTINCT c.id) AS comment_count
            FROM posts p
            LEFT JOIN users u ON u.username = p.username
            LEFT JOIN likes l ON l.post_id = p.id
            LEFT JOIN comments c ON c.post_id = p.id
            GROUP BY p.id, u.avatar, u.selected_title, u.selected_title_a, u.selected_title_b
            ORDER BY p.created_at DESC
            LIMIT :limit
        """), {"me": current_user.username, "limit": limit}).fetchall()

    result = []
    for r in rows:
        d = row_to_dict(r)
        d["liked"] = bool(d.get("liked", 0))
        d["title"] = d.pop("selected_title", "") or ""
        d["title_a"] = d.pop("selected_title_a", "") or ""
        d["title_b"] = d.pop("selected_title_b", "") or ""
        result.append(d)
    return ok(result)

@router.post("/")
def create_post(body: PostCreate, request: Request, db=Depends(get_db), current_user=Depends(get_current_user)):
    check_rate_limit(f"post:{current_user.username}", *RATE["post"])
    content = validate_post_content(body.content)
    if body.image:
        if not body.image.startswith("data:image/"):
            err(E.INVALID_INPUT, "無効な画像データです")
        if len(body.image) > 1.5 * 1024 * 1024:
            err(E.INVALID_INPUT, "画像サイズが大きすぎます")
    row = db.execute(
        text("INSERT INTO posts (username,content,image) VALUES (:u,:c,:i) RETURNING id"),
        {"u": current_user.username, "c": content, "i": body.image}
    ).fetchone()
    return ok({"id": row.id, "message": "投稿しました"})

@router.delete("/{post_id}")
def delete_post(post_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    row = db.execute(
        text("SELECT username FROM posts WHERE id=:id"), {"id": post_id}
    ).fetchone()
    if not row:
        err(E.NOT_FOUND, "投稿が見つかりません", 404)
    if row.username != current_user.username and current_user.role != "admin":
        err(E.FORBIDDEN, "削除権限がありません", 403)
    for table in ["likes", "comments", "notifications"]:
        db.execute(text(f"DELETE FROM {table} WHERE post_id=:id"), {"id": post_id})
    db.execute(text("DELETE FROM posts WHERE id=:id"), {"id": post_id})
    return ok({"message": "投稿を削除しました"})

@router.post("/{post_id}/like")
def toggle_like(post_id: int, db=Depends(get_db), current_user=Depends(get_current_user)):
    existing = db.execute(
        text("SELECT id FROM likes WHERE post_id=:p AND username=:u"),
        {"p": post_id, "u": current_user.username}
    ).fetchone()
    if existing:
        db.execute(text("DELETE FROM likes WHERE post_id=:p AND username=:u"),
                   {"p": post_id, "u": current_user.username})
        liked = False
    else:
        db.execute(
            text("INSERT INTO likes (post_id,username) VALUES (:p,:u) ON CONFLICT DO NOTHING"),
            {"p": post_id, "u": current_user.username}
        )
        # 投稿者への通知
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
    return ok({"liked": liked, "likes": count})

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
        d["title"] = d.pop("selected_title", "") or ""
        d["title_a"] = d.pop("selected_title_a", "") or ""
        result.append(d)
    return ok(result)

@router.post("/{post_id}/comments")
def add_comment(post_id: int, body: CommentCreate, db=Depends(get_db), current_user=Depends(get_current_user)):
    if not body.content or not body.content.strip():
        err(E.VALIDATION, "コメント内容を入力してください")
    if len(body.content) > 300:
        err(E.VALIDATION, "コメントは300文字以内にしてください")
    db.execute(
        text("INSERT INTO comments (post_id,username,content) VALUES (:p,:u,:c)"),
        {"p": post_id, "u": current_user.username, "c": body.content.strip()}
    )
    post = db.execute(text("SELECT username FROM posts WHERE id=:id"), {"id": post_id}).fetchone()
    if post and post.username != current_user.username:
        db.execute(text("""
            INSERT INTO notifications (username,type,post_id,from_username)
            VALUES (:u,'comment',:p,:f)
        """), {"u": post.username, "p": post_id, "f": current_user.username})
    return ok({"message": "コメントを投稿しました"})

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
        {"u": current_user.username}
    )
    return ok({"message": "既読にしました"})
