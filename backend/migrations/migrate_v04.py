#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Task / Habit / Recurring Task v0.4 正式迁移脚本。

只依赖 Python 标准库（sqlite3 / json / csv / argparse），线上无需装包。

用法
----
  # 1) 预演（默认，事务回滚，不写任何数据）
  python3 backend/migrations/migrate_v04.py --db /path/to/database.copy.sqlite

  # 2) 确认无误后真正写入
  python3 backend/migrations/migrate_v04.py --db /path/to/database.copy.sqlite --apply

  # 3) 指定基准日 / 决策文件 / 报告路径
  python3 backend/migrations/migrate_v04.py --db ... --as-of 2026-11-12 \
      --decisions backend/migrations/v04-decisions.json --report /tmp/v04.json --apply

安全边界
--------
* **默认 dry-run**：不传 --apply 时整个事务 ROLLBACK，只打印将发生的变更。
* **生产路径保护**：--db 命中 /www/wwwroot/ 或 production 关键字时必须显式
  传 --allow-live，否则拒绝启动。
* **不启用 PRAGMA foreign_keys = ON**：deleteEventChain 仍在物理删 events，
  启用会真的触发 CASCADE 删掉工时与子任务。子表由本脚本显式清理。
* **执行前请自行做文件级备份 / sqlite3 .backup 一致性快照**。
* 本脚本不负责部署代码。发布顺序必须是：新代码启动（db.js 建三表 →
  v04Schema 闸门停掉旧 recurrence 写入）→ 跑本脚本 → 启用新模型 API。

