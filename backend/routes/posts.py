from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from models.database import get_db, Post, Like, Log, Comment, Notification
from routes.users import get_current_user
from models.database import User

router = APIRouter()

class PostCreate(BaseModel):
    content: str
    image: Optional[str] = None

class CommentCreate(BaseModel):
    content: str

@router.get("/")
def get_posts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    posts = db.query(Post).order_by(Post.created_at.desc()).limit(100).all()
    # ユーザーの称号・アバターを一括取得
    usernames = list(set(p.username for p in posts))
    user_map = {u.username: u for u in db.query(User).filter(User.username.in_(usernames)).all()}
    result = []
    for post in posts:
        likes = db.query(Like).filter(Like.post_id == post.id).count()
        liked = db.query(Like).filter(Like.post_id == post.id, Like.username == current_user.username).first() is not None
        comment_count = db.query(Comment).filter(Comment.post_id == post.id).count()
        u = user_map.get(post.username)
        result.append({
            "id": post.id,
            "username": post.username,
            "title": getattr(u, "selected_title", None) or "" if u else "",
            "avatar": getattr(u, "avatar", None) if u else None,
            "content": post.content,
            "image": post.image,
            "created_at": post.created_at,
            "likes": likes,
            "liked": liked,
            "comment_count": comment_count
        })
    return result

@router.post("/")
def create_post(req: PostCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="内容を入力してください")
    if len(req.content) > 500:
        raise HTTPException(status_code=400, detail="500文字以内で入力してください")
    if req.image:
        if not req.image.startswith("data:image/"):
            raise HTTPException(status_code=400, detail="無効な画像データです")
        if len(req.image) > 800 * 1024:
            raise HTTPException(status_code=400, detail="画像サイズが大きすぎます")
    post = Post(username=current_user.username, content=req.content, image=req.image)
    db.add(post)
    db.add(Log(username=current_user.username, action="投稿作成"))
    db.commit()
    db.refresh(post)
    return {
        "id": post.id,
        "username": post.username,
        "content": post.content,
        "image": post.image,
        "created_at": post.created_at,
        "likes": 0,
        "liked": False,
        "comment_count": 0
    }

@router.delete("/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="投稿が見つかりません")
    if post.username != current_user.username and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="削除権限がありません")
    db.query(Like).filter(Like.post_id == post_id).delete()
    db.query(Comment).filter(Comment.post_id == post_id).delete()
    db.query(Notification).filter(Notification.post_id == post_id).delete()
    db.delete(post)
    db.add(Log(username=current_user.username, action="投稿削除", detail=f"post_id={post_id}"))
    db.commit()
    return {"message": "削除しました"}

@router.post("/{post_id}/like")
def toggle_like(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="投稿が見つかりません")
    existing = db.query(Like).filter(Like.post_id == post_id, Like.username == current_user.username).first()
    if existing:
        db.delete(existing)
        db.query(Notification).filter(
            Notification.post_id == post_id,
            Notification.from_username == current_user.username,
            Notification.type == "like"
        ).delete()
        db.commit()
        liked = False
    else:
        like = Like(post_id=post_id, username=current_user.username)
        db.add(like)
        if post.username != current_user.username:
            db.add(Notification(
                username=post.username,
                type="like",
                post_id=post_id,
                from_username=current_user.username
            ))
        db.commit()
        liked = True
    likes = db.query(Like).filter(Like.post_id == post_id).count()
    return {"liked": liked, "likes": likes}

@router.get("/{post_id}/comments")
def get_comments(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="投稿が見つかりません")
    comments = db.query(Comment).filter(Comment.post_id == post_id).order_by(Comment.created_at.asc()).all()
    comment_user_map = {u.username: u for u in db.query(User).filter(
        User.username.in_([c.username for c in comments])
    ).all()}
    return [{
        "id": c.id,
        "username": c.username,
        "title": getattr(comment_user_map.get(c.username), "selected_title", None) or "" if comment_user_map.get(c.username) else "",
        "content": c.content,
        "created_at": c.created_at
    } for c in comments]

@router.post("/{post_id}/comments")
def create_comment(post_id: int, req: CommentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="投稿が見つかりません")
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="内容を入力してください")
    if len(req.content) > 200:
        raise HTTPException(status_code=400, detail="200文字以内で入力してください")
    comment = Comment(post_id=post_id, username=current_user.username, content=req.content)
    db.add(comment)
    if post.username != current_user.username:
        db.add(Notification(
            username=post.username,
            type="comment",
            post_id=post_id,
            from_username=current_user.username
        ))
    db.commit()
    db.refresh(comment)
    return {"id": comment.id, "username": comment.username, "content": comment.content, "created_at": comment.created_at}

@router.delete("/{post_id}/comments/{comment_id}")
def delete_comment(post_id: int, comment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    comment = db.query(Comment).filter(Comment.id == comment_id, Comment.post_id == post_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="コメントが見つかりません")
    if comment.username != current_user.username and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="削除権限がありません")
    db.delete(comment)
    db.commit()
    return {"message": "削除しました"}

@router.get("/notifications/me")
def get_notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notifs = db.query(Notification).filter(
        Notification.username == current_user.username
    ).order_by(Notification.created_at.desc()).limit(30).all()
    return [{
        "id": n.id,
        "type": n.type,
        "post_id": n.post_id,
        "from_username": n.from_username,
        "is_read": n.is_read,
        "created_at": n.created_at
    } for n in notifs]

@router.post("/notifications/read")
def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(
        Notification.username == current_user.username,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "既読にしました"}
