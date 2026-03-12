from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, Post, Like, Log, Comment
from routes.users import get_current_user
from models.database import User

router = APIRouter()

class PostCreate(BaseModel):
    content: str

class CommentCreate(BaseModel):
    content: str

@router.get("/")
def get_posts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    posts = db.query(Post).order_by(Post.created_at.desc()).limit(100).all()
    result = []
    for post in posts:
        likes = db.query(Like).filter(Like.post_id == post.id).count()
        liked = db.query(Like).filter(Like.post_id == post.id, Like.username == current_user.username).first() is not None
        comment_count = db.query(Comment).filter(Comment.post_id == post.id).count()
        result.append({
            "id": post.id,
            "username": post.username,
            "content": post.content,
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
    post = Post(username=current_user.username, content=req.content)
    db.add(post)
    db.add(Log(username=current_user.username, action="投稿作成"))
    db.commit()
    db.refresh(post)
    return {
        "id": post.id,
        "username": post.username,
        "content": post.content,
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

@router.get("/{post_id}/comments")
def get_comments(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="投稿が見つかりません")
    comments = db.query(Comment).filter(Comment.post_id == post_id).order_by(Comment.created_at.asc()).all()
    return [{"id": c.id, "username": c.username, "content": c.content, "created_at": c.created_at} for c in comments]

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