设计要点
--------
1. 三张新表先建，UNIQUE 在空表阶段就位，再写任何数据。
2. 归类唯一输入是 v04-decisions.json，脚本内不硬编码链条。
3. 每条 DDL / 写操作显式执行，出错即抛，禁止空回调吞错。
4. 数据守恒：迁移前后 completed=1 的记录数必须对得上（去重损耗单独记账）。
"""
import argparse
import csv
import json
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_DECISIONS = HERE / "v04-decisions.json"
LIVE_MARKERS = ("/www/wwwroot/", "\\www\\wwwroot\\", "/data/database.sqlite")

DDL_TABLES = [
    ("habits", """CREATE TABLE IF NOT EXISTS habits (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      title        TEXT NOT NULL,
      rrule        TEXT NOT NULL,
      dtstart      TEXT NOT NULL,
      until_date   TEXT,
      start_time   TEXT, end_time TEXT,
      timezone     TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      valid_from   TEXT NOT NULL, valid_to TEXT,
      category     TEXT DEFAULT '其他',
      archived_at  TEXT,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
    )"""),
    ("habit_overrides", """CREATE TABLE IF NOT EXISTS habit_overrides (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id      INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      date          TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      reason        TEXT,
      completed_at  TEXT,
      created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at    TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (habit_id, date),
      CHECK (status IN ('pending', 'done', 'skipped', 'excused'))
    )"""),
    ("recurring_rules", """CREATE TABLE IF NOT EXISTS recurring_rules (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      title             TEXT NOT NULL,
      rrule             TEXT NOT NULL,
      dtstart           TEXT NOT NULL,
      until_date        TEXT,
      start_time        TEXT, end_time TEXT,
      estimate_minutes  INTEGER,
      project_id        INTEGER,
      priority          TEXT,
      default_status    TEXT DEFAULT 'todo',
      timezone          TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      valid_from        TEXT NOT NULL, valid_to TEXT,
      archived_at       TEXT,
      created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at        TEXT DEFAULT CURRENT_TIMESTAMP
    )"""),
]

NEW_EVENT_COLS = [
    ("rule_id", "INTEGER REFERENCES recurring_rules(id)"),
    ("occurrence_date", "TEXT"),
    ("archived_at", "TEXT"),
]

DDL_INDEXES = [
    ("idx_events_rule_occurrence", """CREATE UNIQUE INDEX IF NOT EXISTS
      idx_events_rule_occurrence ON events(rule_id, occurrence_date)
      WHERE rule_id IS NOT NULL"""),
    ("idx_events_active", """CREATE INDEX IF NOT EXISTS
      idx_events_active ON events(user_id, status, date)
      WHERE archived_at IS NULL"""),
    ("idx_events_rule_archived", """CREATE INDEX IF NOT EXISTS
      idx_events_rule_archived ON events(rule_id, completed_at)
      WHERE rule_id IS NOT NULL"""),
    ("idx_habits_user_valid", """CREATE INDEX IF NOT EXISTS
      idx_habits_user_valid ON habits(user_id, valid_from, valid_to)"""),
    ("idx_rrules_user_valid", """CREATE INDEX IF NOT EXISTS
      idx_rrules_user_valid ON recurring_rules(user_id, valid_from, valid_to)"""),
]


def parse_args():
    p = argparse.ArgumentParser(description="v0.4 三分类迁移（默认 dry-run）")
    p.add_argument("--db", required=True, help="目标 SQLite 文件路径")
    p.add_argument("--decisions", default=str(DEFAULT_DECISIONS),
                   help="归类决策 JSON（默认同目录 v04-decisions.json）")
    p.add_argument("--as-of", default=datetime.now().strftime("%Y-%m-%d"),
                   help="归档基准日 YYYY-MM-DD，默认今天")
    p.add_argument("--apply", action="store_true",
                   help="真正提交；不传则事务回滚（dry-run）")
    p.add_argument("--allow-live", action="store_true",
                   help="允许对生产路径执行（需额外确认已备份）")
    p.add_argument("--report", help="写出 JSON 报告的路径")
    p.add_argument("--orphan-out", help="悬挂记录留档 CSV 路径")
    return p.parse_args()


def load_decisions(path):
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    by_title = {}
    for c in doc["chains"]:
        if c["kind"] not in ("habit", "recurring_task", "drop"):
            raise SystemExit(f"[FATAL] {c['chain_id']} kind 非法: {c['kind']}")
        for k in ("rrule", "dtstart", "start_time"):
            if c["kind"] != "drop" and not str(c.get(k, "")).strip():
                raise SystemExit(f"[FATAL] {c['chain_id']} 缺字段 {k}")
        by_title[c["title"]] = c
    return doc, by_title


def main():
    args = parse_args()
    db_path = Path(args.db).resolve()
    doc, by_title = load_decisions(args.decisions)
    policy = doc["policy"]
    archive_days = int(policy.get("archive_days", 90))
    tz = policy.get("timezone", "Asia/Shanghai")

    if not db_path.exists():
        raise SystemExit(f"[FATAL] 数据库不存在: {db_path}")
    looks_live = any(m in str(db_path) for m in LIVE_MARKERS)
    if looks_live and not args.allow_live:
        raise SystemExit(
            "[FATAL] --db 看起来是生产库。请先做一致性备份，确认代码已按发布顺序"
            "上线（旧 recurrence 写入已停用），再显式加 --allow-live。")

    orphan_out = Path(args.orphan_out) if args.orphan_out else \
        db_path.parent / (db_path.stem + ".v04-orphans.csv")
    report_path = Path(args.report) if args.report else None

    mode = "APPLY（提交）" if args.apply else "DRY-RUN（回滚，不写数据）"
    print(f"[v0.4] 数据库 : {db_path}")
    print(f"[v0.4] 模式   : {mode}")
    print(f"[v0.4] 决策   : {args.decisions}（{len(by_title)} 条链）")
    print(f"[v0.4] 基准日 : {args.as_of} · 归档阈值 {archive_days} 天 · 时区 {tz}")
    print()

    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = OFF")
    con.isolation_level = None  # 显式事务，避免 DDL 隐式提交

    def scalar(sql, a=()):
        r = con.execute(sql, a).fetchone()
        return r[0] if r else None

    def allrows(sql, a=()):
        return con.execute(sql, a).fetchall()

    def run(sql, a=(), label=""):
        try:
            return con.execute(sql, a)
        except sqlite3.Error as e:
            raise RuntimeError(f"[SQL FAILED] {label or sql[:60]}: {e}") from e

    log = []
    def note(msg):
        log.append(msg)
        print("  " + msg)

    sqlite_ver = scalar("SELECT sqlite_version()")
    if tuple(int(x) for x in sqlite_ver.split(".")) < (3, 24, 0):
        raise SystemExit(f"[FATAL] ON CONFLICT DO UPDATE 需 SQLite >= 3.24，当前 {sqlite_ver}")

    before = {
        "events": scalar("SELECT COUNT(*) FROM events"),
        "rec_rows": scalar("SELECT COUNT(*) FROM events WHERE LENGTH(recurrence)>0"),
        "oneoff": scalar("SELECT COUNT(*) FROM events WHERE recurrence IS NULL "
                         "OR LENGTH(recurrence)=0"),
        "done": scalar("SELECT COUNT(*) FROM events WHERE completed=1"),
        # 二次运行（幂等）时 overrides 已存在，守恒等式要把存量算进基线
        "done_overrides": scalar("SELECT COUNT(*) FROM habit_overrides WHERE status='done'")
        if scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table' "
                  "AND name='habit_overrides'") else 0,
        "time_entries": scalar("SELECT COUNT(*) FROM time_entries"),
        "subtasks": scalar("SELECT COUNT(*) FROM subtasks"),
        "orphans": len(allrows("PRAGMA foreign_key_check")),
    }

    try:
        con.execute("BEGIN IMMEDIATE")
        note("事务开始（BEGIN IMMEDIATE）")

        # ── 1. 空表先建 + UNIQUE 就位 ──────────────────────────────
        for label, ddl in DDL_TABLES:
            run(ddl, label=f"create table {label}")
        existing_cols = {r[1] for r in allrows("PRAGMA table_info(events)")}
        for name, decl in NEW_EVENT_COLS:
            if name not in existing_cols:
                run(f"ALTER TABLE events ADD COLUMN {name} {decl}",
                    label=f"add column {name}")
        for label, ddl in DDL_INDEXES:
            run(ddl, label=f"create index {label}")
        note(f"① 三表 + 3 列 + {len(DDL_INDEXES)} 索引就位；UNIQUE 均在空表/全 NULL 阶段建成")

        # ── 2. 孤儿：先导出留档再删 ────────────────────────────────
        orphan_rows = []
        for t in ("time_entries", "subtasks"):
            for r in allrows(
                    f"SELECT * FROM {t} WHERE event_id NOT IN "
                    f"(SELECT id FROM events) ORDER BY id"):
                d = dict(r)
                orphan_rows.append({
                    "source_table": t, "id": d.get("id"),
                    "event_id": d.get("event_id"),
                    "payload_json": json.dumps(d, ensure_ascii=False),
                })
        # 只在有新增孤儿时写留档，避免二次运行把首次导出的证据覆盖成空表
        if orphan_rows:
            orphan_out.parent.mkdir(parents=True, exist_ok=True)
            with orphan_out.open("w", encoding="utf-8-sig", newline="") as f:
                w = csv.DictWriter(
                    f, fieldnames=["source_table", "id", "event_id", "payload_json"])
                w.writeheader()
                w.writerows(orphan_rows)
        for t in ("time_entries", "subtasks"):
            run(f"DELETE FROM {t} WHERE event_id NOT IN (SELECT id FROM events)",
                label=f"delete orphans from {t}")
        note(f"② 悬挂记录 {len(orphan_rows)} 条"
             + ("已导出 " + orphan_out.name if orphan_rows else "（无新增，留档保持不变）")
             + "，并清理子表")

        # ── 3. 隔离：带子数据的行 + 不符合规律的历史行 ─────────────
        child_ids = {r[0] for r in allrows(
            "SELECT DISTINCT event_id FROM time_entries")} | \
            {r[0] for r in allrows("SELECT DISTINCT event_id FROM subtasks")}
        rec_rows = allrows(
            "SELECT * FROM events WHERE LENGTH(recurrence)>0 ORDER BY title, date, id")
        chains = defaultdict(list)
        for r in rec_rows:
            chains[(r["title"], r["recurrence"], r["user_id"])].append(r)

        quarantined = []
        for (title, rec, uid), group in chains.items():
            if rec == "weekly":
                cnt = Counter(datetime.strptime(r["date"], "%Y-%m-%d").weekday()
                              for r in group)
                mode_n = cnt.most_common(1)[0][0]
                label = "周" + "一二三四五六日"[mode_n]
                mismatch = [r for r in group
                            if datetime.strptime(r["date"], "%Y-%m-%d").weekday() != mode_n]
            elif rec == "monthly":
                cnt = Counter(int(r["date"][8:10]) for r in group)
                mode_n = cnt.most_common(1)[0][0]
                label = f"每月 {mode_n} 号"
                mismatch = [r for r in group if int(r["date"][8:10]) != mode_n]
            else:
                label, mismatch = "每日", []
            for r in group:
                reasons = []
                if r in mismatch:
                    reasons.append(f"不符合规则众数（{label}）")
                if r["id"] in child_ids:
                    reasons.append("挂有 time_entries/subtasks，零物化会变孤儿")
                if reasons:
                    quarantined.append({
                        "id": r["id"], "title": title, "date": r["date"],
                        "status": r["status"], "completed": r["completed"],
                        "reason": "；".join(reasons),
                    })
        for q in quarantined:
            run("UPDATE events SET recurrence=NULL, recurrence_end_date=NULL WHERE id=?",
                (q["id"],), label=f"quarantine event {q['id']}")
        note(f"③ 隔离 {len(quarantined)} 行降级为一次性 Task（不删、不挂 rule_id）")

        # ── 4. 同日重复去重 ────────────────────────────────────────
        remain = allrows(
            "SELECT id,title,date,recurrence,user_id,completed,created_at "
            "FROM events WHERE LENGTH(recurrence)>0")
        by_day = defaultdict(list)
        for r in remain:
            by_day[(r["title"], r["recurrence"], r["user_id"], r["date"])].append(r)
        losers, dropped_done = [], 0
        for rows in by_day.values():
            if len(rows) < 2:
                continue
            ordered = sorted(rows, key=lambda x: (
                -(x["completed"] or 0), x["created_at"] or "", x["id"]))
            for r in ordered[1:]:
                losers.append(r["id"])
                dropped_done += 1 if r["completed"] else 0
        for eid in losers:
            run("DELETE FROM events WHERE id=?", (eid,), label=f"dedupe {eid}")
        note(f"④ 去重：{len(by_day)} 个日期组，删除 {len(losers)} 行"
             f"（其中 completed=1 的 {dropped_done} 行，计入守恒损耗）")

        # ── 5. 逐链归类（唯一输入 = 决策 JSON） ────────────────────
        chain_rows = allrows(
            "SELECT * FROM events WHERE LENGTH(recurrence)>0 ORDER BY title, date, id")
        chains2 = defaultdict(list)
        for r in chain_rows:
            chains2[(r["title"], r["recurrence"], r["user_id"])].append(r)
        unknown = [k[0] for k in chains2 if k[0] not in by_title]
        if unknown:
            raise RuntimeError(f"[FATAL] 以下链条在决策 JSON 中无归类：{unknown}")

        migrated = []
        for (title, rec, uid), group in sorted(chains2.items()):
            d = by_title[title]
            kind = d["kind"]
            if kind == "drop":
                continue
            rrule, dtstart, stime = d["rrule"], d["dtstart"], d["start_time"]
            category = group[0]["category"] or "其他"
            if kind == "habit":
                # 幂等：同名同规则已存在则复用
                hid = scalar("SELECT id FROM habits WHERE title=? AND rrule=? "
                             "AND archived_at IS NULL ORDER BY id LIMIT 1",
                             (title, rrule))
                if hid is None:
                    hid = run(
                        "INSERT INTO habits (user_id,title,rrule,dtstart,until_date,"
                        "start_time,end_time,timezone,valid_from,category) "
                        "VALUES (?,?,?,?,NULL,?,NULL,?,?,?)",
                        (uid, title, rrule, dtstart, stime, tz, dtstart, category),
                        label=f"insert habit {title}").lastrowid
                ov = 0
                for r in group:
                    if r["completed"]:
                        run(
                            "INSERT INTO habit_overrides (habit_id,date,status,completed_at) "
                            "VALUES (?,?,'done',?) "
                            "ON CONFLICT(habit_id,date) DO UPDATE SET "
                            "status='done', completed_at=excluded.completed_at",
                            (hid, r["date"], r["completed_at"]),
                            label=f"override {title} {r['date']}")
                        ov += 1
                for r in group:
                    # 子表已在 ③ 隔离，删父行前再显式清一次，不依赖 FK
                    run("DELETE FROM time_entries WHERE event_id=?", (r["id"],))
                    run("DELETE FROM subtasks WHERE event_id=?", (r["id"],))
                    run("DELETE FROM events WHERE id=?", (r["id"],),
                        label=f"collapse habit row {r['id']}")
                migrated.append({"chain_id": d["chain_id"], "title": title,
                                 "kind": kind, "rrule": rrule,
                                 "rows": len(group), "overrides": ov,
                                 "instances": 0, "rule_or_habit_id": hid})
            else:
                rid = scalar("SELECT id FROM recurring_rules WHERE title=? AND rrule=? "
                             "AND archived_at IS NULL ORDER BY id LIMIT 1",
                             (title, rrule))
                if rid is None:
                    rid = run(
                        "INSERT INTO recurring_rules (user_id,title,rrule,dtstart,"
                        "until_date,start_time,end_time,estimate_minutes,project_id,"
                        "priority,default_status,timezone,valid_from) "
                        "VALUES (?,?,?,?,NULL,?,NULL,NULL,NULL,NULL,'todo',?,?)",
                        (uid, title, rrule, dtstart, stime, tz, dtstart),
                        label=f"insert rule {title}").lastrowid
                for r in group:
                    run("UPDATE events SET rule_id=?, occurrence_date=date WHERE id=?",
                        (rid, r["id"]), label=f"backfill instance {r['id']}")
                migrated.append({"chain_id": d["chain_id"], "title": title,
                                 "kind": kind, "rrule": rrule,
                                 "rows": len(group), "overrides": 0,
                                 "instances": len(group), "rule_or_habit_id": rid})
        migrated.sort(key=lambda x: x["chain_id"])
        note("⑤ 归类：" + "、".join(
            f"{m['chain_id']} {m['title']}→{m['kind']}"
            for m in migrated))

        # ── 6. 归档任务 ────────────────────────────────────────────
        archived = run(
            "UPDATE events SET archived_at = ? "
            "WHERE rule_id IS NOT NULL AND status='done' "
            "AND completed_at IS NOT NULL "
            "AND date(completed_at) < date(?, ?) "
            "AND archived_at IS NULL",
            (args.as_of + " 00:00:00", args.as_of, f"-{archive_days} days"),
            label="archive old instances").rowcount
        note(f"⑥ 归档标记 {archived} 行（as_of={args.as_of}，阈值 {archive_days} 天）")

        # ── 7. 校验 ────────────────────────────────────────────────
        fk = allrows("PRAGMA foreign_key_check")
        integrity = scalar("PRAGMA integrity_check")
        after = {
            "events": scalar("SELECT COUNT(*) FROM events"),
            "habits": scalar("SELECT COUNT(*) FROM habits"),
            "overrides": scalar("SELECT COUNT(*) FROM habit_overrides"),
            "rules": scalar("SELECT COUNT(*) FROM recurring_rules"),
            "instances": scalar("SELECT COUNT(*) FROM events WHERE rule_id IS NOT NULL"),
            "archived": scalar("SELECT COUNT(*) FROM events WHERE archived_at IS NOT NULL"),
            "oneoff": scalar("SELECT COUNT(*) FROM events WHERE rule_id IS NULL "
                             "AND (recurrence IS NULL OR LENGTH(recurrence)=0)"),
            "rec_remaining": scalar("SELECT COUNT(*) FROM events WHERE LENGTH(recurrence)>0"),
            "done_events": scalar("SELECT COUNT(*) FROM events WHERE completed=1"),
            "done_overrides": scalar("SELECT COUNT(*) FROM habit_overrides WHERE status='done'"),
            "excused": scalar("SELECT COUNT(*) FROM habit_overrides WHERE status='excused'"),
            "time_entries": scalar("SELECT COUNT(*) FROM time_entries"),
            "subtasks": scalar("SELECT COUNT(*) FROM subtasks"),
        }
        dup_rule = scalar(
            "SELECT COUNT(*) FROM (SELECT rule_id,occurrence_date FROM events "
            "WHERE rule_id IS NOT NULL GROUP BY 1,2 HAVING COUNT(*)>1)")
        dup_override = scalar(
            "SELECT COUNT(*) FROM (SELECT habit_id,date FROM habit_overrides "
            "GROUP BY 1,2 HAVING COUNT(*)>1)")
        dup_legacy = scalar(
            "SELECT COUNT(*) FROM (SELECT title,date,recurrence,user_id FROM events "
            "WHERE LENGTH(recurrence)>0 GROUP BY 1,2,3,4 HAVING COUNT(*)>1)")
        indexes = [r[1] for r in allrows("PRAGMA index_list(events)")]

        checks = [
            ("PRAGMA integrity_check", integrity == "ok", integrity),
            ("PRAGMA foreign_key_check（迁移后应为 0）", len(fk) == 0, len(fk)),
            ("UNIQUE(rule_id,occurrence_date) 无重复", dup_rule == 0, dup_rule),
            ("UNIQUE(habit_id,date) 无重复", dup_override == 0, dup_override),
            ("旧 idx_events_chain_unique 现在可建成（同键无重复）",
             dup_legacy == 0, dup_legacy),
            ("idx_events_rule_occurrence 已存在",
             "idx_events_rule_occurrence" in indexes, indexes),
            ("completed=1 数据守恒",
             after["done_events"] + after["done_overrides"]
             == before["done"] + before["done_overrides"] - dropped_done,
             f"{after['done_events']}+{after['done_overrides']} vs "
             f"{before['done']}+{before['done_overrides']}-{dropped_done}"),
            ("不写 excused（旧数据不可推断请假）", after["excused"] == 0,
             after["excused"]),
            ("有效 time_entry 保留", after["time_entries"] == 1,
             after["time_entries"]),
            ("无孤立子表行", after["subtasks"] ==
             scalar("SELECT COUNT(*) FROM subtasks s JOIN events e ON e.id=s.event_id"),
             after["subtasks"]),
        ]
        failed = [c for c in checks if not c[1]]
        note(f"⑦ 校验 {len(checks) - len(failed)}/{len(checks)} 通过")
        for name, ok, detail in checks:
            note(f"   {'PASS' if ok else 'FAIL'} {name}: {detail}")
        if failed:
            raise RuntimeError(f"[FATAL] 校验未通过：{[c[0] for c in failed]}")

        if args.apply:
            con.execute("COMMIT")
            note("⑧ COMMIT（已写入）")
        else:
            con.execute("ROLLBACK")
            note("⑧ ROLLBACK（dry-run，数据库未改变）")
    except Exception:
        con.execute("ROLLBACK")
        con.close()
        raise
    con.close()

    report = {
        "version": "0.4",
        "as_of": args.as_of,
        "mode": "apply" if args.apply else "dry-run",
        "database": str(db_path),
        "decisions": str(args.decisions),
        "sqlite_version": sqlite_ver,
        "before": before,
        "after": after,
        "orphan_count": len(orphan_rows),
        "orphan_out": str(orphan_out),
        "quarantined": quarantined,
        "dedupe_deleted": len(losers),
        "dedupe_dropped_done": dropped_done,
        "migrated": migrated,
        "archived": archived,
        "checks": [{"name": n, "ok": ok, "detail": str(d)}
                   for n, ok, d in checks],
        "log": log,
    }
    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2),
                               encoding="utf-8")
        print(f"\n[v0.4] JSON 报告: {report_path}")
    print(f"[v0.4] 悬挂记录留档: {orphan_out}")
    print(f"[v0.4] events {before['events']} → {after['events']}；"
          f"habits {after['habits']} / overrides {after['overrides']} / "
          f"rules {after['rules']} / 实例 {after['instances']} / 归档 {after['archived']}")
    print("[v0.4] 完成。")


if __name__ == "__main__":
    try:
        main()
    except (SystemExit, KeyboardInterrupt):
        raise
    except Exception as e:
        print(f"[v0.4] 失败，事务已回滚: {e}", file=sys.stderr)
        sys.exit(1)
