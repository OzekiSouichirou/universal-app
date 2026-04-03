"""
Polonix v0.9.0 - メインアプリケーション
強化内容:
- グローバルエラーハンドラー統一
- セキュリティヘッダー追加
- リクエストロギング
- DB接続安定化（リトライ・タイムアウト）
- Gzip圧縮
"""
import os
import time
import bcrypt
import logging
import random
import string
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException
from sqlalchemy import text
from models.database import engine, get_db
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("polonix")

# ============================================================
# DB起動待機（Renderスリープ対応）
# ============================================================
def wait_for_db(retries: int = 5, delay: int = 2) -> bool:
    # Neonはサスペンドからの復帰が速いため短いリトライで十分
    for i in range(retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("DB接続成功")
            return True
        except Exception as e:
            logger.warning(f"DB接続待機中 ({i+1}/{retries}): {e}")
            time.sleep(delay)
    logger.error("DB接続失敗。起動続行")
    return False

# ============================================================
# テーブル初期作成（新規DB対応）
# ============================================================
def create_tables():
    DDL = """
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        role VARCHAR(10) NOT NULL DEFAULT 'user',
        avatar TEXT,
        user_id VARCHAR(20),
        bio VARCHAR(200),
        selected_title VARCHAR(200),
        selected_title_a VARCHAR(100),
        selected_title_b VARCHAR(100),
        selected_badges TEXT,
        is_banned BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) NOT NULL,
        content TEXT NOT NULL,
        image TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        username VARCHAR(30) NOT NULL,
        UNIQUE(post_id, username)
    );
    CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        username VARCHAR(30) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) NOT NULL,
        type VARCHAR(20) NOT NULL,
        post_id INTEGER,
        from_username VARCHAR(30),
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS calendar_events (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) NOT NULL,
        title VARCHAR(200) NOT NULL,
        memo TEXT,
        date VARCHAR(10) NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'memo',
        is_done BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS timetable (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) NOT NULL,
        day INTEGER NOT NULL,
        period INTEGER NOT NULL,
        subject VARCHAR(100) NOT NULL,
        room VARCHAR(50),
        teacher VARCHAR(50),
        memo TEXT,
        color VARCHAR(10) DEFAULT '#5b6ef5',
        UNIQUE(username, day, period)
    );
    CREATE TABLE IF NOT EXISTS user_xp (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) UNIQUE NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        streak INTEGER NOT NULL DEFAULT 0,
        last_login VARCHAR(10),
        fortune_date VARCHAR(10)
    );
    CREATE TABLE IF NOT EXISTS gacha_inventory (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) NOT NULL,
        type VARCHAR(2) NOT NULL,
        rarity VARCHAR(10) NOT NULL,
        text VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username, type, text)
    );
    CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) NOT NULL,
        type VARCHAR(20) NOT NULL,
        title VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        is_anonymous BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        username VARCHAR(30) NOT NULL,
        action VARCHAR(50) NOT NULL,
        detail TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notices (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    try:
        with engine.connect() as conn:
            conn.execute(text(DDL))
            conn.commit()
            logger.info("テーブル作成完了")
    except Exception as e:
        logger.error(f"create_tables failed: {e}")

# ============================================================
# マイグレーション（既存DB向けカラム追加）
# ============================================================
def run_migrations():
    MIGRATIONS = [
        ("users",    "bio",              "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(200)"),
        ("users",    "selected_title",   "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title VARCHAR(200)"),
        ("users",    "selected_badges",  "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_badges TEXT"),
        ("users",    "selected_title_a", "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title_a VARCHAR(100)"),
        ("users",    "selected_title_b", "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title_b VARCHAR(100)"),
        ("users",    "is_banned",        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false"),
        ("user_xp",  "fortune_date",     "ALTER TABLE user_xp ADD COLUMN IF NOT EXISTS fortune_date VARCHAR(10)"),
    ]
    try:
        with engine.connect() as conn:
            for table, column, sql in MIGRATIONS:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                    logger.info(f"Migration: {table}.{column} 確認済み")
                except Exception as e:
                    logger.warning(f"Migration skipped ({table}.{column}): {e}")
    except Exception as e:
        logger.error(f"Migration failed: {e}")

# ============================================================
# 管理者アカウント初期化
# ============================================================
def init_admin():
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT id FROM users WHERE username = 'admin'")).fetchone()
            if not row:
                hashed = bcrypt.hashpw(b"admin1234", bcrypt.gensalt()).decode()
                uid = "#" + "".join(random.choices(string.digits, k=8))
                conn.execute(text(
                    "INSERT INTO users (username, hashed_password, role, user_id) "
                    "VALUES (:u, :p, 'admin', :uid)"
                ), {"u": "admin", "p": hashed, "uid": uid})
                conn.execute(text(
                    "INSERT INTO logs (username, action, detail) "
                    "VALUES ('admin', 'システム初期化', '管理者アカウント自動作成')"
                ))
                conn.commit()
                logger.info("管理者アカウントを作成しました")
    except Exception as e:
        logger.warning(f"init_admin スキップ: {e}")

# ============================================================
# 起動処理
# ============================================================
wait_for_db()
create_tables()
run_migrations()
init_admin()

# ============================================================
# FastAPIアプリ
# ============================================================
app = FastAPI(
    title="Polonix API",
    version="0.9.3",
    docs_url=None,
    redoc_url=None,
)

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]

app.add_middleware(GZipMiddleware, minimum_size=1000)
# originsが["*"]の場合はallow_credentials=Falseにする（CORS仕様上の制約）
_allow_credentials = origins != ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ============================================================
# セキュリティヘッダーミドルウェア
# ============================================================
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# ============================================================
# リクエストロギングミドルウェア
# ============================================================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000)
    if request.method != "OPTIONS" and response.status_code >= 400:
        logger.warning(
            f"{request.method} {request.url.path} "
            f"→ {response.status_code} ({duration}ms)"
        )
    return response

# ============================================================
# グローバルエラーハンドラー
# ============================================================
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "success" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {
            "code": f"HTTP_{exc.status_code}",
            "message": str(exc.detail)
        }}
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled: {request.method} {request.url.path} - {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {
            "code": "INTERNAL_ERROR",
            "message": "サーバーエラーが発生しました"
        }}
    )

# ============================================================
# ルーター登録
# ============================================================
from auth.routes      import router as auth_router
from routes.users     import router as users_router
from routes.logs      import router as logs_router
from routes.notices   import router as notices_router
from routes.posts     import router as posts_router
from routes.calendar  import router as calendar_router
from routes.timetable import router as timetable_router
from routes.stats     import router as stats_router
from routes.feedback  import router as feedback_router
from response import ok

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
    return ok({"status": "ok", "version": "0.9.3"})

@app.get("/health")
@app.head("/health")
def health(db=Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return ok({"status": "ok", "db": "ok"})
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "error", "db": "unavailable"}
        )
