"""Polonix v0.9.7 - メインアプリケーション"""
from __future__ import annotations

import logging
import os
import random
import string
import time

import bcrypt
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from models.database import engine
from response import ok

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("polonix")


# ================================================================
# DB 起動待機
# ================================================================
def wait_for_db(retries: int = 10, delay: int = 5) -> bool:
    for i in range(retries):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("DB接続成功")
            return True
        except Exception as e:
            logger.warning("DB接続待機中 (%d/%d): %s", i + 1, retries, e)
            time.sleep(delay)
    logger.error("DB接続失敗。起動続行")
    return False


# ================================================================
# テーブル作成
# ================================================================
def create_tables() -> None:
    ddl = """
    CREATE TABLE IF NOT EXISTS users (
        id               SERIAL PRIMARY KEY,
        user_id          VARCHAR(20)  UNIQUE,
        username         VARCHAR(30)  UNIQUE NOT NULL,
        hashed_password  VARCHAR(200) NOT NULL,
        role             VARCHAR(10)  NOT NULL DEFAULT 'user',
        avatar           TEXT,
        bio              VARCHAR(200),
        selected_title   VARCHAR(200),
        selected_title_a VARCHAR(100),
        selected_title_b VARCHAR(100),
        selected_badges  TEXT,
        is_banned        BOOLEAN      NOT NULL DEFAULT false,
        created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS posts (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(30)  NOT NULL,
        content    VARCHAR(500) NOT NULL,
        image      TEXT,
        tag        VARCHAR(30),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS likes (
        id       SERIAL PRIMARY KEY,
        post_id  INTEGER     NOT NULL,
        username VARCHAR(30) NOT NULL,
        UNIQUE(post_id, username)
    );
    CREATE TABLE IF NOT EXISTS comments (
        id         SERIAL PRIMARY KEY,
        post_id    INTEGER      NOT NULL,
        username   VARCHAR(30)  NOT NULL,
        content    VARCHAR(200) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(30) NOT NULL,
        from_username VARCHAR(30),
        type          VARCHAR(20) NOT NULL,
        post_id       INTEGER,
        is_read       BOOLEAN   NOT NULL DEFAULT false,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS calendar_events (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(30)  NOT NULL,
        title      VARCHAR(200) NOT NULL,
        memo       TEXT,
        date       VARCHAR(10)  NOT NULL,
        type       VARCHAR(20)  NOT NULL DEFAULT 'memo',
        is_done    BOOLEAN      NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS timetable (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(30)  NOT NULL,
        day        INTEGER      NOT NULL,
        period     INTEGER      NOT NULL,
        subject    VARCHAR(100) NOT NULL,
        room       VARCHAR(50),
        teacher    VARCHAR(100),
        memo       TEXT,
        color      VARCHAR(20)  NOT NULL DEFAULT '#5b6ef5',
        start_time VARCHAR(5),
        UNIQUE(username, day, period)
    );
    CREATE TABLE IF NOT EXISTS user_xp (
        username     VARCHAR(30) PRIMARY KEY,
        xp           INTEGER NOT NULL DEFAULT 0,
        level        INTEGER NOT NULL DEFAULT 1,
        streak       INTEGER NOT NULL DEFAULT 0,
        last_login   VARCHAR(10),
        fortune_date VARCHAR(10)
    );
    CREATE TABLE IF NOT EXISTS gacha_inventory (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(30)  NOT NULL,
        type       VARCHAR(2)   NOT NULL,
        rarity     VARCHAR(10)  NOT NULL,
        text       VARCHAR(200) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS feedback (
        id           SERIAL PRIMARY KEY,
        username     VARCHAR(30) NOT NULL,
        type         VARCHAR(20) NOT NULL DEFAULT 'other',
        title        VARCHAR(200),
        content      TEXT        NOT NULL,
        is_anonymous BOOLEAN     NOT NULL DEFAULT false,
        status       VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS logs (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(30),
        action     VARCHAR(100) NOT NULL,
        detail     TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notices (
        id         SERIAL PRIMARY KEY,
        title      VARCHAR(200) NOT NULL,
        content    TEXT         NOT NULL,
        is_active  BOOLEAN      NOT NULL DEFAULT true,
        is_pinned  BOOLEAN      NOT NULL DEFAULT false,
        priority   VARCHAR(10)  NOT NULL DEFAULT 'normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS grades (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(30)   NOT NULL,
        subject    VARCHAR(100)  NOT NULL,
        score      NUMERIC(5,1)  NOT NULL,
        max_score  NUMERIC(5,1)  NOT NULL DEFAULT 100,
        grade_type VARCHAR(20)   NOT NULL DEFAULT 'exam',
        memo       TEXT,
        date       VARCHAR(10)   NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tasks (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(30)  NOT NULL,
        title      VARCHAR(200) NOT NULL,
        subject    VARCHAR(100),
        due_date   VARCHAR(10)  NOT NULL,
        priority   VARCHAR(10)  NOT NULL DEFAULT 'medium',
        status     VARCHAR(20)  NOT NULL DEFAULT 'pending',
        memo       TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(30) NOT NULL,
        post_id    INTEGER     NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username, post_id)
    );
    CREATE TABLE IF NOT EXISTS attendance (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(30)  NOT NULL,
        subject       VARCHAR(100) NOT NULL,
        total_classes INTEGER      NOT NULL DEFAULT 0,
        attended      INTEGER      NOT NULL DEFAULT 0,
        max_absences  INTEGER      NOT NULL DEFAULT 5,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username, subject)
    );
    CREATE TABLE IF NOT EXISTS badges (
        id        SERIAL PRIMARY KEY,
        username  VARCHAR(30) NOT NULL,
        badge_id  VARCHAR(50) NOT NULL,
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(username, badge_id)
    );
    """
    try:
        with engine.connect() as conn:
            conn.execute(text(ddl))
            conn.commit()
            logger.info("テーブル作成完了")
    except Exception as e:
        logger.error("テーブル作成失敗: %s", e)


