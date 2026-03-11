from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, Post, Like, Log
from routes.users import get_current_user
from models.database import User

router = APIRouter()

class PostCreate(BaseModel):
    content: str

@router.get("/")
def get_posts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    posts = db.query(Post).order_by(Post.created_at.desc()).limit(100).all()
    result = []
    for post in posts:
        likes = db.query(Like).filter(Like.post_id == post.id).count()
        liked = db.query(Like).filter(Like.post_id == post.id, Like.username == current_user.username).first() is not None
        result.append({
            "id": post.id,
            "username": post.username,
            "content": post.content,
            "created_at": post.created_at,
            "likes": likes,
            "liked": liked
        })
    return result

@router.post("/")
def create_post(req: PostCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="内容を入力してください")
    if len(req.content) > 500:
        raise HTTPException(status_code=400, detail="500文字以内で入力してください")
    post = Post(username=current_user.username, content=req.content)
    db.add(post)
    db.add(Log(username=current_user.username, action="投稿作成"))
    db.commit()
    db.refresh(post)
    likes = 0
    liked = False
    return {
        "id": post.id,
        "username": post.username,
        "content": post.content,
        "created_at": post.created_at,
        "likes": likes,
        "liked": liked
    }

@router.delete("/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="投稿が見つかりません")
    if post.username != current_user.username and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="削除権限がありません")
    db.query(Like).filter(Like.post_id == post_id).delete()
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
        db.commit()
        liked = False
    else:
        like = Like(post_id=post_id, username=current_user.username)
        db.add(like)
        db.commit()
        liked = True
    likes = db.query(Like).filter(Like.post_id == post_id).count()
    return {"liked": liked, "likes": likes}