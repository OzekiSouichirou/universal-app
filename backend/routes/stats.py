from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from models.database import get_db, User, Post, Like, Comment, UserXP
from routes.users import get_current_user
from datetime import datetime, timedelta, date

router = APIRouter()

@router.get("/admin")
def get_admin_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="管理者のみ")

    total_users = db.query(func.count(User.id)).scalar()
    admin_count = db.query(func.count(User.id)).filter(User.role == "admin").scalar()
    total_posts = db.query(func.count(Post.id)).scalar()
    total_comments = db.query(func.count(Comment.id)).scalar()
    total_likes = db.query(func.count(Like.id)).scalar()

    # 過去7日間の投稿数
    post_trend = []
    for i in range(6, -1, -1):
        d = date.today() - timedelta(days=i)
        count = db.query(func.count(Post.id)).filter(
            func.date(Post.created_at) == d
        ).scalar()
        post_trend.append({"date": d.strftime("%m/%d"), "count": count})

    # 時間帯別投稿数
    for h in range(24):
        count = db.query(func.count(Post.id)).filter(
        ).scalar()

    # XPランキング上位5

    return {
        "total_users": total_users,
        "admin_count": admin_count,
        "total_posts": total_posts,
        "total_comments": total_comments,
        "total_likes": total_likes,
        "post_trend": post_trend,
    }

@router.get("/me")
def get_my_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    my_posts = db.query(func.count(Post.id)).filter(Post.username == current_user.username).scalar()
    my_likes = db.query(func.count(Like.id)).filter(
        Like.post_id.in_(
            db.query(Post.id).filter(Post.username == current_user.username)
        )
    ).scalar()
    my_comments = db.query(func.count(Comment.id)).filter(Comment.username == current_user.username).scalar()

    xp_row = db.query(UserXP).filter(UserXP.username == current_user.username).first()

    # 過去7日間の自分の投稿数
    post_trend = []
    for i in range(6, -1, -1):
        d = date.today() - timedelta(days=i)
        count = db.query(func.count(Post.id)).filter(
            Post.username == current_user.username,
            func.date(Post.created_at) == d
        ).scalar()
        post_trend.append({"date": d.strftime("%m/%d"), "count": count})

    # XPランキング上位5

    return {
        "my_posts": my_posts,
        "my_likes": my_likes,
        "my_comments": my_comments,
        "xp": xp_row.xp if xp_row else 0,
        "level": xp_row.level if xp_row else 1,
        "streak": xp_row.streak if xp_row else 0,
        "post_trend": post_trend,
    }