# ================================================================
# マイグレーション（各文を独立トランザクションで実行）
# ================================================================
_MIGRATIONS: list[tuple[str, str, str]] = [
    ("users",           "bio",              "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(200)"),
    ("users",           "selected_title",   "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title VARCHAR(200)"),
    ("users",           "selected_badges",  "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_badges TEXT"),
    ("users",           "selected_title_a", "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title_a VARCHAR(100)"),
    ("users",           "selected_title_b", "ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_title_b VARCHAR(100)"),
    ("users",           "is_banned",        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false"),
    ("user_xp",         "fortune_date",     "ALTER TABLE user_xp ADD COLUMN IF NOT EXISTS fortune_date VARCHAR(10)"),
    ("timetable",       "start_time",       "ALTER TABLE timetable ADD COLUMN IF NOT EXISTS start_time VARCHAR(5)"),
    ("timetable",       "day_rename",       "ALTER TABLE timetable RENAME COLUMN day_of_week TO day"),
    ("timetable",       "teacher",          "ALTER TABLE timetable ADD COLUMN IF NOT EXISTS teacher VARCHAR(100)"),
    ("timetable",       "memo",             "ALTER TABLE timetable ADD COLUMN IF NOT EXISTS memo TEXT"),
    ("timetable",       "color",            "ALTER TABLE timetable ADD COLUMN IF NOT EXISTS color VARCHAR(20) NOT NULL DEFAULT '#5b6ef5'"),
    ("posts",           "tag",              "ALTER TABLE posts ADD COLUMN IF NOT EXISTS tag VARCHAR(30)"),
    ("notices",         "is_pinned",        "ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false"),
    ("notices",         "priority",         "ALTER TABLE notices ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'normal'"),
    ("feedback",        "title",            "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS title VARCHAR(200)"),
    ("feedback",        "is_anonymous",     "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false"),
    ("gacha_inventory", "type",             "ALTER TABLE gacha_inventory ADD COLUMN IF NOT EXISTS type VARCHAR(2)"),
    ("gacha_inventory", "text",             "ALTER TABLE gacha_inventory ADD COLUMN IF NOT EXISTS text VARCHAR(200)"),
    ("gacha_inventory", "created_at",       "ALTER TABLE gacha_inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
    ("gacha_inventory", "drop_item_id",     "ALTER TABLE gacha_inventory DROP COLUMN IF EXISTS item_id"),
    ("gacha_inventory", "drop_item_name",   "ALTER TABLE gacha_inventory DROP COLUMN IF EXISTS item_name"),
    ("gacha_inventory", "drop_obtained_at", "ALTER TABLE gacha_inventory DROP COLUMN IF EXISTS obtained_at"),
]


def run_migrations() -> None:
    for table, column, sql in _MIGRATIONS:
        try:
            with engine.connect() as conn:
                conn.execute(text(sql))
                conn.commit()
                logger.info("Migration: %s.%s 完了", table, column)
        except Exception as e:
            logger.warning("Migration skipped (%s.%s): %s", table, column, str(e).splitlines()[0])


# ================================================================
# 管理者アカウント初期化
# ================================================================
def init_admin() -> None:
    try:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT id FROM users WHERE username = 'admin'")).fetchone()
            if not row:
                hashed = bcrypt.hashpw(b"admin1234", bcrypt.gensalt()).decode()
                uid = "#" + "".join(random.choices(string.digits, k=8))
                conn.execute(
                    text("INSERT INTO users (username, hashed_password, role, user_id) VALUES (:u,:p,'admin',:uid)"),
                    {"u": "admin", "p": hashed, "uid": uid},
                )
                conn.execute(
                    text("INSERT INTO logs (username,action,detail) VALUES ('admin','システム初期化','管理者アカウント自動作成')")
                )
                conn.commit()
                logger.info("管理者アカウントを作成しました")
    except Exception as e:
        logger.warning("init_admin スキップ: %s", e)


# ================================================================
# 起動シーケンス
# ================================================================
wait_for_db()
create_tables()
run_migrations()
init_admin()


# ================================================================
# FastAPI アプリ
# ================================================================
app = FastAPI(title="Polonix API", version="0.9.7", docs_url=None, redoc_url=None)

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
_allow_credentials = origins != ["*"]

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ----------------------------------------------------------------
# セキュリティヘッダー
# ----------------------------------------------------------------
_SEC_HEADERS = {
    "X-Content-Type-Options":        "nosniff",
    "X-Frame-Options":               "DENY",
    "Referrer-Policy":               "strict-origin-when-cross-origin",
    "Permissions-Policy":            "geolocation=(), microphone=(), camera=()",
    "Cross-Origin-Opener-Policy":    "same-origin",
    "Cross-Origin-Resource-Policy":  "same-site",
}


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for k, v in _SEC_HEADERS.items():
        response.headers[k] = v
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    ms = round((time.time() - start) * 1000)
    if request.method != "OPTIONS" and response.status_code >= 400:
        logger.warning("%s %s → %d (%dms)", request.method, request.url.path, response.status_code, ms)
    return response


# ----------------------------------------------------------------
# グローバルエラーハンドラー
# ----------------------------------------------------------------
@app.exception_handler(HTTPException)
async def http_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "success" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": f"HTTP_{exc.status_code}", "message": str(exc.detail)}},
    )


@app.exception_handler(Exception)
async def generic_handler(request: Request, exc: Exception):
    logger.error("Unhandled: %s %s - %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": "サーバーエラーが発生しました"}},
    )


