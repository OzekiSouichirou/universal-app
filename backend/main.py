"""
Polonix v0.9.0 - メインアプリケーション
- ORM廃止・生SQL統一
- Alembicによるマイグレーション管理
- run_migrations()は残すが、Alembic移行後は不要
"""
import os
import time
import bcrypt
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException
from sqlalchemy import text
from database import engine, get_db_ctx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("polonix")

# ============================================================
# DB起動待機
# ============================================================
def wait_for_db(retries: int = 10, delay: int = 5) -> bool:
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
# マイグレーション（Alembic移行前の暫定対応）
# 新カラムはAlembicで管理するため、ここでは最小限に留める
# ============================================================
def run_migrations():
    MIGRATIONS = [
        ("users",           "bio",             "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(200)"),
        ("users",           "selected_title",  "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title VARCHAR(200)"),
        ("users",           "selected_badges", "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_badges TEXT"),
        ("users",           "selected_title_a","ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title_a VARCHAR(100)"),
        ("users",           "selected_title_b","ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title_b VARCHAR(100)"),
        ("users",           "is_banned",       "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false"),
        ("user_xp",         "fortune_date",    "ALTER TABLE user_xp ADD COLUMN IF NOT EXISTS fortune_date VARCHAR(10)"),
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
            row = conn.execute(
                text("SELECT id FROM users WHERE username = 'admin'")
            ).fetchone()
            if not row:
                hashed = bcrypt.hashpw(b"admin1234", bcrypt.gensalt()).decode()
                import uuid, random, string
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
run_migrations()
init_admin()

# ============================================================
# FastAPIアプリ
# ============================================================
app = FastAPI(
    title="Polonix API",
    version="0.9.0",
    docs_url=None,
    redoc_url=None,
)

origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# グローバルエラーハンドラー（レスポンス形式統一）
# ============================================================
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # 既に統一形式の場合はそのまま返す
    if isinstance(exc.detail, dict) and "success" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    # 旧形式のdetail（文字列）を統一形式に変換
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": str(exc.detail)
            }
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {request.url} - {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "サーバーエラーが発生しました"
            }
        }
    )

# ============================================================
# ルーター登録
# ============================================================
from auth_routes import router as auth_router
from users       import router as users_router
from logs        import router as logs_router
from notices     import router as notices_router
from posts       import router as posts_router
from calendar    import router as calendar_router
from timetable   import router as timetable_router
from stats       import router as stats_router
from feedback    import router as feedback_router

app.include_router(auth_router,      prefix="/auth",      tags=["auth"])
app.include_router(users_router,     prefix="/users",     tags=["users"])
app.include_router(logs_router,      prefix="/logs",      tags=["logs"])
app.include_router(notices_router,   prefix="/notices",   tags=["notices"])
app.include_router(posts_router,     prefix="/posts",     tags=["posts"])
app.include_router(calendar_router,  prefix="/calendar",  tags=["calendar"])
app.include_router(timetable_router, prefix="/timetable", tags=["timetable"])
app.include_router(stats_router,     prefix="/stats",     tags=["stats"])
app.include_router(feedback_router,  prefix="/feedback",  tags=["feedback"])

from response import ok

@app.get("/")
@app.head("/")
def root():
    return ok({"status": "ok", "version": "0.9.0", "message": "Polonix API is running"})
