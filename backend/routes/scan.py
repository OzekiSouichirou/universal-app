"""Polonix - 英雄録バックエンドルート"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text

from models.database import get_db, row_to_dict, rows_to_list
from response import E, err, ok
from routes.users import get_current_user

router = APIRouter()

ATTRIBUTES  = ['火', '水', '草', '氷', '毒', '光', '闇']
RARITY_MAP  = {'SSR': '#f5a623', 'SR': '#41b4f5', 'R': '#3ecf8e', 'N': '#8892b0'}

# 決定論的な名前生成用語彙
_ADJ = ['古びた', '紅の', '蒼き', '漆黒の', '白銀の', '炎の', '嵐の',
        '深淵の', '神聖な', '呪われし', '黄金の', '霧の', '孤高の', '破滅の']
_NOUN = ['勇者', '剣士', '魔道士', '鍛冶師', '賢者', '盗賊', '騎士',
         '弓使い', '僧侶', '忍者', '錬金術師', '吟遊詩人', '竜騎士', '召喚士']

MAX_QUEST_HOURS = 8


def _hero_stats(jan_code: str) -> dict:
    h = hashlib.sha256(jan_code.encode()).hexdigest()
    digits = [int(c) for c in jan_code if c.isdigit()]
    attr_idx = sum(digits) % 7

    score = int(h[0:2], 16)
    rarity = 'SSR' if score > 240 else 'SR' if score > 200 else 'R' if score > 100 else 'N'

    def scale(hex2: str, lo: int, hi: int) -> int:
        return lo + math.floor(int(hex2, 16) / 255 * (hi - lo))

    return {
        'rarity':    rarity,
        'attribute': ATTRIBUTES[attr_idx],
        'hp':        scale(h[2:4],  50,  250),
        'attack':    scale(h[4:6],  10,  100),
        'speed':     scale(h[6:8],   1,  100),
        'luck':      scale(h[8:10],  1,  100),
        '_adj_idx':  int(h[10:12], 16) % len(_ADJ),
        '_noun_idx': int(h[12:14], 16) % len(_NOUN),
    }


def _fetch_product_name_sync(jan_code: str) -> str | None:
    import urllib.request
    import json as _json
    url = f'https://world.openfoodfacts.org/api/v0/product/{jan_code}.json'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Polonix/1.0'})
        with urllib.request.urlopen(req, timeout=3) as res:
            data = _json.loads(res.read().decode())
        if data.get('status') == 1:
            p    = data.get('product', {})
            name = p.get('product_name_ja') or p.get('product_name')
            if name and name.strip():
                return name.strip()[:40]
    except Exception:
        pass
    return None


async def _fetch_product_name(jan_code: str) -> str | None:
    import asyncio
    return await asyncio.to_thread(_fetch_product_name_sync, jan_code)


def _fallback_name(stats: dict) -> str:
    return f'{_ADJ[stats["_adj_idx"]]}{_NOUN[stats["_noun_idx"]]}'


class ScanBody(BaseModel):
    jan_code: str


class PartyBody(BaseModel):
    hero_ids: list[int]


@router.post('/')
async def scan(body: ScanBody, user=Depends(get_current_user), db=Depends(get_db)):
    jan = body.jan_code.strip().replace(' ', '').replace('-', '')
    if not jan.isdigit() or len(jan) not in (8, 12, 13):
        err(E.INVALID_INPUT, '無効なJANコードです')

    # テーブルが存在しない場合は自動作成
    try:
        db.execute(text('''CREATE TABLE IF NOT EXISTS heroes (
            id SERIAL PRIMARY KEY, username VARCHAR(30) NOT NULL,
            jan_code VARCHAR(13) NOT NULL, hero_name VARCHAR(100) NOT NULL,
            rarity VARCHAR(4) NOT NULL, attribute VARCHAR(4) NOT NULL,
            hp INTEGER NOT NULL, attack INTEGER NOT NULL,
            speed INTEGER NOT NULL, luck INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT now(), UNIQUE(username, jan_code))'''))
        db.execute(text('''CREATE TABLE IF NOT EXISTS party (
            username VARCHAR(30) PRIMARY KEY, hero_ids TEXT DEFAULT '[]',
            quest_started_at TIMESTAMP DEFAULT NULL)'''))
        db.commit()
    except Exception:
        db.rollback()

    dup = db.execute(
        text('SELECT id FROM heroes WHERE username=:u AND jan_code=:j'),
        {'u': user['username'], 'j': jan}
    ).fetchone()
    if dup:
        err(E.DUPLICATE, 'この勇者はすでに登録済みです')

    stats  = _hero_stats(jan)
    pname  = await _fetch_product_name(jan)
    name   = pname if pname else _fallback_name(stats)

    row = db.execute(
        text('''
            INSERT INTO heroes
              (username, jan_code, hero_name, rarity, attribute, hp, attack, speed, luck, created_at)
            VALUES (:u, :j, :n, :r, :a, :hp, :atk, :spd, :lck, now())
            RETURNING id, username, jan_code, hero_name, rarity, attribute, hp, attack, speed, luck, created_at
        '''),
        {
            'u': user['username'], 'j': jan, 'n': name,
            'r': stats['rarity'],  'a': stats['attribute'],
            'hp': stats['hp'],     'atk': stats['attack'],
            'spd': stats['speed'], 'lck': stats['luck'],
        }
    ).fetchone()
    db.commit()
    return ok({**row_to_dict(row), 'name_source': 'api' if pname else 'generated'})


@router.get('/heroes')
async def heroes(user=Depends(get_current_user), db=Depends(get_db)):
    try:
        rows = db.execute(
            text('SELECT * FROM heroes WHERE username=:u ORDER BY created_at DESC'),
            {'u': user['username']}
        ).fetchall()
        return ok(rows_to_list(rows))
    except Exception:
        db.rollback()
        return ok([])


@router.get('/party')
async def get_party(user=Depends(get_current_user), db=Depends(get_db)):
    try:
        row = db.execute(
            text('SELECT hero_ids FROM party WHERE username=:u'),
            {'u': user['username']}
        ).fetchone()
    except Exception:
        db.rollback()
        return ok([])
    if not row:
        return ok([])
    ids = json.loads(row[0])
    if not ids:
        return ok([])
    placeholders = ','.join(f':id{i}' for i in range(len(ids)))
    heroes = db.execute(
        text(f'SELECT * FROM heroes WHERE id IN ({placeholders})'),
        {f'id{i}': v for i, v in enumerate(ids)}
    ).fetchall()
    return ok(rows_to_list(heroes))


@router.post('/party')
async def set_party(body: PartyBody, user=Depends(get_current_user), db=Depends(get_db)):
    if len(body.hero_ids) > 3:
        err(E.INVALID_INPUT, 'パーティは最大3人です')

    if body.hero_ids:
        placeholders = ','.join(f':id{i}' for i in range(len(body.hero_ids)))
        rows = db.execute(
            text(f'SELECT id FROM heroes WHERE id IN ({placeholders}) AND username=:u'),
            {**{f'id{i}': v for i, v in enumerate(body.hero_ids)}, 'u': user['username']}
        ).fetchall()
        if len(rows) != len(body.hero_ids):
            err(E.INVALID_INPUT, '所有していない勇者が含まれています')

    db.execute(
        text('''
            INSERT INTO party (username, hero_ids) VALUES (:u, :ids)
            ON CONFLICT (username) DO UPDATE SET hero_ids=:ids
        '''),
        {'u': user['username'], 'ids': json.dumps(body.hero_ids)}
    )
    db.commit()
    return ok({'hero_ids': body.hero_ids})


@router.post('/quest/start')
async def quest_start(user=Depends(get_current_user), db=Depends(get_db)):
    row = db.execute(
        text('SELECT hero_ids FROM party WHERE username=:u'),
        {'u': user['username']}
    ).fetchone()
    if not row or not json.loads(row[0]):
        err(E.INVALID_INPUT, 'パーティに勇者がいません')

    db.execute(
        text('''
            INSERT INTO party (username, hero_ids, quest_started_at)
            VALUES (:u, (SELECT hero_ids FROM party WHERE username=:u), now())
            ON CONFLICT (username) DO UPDATE SET quest_started_at=now()
        '''),
        {'u': user['username']}
    )
    db.commit()
    return ok({'started_at': datetime.now(timezone.utc).isoformat()})


@router.get('/quest/result')
async def quest_result(user=Depends(get_current_user), db=Depends(get_db)):
    row = db.execute(
        text('SELECT hero_ids, quest_started_at FROM party WHERE username=:u'),
        {'u': user['username']}
    ).fetchone()
    if not row or not row[1]:
        err(E.NOT_FOUND, 'クエスト中ではありません')

    ids      = json.loads(row[0])
    started  = row[1]
    now      = datetime.now(timezone.utc)
    elapsed  = min((now - started.replace(tzinfo=timezone.utc)).total_seconds() / 3600,
                   MAX_QUEST_HOURS)

    placeholders = ','.join(f':id{i}' for i in range(len(ids)))
    heroes = db.execute(
        text(f'SELECT attack, luck FROM heroes WHERE id IN ({placeholders})'),
        {f'id{i}': v for i, v in enumerate(ids)}
    ).fetchall()

    power  = sum(h[0] * (1 + h[1] / 100) for h in heroes)
    xp_gained = max(1, int(power * elapsed * 0.5))

    db.execute(
        text('UPDATE party SET quest_started_at=NULL WHERE username=:u'),
        {'u': user['username']}
    )
    db.execute(
        text('''
            INSERT INTO user_xp (username, xp, level, streak, last_login, fortune_date)
            VALUES (:u, :xp, 1, 0, '', '')
            ON CONFLICT (username) DO UPDATE
            SET xp = user_xp.xp + :xp
        '''),
        {'u': user['username'], 'xp': xp_gained}
    )
    db.commit()
    return ok({
        'elapsed_hours': round(elapsed, 2),
        'xp_gained':     xp_gained,
        'party_power':   round(power, 1),
    })
