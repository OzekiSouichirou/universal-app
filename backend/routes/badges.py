"""Polonix v0.9.6 - 実績バッジルート"""
import os, sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import APIRouter, Depends
from sqlalchemy import text
from models.database import get_db, rows_to_list
from routes.users import get_current_user
from response import ok

router = APIRouter()

# バッジ定義
BADGE_DEFS = {
    "first_post":      {"name": "初投稿",       "icon": "📝", "desc": "初めて投稿した"},
    "post_10":         {"name": "投稿家",        "icon": "✍️",  "desc": "10回投稿した"},
    "post_50":         {"name": "投稿マスター",  "icon": "🏆", "desc": "50回投稿した"},
    "streak_3":        {"name": "3日連続",       "icon": "🔥", "desc": "3日連続ログイン"},
    "streak_7":        {"name": "1週間皆勤",     "icon": "⚡", "desc": "7日連続ログイン"},
    "streak_30":       {"name": "皆勤賞",        "icon": "👑", "desc": "30日連続ログイン"},
    "grade_90":        {"name": "優等生",        "icon": "⭐", "desc": "成績90%以上を記録"},
    "grade_100":       {"name": "満点",          "icon": "💯", "desc": "満点を取得"},
    "task_done_10":    {"name": "課題完了",      "icon": "✅", "desc": "課題を10件完了"},
    "attend_perfect":  {"name": "皆勤",          "icon": "🎯", "desc": "出席率100%の科目あり"},
    "gacha_ssr":       {"name": "ラッキー",      "icon": "🌟", "desc": "SSR以上を排出"},
    "lv_5":            {"name": "Lv.5到達",      "icon": "🎖️", "desc": "レベル5に到達"},
    "lv_10":           {"name": "Lv.10到達",     "icon": "🏅", "desc": "レベル10に到達"},
}

@router.get("/")
def get_my_badges(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = db.execute(
        text("SELECT badge_id, earned_at FROM badges WHERE username=:u ORDER BY earned_at DESC"),
        {"u": current_user.username}
    ).fetchall()
    earned_ids = {r.badge_id for r in rows}
    earned_at  = {r.badge_id: str(r.earned_at) for r in rows}

    result = []
    for bid, bdef in BADGE_DEFS.items():
        result.append({
            "id":       bid,
            "name":     bdef["name"],
            "icon":     bdef["icon"],
            "desc":     bdef["desc"],
            "earned":   bid in earned_ids,
            "earned_at": earned_at.get(bid),
        })
    return ok(result)

@router.get("/all")
def get_all_badges(db=Depends(get_db), current_user=Depends(get_current_user)):
    """全バッジ定義を返す"""
    return ok([{"id": k, **v} for k, v in BADGE_DEFS.items()])

@router.post("/check")
def check_and_award(db=Depends(get_db), current_user=Depends(get_current_user)):
    """バッジ取得条件をチェックして付与"""
    u = current_user.username
    awarded = []

    def award(badge_id: str):
        existing = db.execute(
            text("SELECT id FROM badges WHERE username=:u AND badge_id=:b"),
            {"u": u, "b": badge_id}
        ).fetchone()
        if not existing:
            db.execute(text("INSERT INTO badges (username,badge_id) VALUES (:u,:b)"),
                       {"u": u, "b": badge_id})
            awarded.append({"id": badge_id, **BADGE_DEFS[badge_id]})

    try:
        # 投稿数
        pc = db.execute(text("SELECT COUNT(*) AS c FROM posts WHERE username=:u"), {"u": u}).fetchone().c
        if pc >= 1:  award("first_post")
        if pc >= 10: award("post_10")
        if pc >= 50: award("post_50")

        # 連続ログイン
        xp = db.execute(text("SELECT streak, level FROM user_xp WHERE username=:u"), {"u": u}).fetchone()
        if xp:
            if xp.streak >= 3:  award("streak_3")
            if xp.streak >= 7:  award("streak_7")
            if xp.streak >= 30: award("streak_30")
            if xp.level >= 5:   award("lv_5")
            if xp.level >= 10:  award("lv_10")

        # 成績
        try:
            grades = db.execute(
                text("SELECT score, max_score FROM grades WHERE username=:u"), {"u": u}
            ).fetchall()
            for g in grades:
                pct = g.score / g.max_score * 100 if g.max_score > 0 else 0
                if pct >= 90: award("grade_90")
                if pct >= 100: award("grade_100")
        except Exception: pass

        # 課題完了数
        try:
            dc = db.execute(
                text("SELECT COUNT(*) AS c FROM tasks WHERE username=:u AND status='done'"), {"u": u}
            ).fetchone().c
            if dc >= 10: award("task_done_10")
        except Exception: pass

        # 出席率100%
        try:
            att = db.execute(
                text("SELECT total_classes, attended FROM attendance WHERE username=:u"), {"u": u}
            ).fetchall()
            for a in att:
                if a.total_classes > 0 and a.attended == a.total_classes:
                    award("attend_perfect"); break
        except Exception: pass

        # ガチャSSR以上
        try:
            ssr = db.execute(
                text("SELECT COUNT(*) AS c FROM gacha_inventory WHERE username=:u AND rarity IN ('SSR','UR','SECR')"),
                {"u": u}
            ).fetchone().c
            if ssr >= 1: award("gacha_ssr")
        except Exception: pass

        if awarded:
            db.execute(text("SELECT 1"))  # commit trigger

    except Exception as e:
        pass

    return ok({"awarded": awarded, "count": len(awarded)})
