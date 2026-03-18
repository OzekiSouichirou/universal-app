import os
import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from models.database import Base, engine, SessionLocal, User, Log
from auth.routes import router as auth_router
from routes.users import router as users_router
from routes.logs import router as logs_router
from routes.notices import router as notices_router
from routes.posts import router as posts_router
from routes.calendar import router as calendar_router
from routes.timetable import router as timetable_router
from routes.stats import router as stats_router
from routes.feedback import router as feedback_router
from dotenv import load_dotenv

load_dotenv()

import time
from sqlalchemy import text

def wait_for_db(retries=10, delay=5):
    for i in range(retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print("DB接続成功")
            return True
        except Exception as e:
            print(f"DB接続待機中 ({i+1}/{retries}): {e}")
            time.sleep(delay)
    print("DB接続失敗。起動続行")
    return False

def run_migrations():
    """既存テーブルに不足カラムをALTER TABLEで追加する"""
    migrations = [
        ("users", "bio",             "ALTER TABLE users ADD COLUMN bio VARCHAR(200)"),
        ("users", "selected_title",  "ALTER TABLE users ADD COLUMN selected_title VARCHAR(200)"),
        ("users", "selected_badges",   "ALTER TABLE users ADD COLUMN selected_badges TEXT"),
        ("users", "selected_title_a", "ALTER TABLE users ADD COLUMN selected_title_a VARCHAR(100)"),
        ("users", "selected_title_b", "ALTER TABLE users ADD COLUMN selected_title_b VARCHAR(100)"),
    ]
    try:
        with engine.connect() as conn:
            for table, column, sql in migrations:
                try:
                    # カラムが存在するか確認
                    result = conn.execute(text(
                        f"SELECT column_name FROM information_schema.columns "
                        f"WHERE table_name='{table}' AND column_name='{column}'"
                    ))
                    if result.fetchone() is None:
                        conn.execute(text(sql))
                        conn.commit()
                        print(f"Migration: {table}.{column} を追加しました")
                    else:
                        print(f"Migration: {table}.{column} は既に存在します")
                except Exception as e:
                    print(f"Migration skipped ({table}.{column}): {e}")
    except Exception as e:
        print(f"Migration failed: {e}")

wait_for_db()
Base.metadata.create_all(bind=engine)
run_migrations()

# マイグレーション後にSQLAlchemyの接続をリフレッシュ
try:
    engine.dispose()
except Exception as e:
    print(f"engine dispose: {e}")

def init_admin():
    try:
        db = SessionLocal()
        existing = db.query(User).filter(User.username == "admin").first()
        if not existing:
            hashed = bcrypt.hashpw("admin1234".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            admin = User(username="admin", hashed_password=hashed, role="admin")
            db.add(admin)
            db.add(Log(username="admin", action="システム初期化", detail="管理者アカウント自動作成"))
            db.commit()
        db.close()
    except Exception as e:
        print(f"init_admin スキップ: {e}")

init_admin()

app = FastAPI(title="Polonix API", version="0.8.2-beta", docs_url=None, redoc_url=None)

origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,      prefix="/auth",      tags=["auth"])
app.include_router(users_router,     prefix="/users",     tags=["users"])
app.include_router(logs_router,      prefix="/logs",      tags=["logs"])
app.include_router(notices_router,   prefix="/notices",   tags=["notices"])
app.include_router(posts_router,     prefix="/posts",     tags=["posts"])
app.include_router(calendar_router,  prefix="/calendar",  tags=["calendar"])
app.include_router(timetable_router, prefix="/timetable", tags=["timetable"])
app.include_router(stats_router,     prefix="/stats",     tags=["stats"])
app.include_router(feedback_router,  prefix="/feedback",  tags=["feedback"])

@app.get("/")
@app.head("/")
def root():
    return {"status": "ok", "message": "Polonix API is running"}
