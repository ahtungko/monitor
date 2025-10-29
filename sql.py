# -*- coding: utf-8 -*-
import datetime
import os
import sqlite3

import pytz

DB_PATH = 'monitor.db'
PENDING_STATE = 2

JAKARTA_TZ = pytz.timezone('Asia/Jakarta')
MALAYSIA_TZ = pytz.timezone('Asia/Kuala_Lumpur')
UTC = pytz.utc

DATE_PATTERNS = (
    '%Y-%m-%d',
    '%Y/%m/%d',
    '%B %d, %Y',
    '%b %d, %Y',
)

DATETIME_PATTERNS = (
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%d %H:%M',
    '%Y/%m/%d %H:%M:%S',
    '%Y/%m/%d %H:%M',
    '%B %d, %Y %H:%M',
    '%b %d, %Y %H:%M',
    '%B %d, %Y %I:%M %p',
    '%b %d, %Y %I:%M %p',
)

_EXPIRY_BACKFILL_DONE = False

def connSqlite():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn):
    global _EXPIRY_BACKFILL_DONE
    cursor = conn.cursor()
    cursor.execute(
        '''CREATE TABLE IF NOT EXISTS vps
                    (id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    ops TEXT,
                    cookie TEXT,
                    creation_date TEXT,
                    valid_until TEXT,
                    location TEXT,
                    ipv6 TEXT,
                    ram TEXT,
                    disk_total TEXT,
                    update_time TEXT,
                    state INTEGER DEFAULT 0,
                    expiry_utc TEXT)
                '''
    )
    cursor.execute(
        '''CREATE TABLE IF NOT EXISTS send
                    (id INTEGER PRIMARY KEY AUTOINCREMENT,
                    monitor_id INTEGER,
                    content TEXT,
                    flag INTEGER,
                    date TEXT DEFAULT (datetime('now', 'localtime')))
                '''
    )
    cursor.execute('PRAGMA table_info(vps)')
    columns = {row[1] for row in cursor.fetchall()}
    if 'expiry_utc' not in columns:
        cursor.execute('ALTER TABLE vps ADD COLUMN expiry_utc TEXT')
    conn.commit()
    if not _EXPIRY_BACKFILL_DONE:
        _backfill_expiry_utc(conn)
        _EXPIRY_BACKFILL_DONE = True