# ================================================================
# ルーター登録
# ================================================================
from auth.routes       import router as auth_router
from routes.attendance import router as attendance_router
from routes.badges     import router as badges_router
from routes.bookmarks  import router as bookmarks_router
from routes.calendar   import router as calendar_router
from routes.feedback   import router as feedback_router
from routes.grades     import router as grades_router
from routes.logs       import router as logs_router
from routes.notices    import router as notices_router
from routes.posts      import router as posts_router
from routes.stats      import router as stats_router
from routes.tasks      import router as tasks_router
from routes.timetable  import router as timetable_router
from routes.users      import router as users_router

app.include_router(auth_router,       prefix="/auth",       tags=["auth"])
app.include_router(users_router,      prefix="/users",      tags=["users"])
app.include_router(posts_router,      prefix="/posts",      tags=["posts"])
app.include_router(notices_router,    prefix="/notices",    tags=["notices"])
app.include_router(calendar_router,   prefix="/calendar",   tags=["calendar"])
app.include_router(timetable_router,  prefix="/timetable",  tags=["timetable"])
app.include_router(grades_router,     prefix="/grades",     tags=["grades"])
app.include_router(tasks_router,      prefix="/tasks",      tags=["tasks"])
app.include_router(attendance_router, prefix="/attendance", tags=["attendance"])
app.include_router(bookmarks_router,  prefix="/bookmarks",  tags=["bookmarks"])
app.include_router(badges_router,     prefix="/badges",     tags=["badges"])
app.include_router(feedback_router,   prefix="/feedback",   tags=["feedback"])
app.include_router(stats_router,      prefix="/stats",      tags=["stats"])
app.include_router(logs_router,       prefix="/logs",       tags=["logs"])


# ----------------------------------------------------------------
# ヘルスチェック
# ----------------------------------------------------------------
@app.get("/")
@app.head("/")
def root():
    return ok({"status": "ok", "version": "0.9.7"})


@app.get("/health")
@app.head("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return ok({"status": "healthy"})
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "unhealthy", "error": str(e)})
