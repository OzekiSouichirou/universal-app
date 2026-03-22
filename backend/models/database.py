"""
Polonix v0.9.0 - DB接続層
方針: 生SQL(text())に統一。SQLAlchemy ORMは使用しない。
接続管理のみをここで行い、スキーマ管理はAlembicで行う。
"""
from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"connect_timeout": 30} if DATABASE_URL.startswith("postgresql") else {},
)

def get_db():
    """FastAPI Depends用DBコネクション取得"""
    conn = engine.connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def row_to_dict(row) -> dict:
    """SQLAlchemy Rowをdictに変換"""
    if row is None:
        return None
    return dict(row._mapping)

def rows_to_list(rows) -> list:
    """SQLAlchemy Rowリストをdictリストに変換"""
    return [dict(r._mapping) for r in rows]