def _parse_date_string(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    for pattern in DATE_PATTERNS:
        try:
            return datetime.datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    try:
        normalized = text.replace('Z', '+00:00') if 'Z' in text else text
        parsed = datetime.datetime.fromisoformat(normalized)
        return parsed.date()
    except ValueError:
        return None


def _parse_localized_datetime(value, timezone):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    normalized = text.replace('Z', '+00:00') if 'Z' in text else text
    try:
        parsed = datetime.datetime.fromisoformat(normalized)
    except ValueError:
        parsed = None
    if parsed is not None:
        if parsed.tzinfo is None:
            return timezone.localize(parsed)
        return parsed.astimezone(timezone)
    for pattern in DATETIME_PATTERNS:
        try:
            naive = datetime.datetime.strptime(text, pattern)
            return timezone.localize(naive)
        except ValueError:
            continue
    date_value = _parse_date_string(text)
    if date_value is None:
        return None
    naive_midnight = datetime.datetime.combine(date_value, datetime.time.min)
    return timezone.localize(naive_midnight)


def _parse_iso_datetime(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    normalized = text.replace('Z', '+00:00') if 'Z' in text else text
    try:
        parsed = datetime.datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.astimezone(UTC)


def calculate_expiry_utc(creation_value, valid_value):
    expiry_local = _parse_localized_datetime(valid_value, JAKARTA_TZ)
    if expiry_local is None:
        creation_local = _parse_localized_datetime(creation_value, JAKARTA_TZ)
        if creation_local is not None:
            anchor = creation_local.replace(hour=0, minute=0, second=0, microsecond=0)
            expiry_local = JAKARTA_TZ.normalize(anchor + datetime.timedelta(days=5))
        else:
            creation_date = _parse_date_string(creation_value)
            if creation_date is not None:
                anchor = datetime.datetime.combine(creation_date, datetime.time.min)
                localized_anchor = JAKARTA_TZ.localize(anchor)
                expiry_local = JAKARTA_TZ.normalize(localized_anchor + datetime.timedelta(days=5))
    if expiry_local is None:
        return None
    return expiry_local.replace(microsecond=0).astimezone(UTC)


def format_malaysia_display(expiry_dt_utc):
    if expiry_dt_utc is None:
        return ''
    target = expiry_dt_utc.astimezone(MALAYSIA_TZ)
    date_part = f"{target.day} {target.strftime('%b %Y')}"
    time_part = target.strftime('%I:%M %p')
    if time_part.startswith('0'):
        time_part = time_part[1:]
    return f'{date_part}, {time_part} MYT'


def resolve_expiry_values(creation_value, valid_value, expiry_value):
    expiry_dt = _parse_iso_datetime(expiry_value)
    if expiry_dt is None:
        expiry_dt = calculate_expiry_utc(creation_value, valid_value)
    if expiry_dt is None:
        return None, None, ''
    expiry_utc = expiry_dt.astimezone(UTC).replace(microsecond=0)
    return expiry_utc, expiry_utc.isoformat(), format_malaysia_display(expiry_utc)


def _backfill_expiry_utc(conn):
    cursor = conn.cursor()
    try:
        cursor.execute('SELECT id, creation_date, valid_until, expiry_utc FROM vps')
    except sqlite3.OperationalError:
        return
    rows = cursor.fetchall()
    updates = []
    for row in rows:
        expiry_dt = calculate_expiry_utc(row['creation_date'], row['valid_until'])
        expiry_iso = expiry_dt.isoformat() if expiry_dt is not None else None
        existing_iso = row['expiry_utc']
        if expiry_iso != existing_iso:
            updates.append((expiry_iso, row['id']))
    if updates:
        cursor.executemany('UPDATE vps SET expiry_utc=? WHERE id=?', updates)
        conn.commit()


def update_expiry_utc(id, expiry_iso):
    if not expiry_iso:
        return
    conn = connSqlite()
    cursor = conn.cursor()
    cursor.execute('update vps set expiry_utc=? where id=?', (expiry_iso, id))
    conn.commit()
    conn.close()

def addSql(name, ops, cookie):
    conn = connSqlite()
    exec = conn.cursor()
    exec.execute(
        "insert into vps(name, ops, cookie, state) values(?, ?, ?, ?)",
        (name, ops, cookie, PENDING_STATE),
    )
    conn.commit()
    conn.close()


def selectSql():
    conn = connSqlite()
    exec = conn.cursor()
    exec.execute('select * from vps')
    res = exec.fetchall()
    conn.close()
    return res


def selectSql_VPS_ID(id):
    conn = connSqlite()
    exec = conn.cursor()
    exec.execute('select * from vps where id = ?',(id,))
    res = exec.fetchall()
    conn.close()
    return res


def updateInfoSql(creation_date, valid_until, location, ipv6, ram, disk_total, id):
    conn = connSqlite()
    cursor = conn.cursor()
    expiry_dt = calculate_expiry_utc(creation_date, valid_until)
    expiry_iso = expiry_dt.isoformat() if expiry_dt is not None else None
    cursor.execute(
        "update vps set creation_date=?, valid_until=?, location=?, ipv6=?, ram=?, disk_total=?, update_time=?, state=?, expiry_utc=? where id=?",
        (
            creation_date,
            valid_until,
            location,
            ipv6,
            ram,
            disk_total,
            datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
            1,
            expiry_iso,
            id,
        ),
    )
    conn.commit()
    conn.close()


def updateState(state, id):
    conn = connSqlite()
    exec = conn.cursor()
    exec.execute("update vps set state=? where id=?",(state, id))
    conn.commit()
    conn.close()


def updateVps(name, ops, cookie, id):
    conn = connSqlite()
    exec = conn.cursor()
    exec.execute("update vps set name=?, ops=?, cookie=? where id=?",(name, ops, cookie, id))
    conn.commit()
    conn.close()


def deleteVps(id):
    conn = connSqlite()
    try:
        cursor = conn.cursor()
        cursor.execute("delete from vps where id=?", (id,))
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def addSend(m_id, msg, flag):
    conn = connSqlite()
    exec = conn.cursor()
    exec.execute("insert into send(monitor_id, content, flag) values(?, ?, ?)",(m_id, msg, flag))
    conn.commit()
    conn.close()


def selectSend(m_id, flag):
    conn = connSqlite()
    exec = conn.cursor()
    exec.execute("select * from send where monitor_id = ? and flag = ? order by date DESC LIMIT 1",(m_id, flag))
    res = exec.fetchall()
    conn.close()
    return res