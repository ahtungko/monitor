# -*- coding: utf-8 -*-
import datetime
import logging
import time
from typing import Any, Dict, Optional, Set, Tuple

import requests
from bs4 import BeautifulSoup

from sql import *
from send import *


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('[%(asctime)s] %(levelname)s %(name)s: %(message)s'))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False

STATE_ABNORMAL = 0
STATE_NORMAL = 1
STATE_PENDING = 2

REQUEST_TIMEOUT = 15
REQUEST_MAX_ATTEMPTS = 3
REQUEST_RETRY_DELAY = 2
INITIAL_WARMUP_SECONDS = 3

NEW_ENTRY_FAILURE_THRESHOLD = 3
EXISTING_FAILURE_THRESHOLD = 2

REQUIRED_LABELS = (
    'VPS Creation Date',
    'Valid until',
    'IPv6',
    'Location',
    'Total disk space',
    'Ram',
)
ESSENTIAL_KEYS = ('VPS Creation Date', 'Valid until')

PROVIDER_CONFIGS = {
    'hax': {
        'label': 'Hax',
        'url': 'https://hax.co.id/vps-info/',
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
        },
        'cookie_header': 'Cookie',
    },
    'woiden': {
        'label': 'Woiden',
        'url': 'https://woiden.id/vps-info/',
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
        },
        'cookie_header': 'Cookie',
    },
    'vc': {
        'label': 'VC',
        'url': 'https://free.vps.vc/vps-info',
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Referer': 'https://free.vps.vc/',
        },
        'cookie_header': 'Cookie',
    },
}

RENEWAL_URLS = {
    'vc': 'https://free.vps.vc/vps-renew',
    'hax': 'https://hax.co.id/vps-renew/',
    'woiden': 'https://woiden.id/vps-renew/',
}

TWO_DAY_THRESHOLD = datetime.timedelta(days=2)
HOURLY_REMINDER_INTERVAL = datetime.timedelta(hours=1)

_expiry_reminder_state: Dict[int, Dict[str, Any]] = {}

_status_tracker: Dict[int, Dict[str, Any]] = {}


def _now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _ensure_tracker(vps_id: int, initial_state: Optional[int] = None) -> Dict[str, Any]:
    entry = _status_tracker.get(vps_id)
    if entry is None:
        entry = {
            'consecutive_failures': 0,
            'consecutive_successes': 0,
            'last_applied_state': initial_state,
            'last_success_at': None,
            'first_seen_at': _now_utc(),
            'last_error': None,
            'last_checked_at': None,
        }
        _status_tracker[vps_id] = entry
    elif entry.get('last_applied_state') is None and initial_state is not None:
        entry['last_applied_state'] = initial_state
    return entry


def _cleanup_tracker(active_ids):
    stale_ids = [vid for vid in _status_tracker.keys() if vid not in active_ids]
    for vid in stale_ids:
        _status_tracker.pop(vid, None)


def _cleanup_expiry_tracker(active_ids: Set[int]):
    stale_ids = [vid for vid in list(_expiry_reminder_state.keys()) if vid not in active_ids]
    for vid in stale_ids:
        _expiry_reminder_state.pop(vid, None)
        try:
            clear_pending_pwa_notifications(vid, types=('expiry-warning', 'expiry-hourly'))
        except Exception as exc:
            logger.exception('Failed to clear pending PWA notifications for removed VPS %s: %s', vid, exc)


def _reset_expiry_state(vps_id: int):
    _expiry_reminder_state.pop(vps_id, None)


def _ensure_expiry_state(vps_id: int, expiry_iso: Optional[str]) -> Optional[Dict[str, Any]]:
    if not expiry_iso:
        _reset_expiry_state(vps_id)
        return None
    state = _expiry_reminder_state.get(vps_id)
    if state and state.get('expiry_iso') != expiry_iso:
        try:
            clear_pending_pwa_notifications(vps_id, types=('expiry-warning', 'expiry-hourly'))
        except Exception as exc:
            logger.exception('Failed to clear pending PWA notifications for VPS %s: %s', vps_id, exc)
        state = None
    if state is None:
        state = {
            'expiry_iso': expiry_iso,
            'urgent': False,
            'last_slot_index': None,
            'last_notification_at': None,
            'last_remaining_seconds': None,
            'initial_seeded': False,
        }
        _expiry_reminder_state[vps_id] = state
    return state


def _resolve_renewal_url(provider_key: Optional[str]) -> Optional[str]:
    if not provider_key:
        return None
    key = str(provider_key).strip().lower()
    return RENEWAL_URLS.get(key)


def _format_remaining_time(delta: datetime.timedelta) -> Tuple[str, int]:
    if delta is None:
        return '', 0
    total_seconds = int(delta.total_seconds())
    if total_seconds <= 0:
        return '不足 1 分钟', 0
    days, remainder = divmod(total_seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes = remainder // 60
    parts = []
    if days:
        parts.append(f'{days} 天')
    if hours:
        parts.append(f'{hours} 小时')
    if not days and minutes:
        parts.append(f'{minutes} 分钟')
    text = '约 ' + ' '.join(parts) if parts else '不足 1 分钟'
    return text, total_seconds


def _clear_expiry_notifications(vps_id: int, *notification_types: str):
    try:
        if notification_types:
            clear_pending_pwa_notifications(vps_id, notification_types)
        else:
            clear_pending_pwa_notifications(vps_id)
    except Exception as exc:
        logger.exception('Failed to clear pending PWA notifications for VPS %s: %s', vps_id, exc)


def _schedule_initial_expiry_notification(
    vps_id: int,
    display_name: str,
    provider_display: str,
    pretty_time: str,
    expiry_dt: datetime.datetime,
    expiry_iso: str,
    renew_url: Optional[str],
    state: Optional[Dict[str, Any]] = None,
):
    if state is not None and not state.get('initial_seeded'):
        _clear_expiry_notifications(vps_id, 'expiry-warning')
        state['initial_seeded'] = True

    schedule_point = expiry_dt - TWO_DAY_THRESHOLD
    remaining_text, remaining_seconds = _format_remaining_time(TWO_DAY_THRESHOLD)
    title = f'{display_name}：{remaining_text} 后到期' if remaining_text else f'{display_name} 即将到期'
    body_lines = [
        f'服务商：{provider_display}',
        f'名称：{display_name}',
        f'到期时间：{pretty_time}',
    ]
    if remaining_text:
        body_lines.append(f'剩余时间：{remaining_text}')
    body_lines.append('提醒：距离到期仅剩 48 小时，请尽快续期。')
    if renew_url:
        body_lines.append(f'续期地址：{renew_url}')

    data = {
        'type': 'expiry-warning',
        'reminderType': 'expiry-warning',
        'vpsId': vps_id,
        'provider': provider_display,
        'expiryIso': expiry_iso,
        'expiryDisplay': pretty_time,
        'remainingSeconds': remaining_seconds,
        'scheduledFor': schedule_point.isoformat(),
    }
    if renew_url:
        data['renewUrl'] = renew_url

    options = {
        'body': '\n'.join(body_lines),
        'icon': '/icons/app-icon-192.png',
        'badge': '/icons/app-icon-96.png',
        'tag': f'expiry-{vps_id}',
        'requireInteraction': True,
        'data': data,
        'actions': [
            {'action': 'open', 'title': '打开监控面板'},
        ],
    }

    dedupe_key = f'expiry-warning:{vps_id}:{expiry_iso}'
    try:
        queue_pwa_notification(
            vps_id,
            'expiry-warning',
            title,
            options,
            scheduled_for=schedule_point,
            dedupe_key=dedupe_key,
        )
    except Exception as exc:
        logger.exception('Failed to queue 2-day PWA notification for VPS %s: %s', vps_id, exc)


def _schedule_hourly_expiry_notification(
    vps_id: int,
    display_name: str,
    provider_display: str,
    provider_key: str,
    name_label: str,
    pretty_time: str,
    expiry_dt: datetime.datetime,
    expiry_iso: str,
    renew_url: Optional[str],
    now_utc: datetime.datetime,
    state: Optional[Dict[str, Any]],
    time_until_expiry: datetime.timedelta,
):
    start_time = expiry_dt - TWO_DAY_THRESHOLD
    if now_utc < start_time:
        return

    elapsed_seconds = int((now_utc - start_time).total_seconds())
    interval_seconds = int(HOURLY_REMINDER_INTERVAL.total_seconds()) or 3600
    slot_index = elapsed_seconds // interval_seconds if elapsed_seconds >= 0 else 0

    if state and state.get('last_slot_index') == slot_index:
        return

    slot_time = start_time + datetime.timedelta(hours=slot_index)
    remaining_text, remaining_seconds = _format_remaining_time(time_until_expiry)
    title = f'{display_name}：剩余 {remaining_text}' if remaining_text else f'{display_name} 即将到期'

    body_lines = [
        f'服务商：{provider_display}',
        f'名称：{display_name}',
        f'到期时间：{pretty_time}',
    ]
    if remaining_text:
        body_lines.append(f'剩余时间：{remaining_text}')
    else:
        body_lines.append('剩余时间：不足 1 分钟')
    body_lines.append('请尽快续期以保持服务正常运行。')
    if renew_url:
        body_lines.append(f'续期地址：{renew_url}')

    data = {
        'type': 'expiry-hourly',
        'reminderType': 'expiry-hourly',
        'vpsId': vps_id,
        'provider': provider_display,
        'providerKey': provider_key,
        'name': name_label or display_name,
        'expiryIso': expiry_iso,
        'expiryDisplay': pretty_time,
        'remainingSeconds': remaining_seconds,
        'reminderSlot': slot_index,
        'scheduledFor': slot_time.isoformat(),
        'urgent': True,
    }
    if renew_url:
        data['renewUrl'] = renew_url

    options = {
        'body': '\n'.join(body_lines),
        'icon': '/icons/app-icon-192.png',
        'badge': '/icons/app-icon-96.png',
        'tag': f'expiry-{vps_id}',
        'requireInteraction': True,
        'data': data,
        'actions': [
            {'action': 'open', 'title': '打开监控面板'},
        ],
    }

    dedupe_key = f'expiry-hourly:{vps_id}:{expiry_iso}:{slot_index}'
    try:
        queue_pwa_notification(
            vps_id,
            'expiry-hourly',
            title,
            options,
            scheduled_for=slot_time,
            dedupe_key=dedupe_key,
        )
    except Exception as exc:
        logger.exception('Failed to queue hourly PWA notification for VPS %s: %s', vps_id, exc)
    else:
        if state is not None:
            state['urgent'] = True
            state['last_slot_index'] = slot_index
            state['last_notification_at'] = slot_time
            state['last_remaining_seconds'] = remaining_seconds


def _is_new_vps(vps, entry: Dict[str, Any]) -> bool:
    update_time = vps['update_time']
    if update_time:
        return False
    return entry.get('last_success_at') is None


def _should_skip_initial_warmup(vps, entry: Dict[str, Any]) -> float:
    if not _is_new_vps(vps, entry):
        return 0.0
    first_seen = entry.get('first_seen_at') or _now_utc()
    entry['first_seen_at'] = first_seen
    elapsed = (_now_utc() - first_seen).total_seconds()
    remaining = INITIAL_WARMUP_SECONDS - elapsed
    if remaining > 0:
        return remaining
    return 0.0


def _build_headers(config: Dict[str, Any], vps) -> Dict[str, str]:
    headers = dict(config.get('headers') or {})
    cookie_header = config.get('cookie_header', 'Cookie')
    headers[cookie_header] = str(vps['cookie'] or '')
    return headers


def _fetch_provider_page(url: str, headers: Dict[str, str], provider_label: str) -> str:
    last_error: Optional[Exception] = None
    for attempt in range(1, REQUEST_MAX_ATTEMPTS + 1):
        try:
            response = requests.get(url=url, headers=headers, timeout=REQUEST_TIMEOUT)
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            last_error = exc
            logger.warning('[%s] Request attempt %s failed: %s', provider_label, attempt, exc)
            if attempt < REQUEST_MAX_ATTEMPTS:
                time.sleep(REQUEST_RETRY_DELAY)
    if last_error:
        raise last_error
    raise RuntimeError('Unexpected request failure')


def _parse_vps_info(html: str) -> Tuple[Optional[Dict[str, str]], Optional[str]]:
    soup = BeautifulSoup(html, 'html.parser')
    if soup is None:
        return None, 'unable to parse response'
    keys = soup.find_all('label', {'class': 'col-sm-5 col-form-label'})
    values = soup.find_all('div', {'class': 'col-sm-7'})
    info: Dict[str, str] = {}
    for key_el, value_el in zip(keys, values):
        label = key_el.get_text(strip=True)
        if label in REQUIRED_LABELS:
            info[label] = value_el.get_text(strip=True)
    has_required = all(info.get(field) for field in ESSENTIAL_KEYS)
    if has_required:
        return info, None
    html_lower = html.lower()
    if soup.find('form', {'id': 'loginform'}) or 'loginform' in html_lower:
        return None, 'login form detected, cookie may be expired'
    if soup.find('input', {'name': 'log'}) or soup.find('input', {'name': 'pwd'}):
        return None, 'authentication page detected'
    return None, 'required VPS fields missing'


def _mark_success(vps_id: int, provider_label: str, entry: Dict[str, Any]):
    previous_state = entry.get('last_applied_state')
    entry['consecutive_failures'] = 0
    entry['consecutive_successes'] = entry.get('consecutive_successes', 0) + 1
    entry['last_success_at'] = _now_utc()
    entry['last_error'] = None
    entry['last_applied_state'] = STATE_NORMAL
    if previous_state != STATE_NORMAL:
        logger.info('[%s] VPS %s marked as normal', provider_label, vps_id)
    else:
        logger.debug('[%s] VPS %s check succeeded (state unchanged)', provider_label, vps_id)


def _persist_success(vps, config: Dict[str, Any], entry: Dict[str, Any], info: Dict[str, str]):
    vps_id = vps['id']
    provider_label = config['label']
    creation_date = info.get('VPS Creation Date') or ''
    valid_until = info.get('Valid until') or ''
    location = info.get('Location') or ''
    ipv6 = info.get('IPv6') or ''
    ram = info.get('Ram') or ''
    disk_total = info.get('Total disk space') or ''
    try:
        updateInfoSql(creation_date, valid_until, location, ipv6, ram, disk_total, vps_id)
    except Exception as exc:
        logger.exception('[%s] Failed to persist info for VPS %s: %s', provider_label, vps_id, exc)
        try:
            updateState(STATE_NORMAL, vps_id)
        except Exception:
            logger.exception('[%s] Failed to set VPS %s state to normal after persistence error', provider_label, vps_id)
    _mark_success(vps_id, provider_label, entry)


def _record_failure(vps, config: Dict[str, Any], entry: Dict[str, Any], reason: str):
    vps_id = vps['id']
    provider_label = config['label']
    entry['consecutive_successes'] = 0
    entry['consecutive_failures'] = entry.get('consecutive_failures', 0) + 1
    entry['last_error'] = reason
    entry['last_checked_at'] = _now_utc()
    threshold = NEW_ENTRY_FAILURE_THRESHOLD if _is_new_vps(vps, entry) else EXISTING_FAILURE_THRESHOLD
    attempts = entry['consecutive_failures']
    if attempts < threshold:
        logger.info('[%s] VPS %s check failed (%s) — attempt %s/%s (debounced)', provider_label, vps_id, reason, attempts, threshold)
        return
    if entry.get('last_applied_state') == STATE_ABNORMAL:
        logger.debug('[%s] VPS %s remains abnormal (%s)', provider_label, vps_id, reason)
        return
    try:
        updateState(STATE_ABNORMAL, vps_id)
    except Exception as exc:
        logger.exception('[%s] Failed to mark VPS %s as abnormal: %s', provider_label, vps_id, exc)
        return
    entry['last_applied_state'] = STATE_ABNORMAL
    logger.warning('[%s] VPS %s marked as abnormal after %s consecutive failures: %s', provider_label, vps_id, attempts, reason)


def _check_single_vps(vps, config: Dict[str, Any], entry: Dict[str, Any]):
    vps_id = vps['id']
    provider_label = config['label']
    warmup_remaining = _should_skip_initial_warmup(vps, entry)
    if warmup_remaining > 0:
        logger.debug('[%s] VPS %s warmup in progress (%.1fs remaining)', provider_label, vps_id, warmup_remaining)
        return
    headers = _build_headers(config, vps)
    try:
        html = _fetch_provider_page(config['url'], headers, provider_label)
    except requests.RequestException as exc:
        _record_failure(vps, config, entry, f'{exc.__class__.__name__}: {exc}')
        return
    if not html or not html.strip():
        _record_failure(vps, config, entry, 'empty response body')
        return
    info, error = _parse_vps_info(html)
    if info:
        _persist_success(vps, config, entry, info)
    else:
        _record_failure(vps, config, entry, error or 'unable to parse response')


def addVps(obj):
    addSql(obj['name'], obj['ops'], obj['cookie'])


def CheckVPS():
    vps_list = selectSql()
    if not vps_list:
        logger.debug('No VPS records found for monitoring.')
        _cleanup_tracker(set())
        return
    active_ids = set()
    for vps in vps_list:
        try:
            vps_id = vps['id']
        except (TypeError, KeyError, IndexError):
            logger.warning('Skipping malformed VPS record: %s', vps)
            continue
        active_ids.add(vps_id)
        provider_key = str(vps['ops'] or '').strip().lower()
        if not provider_key:
            logger.warning('VPS ID %s has no provider configured.', vps_id)
            continue
        config = PROVIDER_CONFIGS.get(provider_key)
        if not config:
            logger.warning('Unable to recognise provider "%s" for VPS ID %s', provider_key, vps_id)
            continue
        entry = _ensure_tracker(vps_id, vps['state'])
        try:
            _check_single_vps(vps, config, entry)
        except Exception as exc:
            logger.exception('[%s] Unexpected error while checking VPS %s: %s', config['label'], vps_id, exc)
    _cleanup_tracker(active_ids)


def selectAllInfo():
    res = selectSql()
    if res == []:
        return {'msg': None}
    else:
        return {'msg': res}


def selectAllInfo_Info():
    res = selectSql()
    if not res:
        return {'msg': None}
    data = []
    for vps in res:
        expiry_dt, expiry_iso, expiry_display = resolve_expiry_values(
            vps['creation_date'], vps['valid_until'], vps['expiry_utc']
        )
        if expiry_iso and vps['expiry_utc'] != expiry_iso:
            update_expiry_utc(vps['id'], expiry_iso)
        display_value = expiry_display or '—'
        data.append(
            (
                vps['id'],
                vps['name'],
                vps['ops'],
                vps['creation_date'],
                display_value,
                vps['location'],
                vps['update_time'],
                vps['state'],
                expiry_iso,
            )
        )
    return {'msg': data}


def selectVPSForId(id_value):
    try:
        rows = selectSql_VPS_ID(id_value)
    except Exception as exc:
        logger.exception('Failed to query monitor details for id %s: %s', id_value, exc)
        raise

    normalized = []
    for row in rows or []:
        if row is None:
            continue
        if hasattr(row, 'keys') and hasattr(row, '__getitem__'):
            normalized.append([row[key] for key in row.keys()])
            continue
        if isinstance(row, dict):
            ordered_keys = [
                'id',
                'name',
                'ops',
                'cookie',
                'creation_date',
                'valid_until',
                'location',
                'ipv6',
                'ram',
                'disk_total',
                'update_time',
                'state',
                'expiry_utc',
            ]
            normalized.append([row.get(key) for key in ordered_keys])
            continue
        if isinstance(row, (list, tuple)):
            normalized.append(list(row))
            continue
        normalized.append([row])
    return {'msg': normalized}


def deleteVPS(raw_id):
    id_text = '' if raw_id is None else str(raw_id).strip()
    if not id_text:
        message = '监控 ID 不能为空。'
        return {'msg': f'删除失败, {message}', 'error': message, 'success': False, 'status': 400}
    try:
        monitor_id = int(id_text)
    except (TypeError, ValueError):
        message = '监控 ID 格式不正确。'
        return {'msg': f'删除失败, {message}', 'error': message, 'success': False, 'status': 400}

    try:
        affected = deleteVps(monitor_id)
    except Exception as exc:
        logger.exception('Failed to delete VPS %s: %s', id_text, exc)
        error_message = f'删除失败, {exc}'
        return {'msg': error_message, 'error': str(exc), 'success': False, 'status': 500}

    if affected:
        return {'msg': '删除成功', 'success': True, 'status': 200}

    message = '未找到对应监控。'
    return {'msg': f'删除失败, {message}', 'error': message, 'success': False, 'status': 404}


def updateVPS(list):
    try:
        updateVps(list[1], list[2], list[3], list[0])
        return {'msg': f'修改成功'}
    except Exception as e:
        return {'msg': f'修改失败{e}'}


def checkDateTime():
    try:
        res = selectSql()
    except Exception as exc:
        logger.exception('Failed to query VPS list for expiry notifications: %s', exc)
        return

    active_ids: Set[int] = set()
    if not res:
        _cleanup_expiry_tracker(active_ids)
        return

    try:
        for vps in res:
            vps_id = None
            try:
                vps_id = vps['id']
            except (TypeError, KeyError, IndexError):
                logger.warning('Skipping malformed VPS record for expiry reminder: %s', vps)
                continue

            active_ids.add(vps_id)

            try:
                expiry_dt, expiry_iso, expiry_display = resolve_expiry_values(
                    vps['creation_date'], vps['valid_until'], vps['expiry_utc']
                )
                if expiry_iso and vps['expiry_utc'] != expiry_iso:
                    update_expiry_utc(vps_id, expiry_iso)

                state = _ensure_expiry_state(vps_id, expiry_iso)

                if expiry_dt is None or not expiry_iso:
                    if state is not None:
                        _clear_expiry_notifications(vps_id, 'expiry-warning', 'expiry-hourly')
                        _reset_expiry_state(vps_id)
                    continue

                now_utc = datetime.datetime.now(datetime.timezone.utc)
                time_until_expiry = expiry_dt - now_utc
                if time_until_expiry <= datetime.timedelta(0):
                    _clear_expiry_notifications(vps_id, 'expiry-warning', 'expiry-hourly')
                    _reset_expiry_state(vps_id)
                    continue

                ops_label = vps['ops'] or ''
                provider_key = str(ops_label).strip().lower()
                provider_display = ops_label.upper() if ops_label else '未知'
                name_label = vps['name'] or ''
                display_name = name_label or provider_display or '未命名'
                pretty_time = expiry_display or format_malaysia_display(expiry_dt)
                renew_url = _resolve_renewal_url(provider_key)

                if time_until_expiry > TWO_DAY_THRESHOLD:
                    _schedule_initial_expiry_notification(
                        vps_id,
                        display_name,
                        provider_display,
                        pretty_time,
                        expiry_dt,
                        expiry_iso,
                        renew_url,
                        state,
                    )
                    if state and state.get('urgent'):
                        _clear_expiry_notifications(vps_id, 'expiry-hourly')
                    if state:
                        state['urgent'] = False
                        state['last_slot_index'] = None
                        state['last_notification_at'] = None
                        state.pop('last_remaining_seconds', None)
                else:
                    if state is None:
                        state = _ensure_expiry_state(vps_id, expiry_iso)
                    _schedule_hourly_expiry_notification(
                        vps_id,
                        display_name,
                        provider_display,
                        provider_key,
                        name_label,
                        pretty_time,
                        expiry_dt,
                        expiry_iso,
                        renew_url,
                        now_utc,
                        state,
                        time_until_expiry,
                    )

                if datetime.timedelta(days=0) < time_until_expiry <= datetime.timedelta(days=3):
                    message = (
                        f"你的{ops_label}小鸡\n"
                        f"名称:{name_label}即将到期\n"
                        f"到期时间为{pretty_time}\n"
                        f"距离到期还剩下{time_until_expiry}\n"
                    )
                    if provider_key == "vc":
                        sendMsg(vps_id, f"{message}[Renew](https://free.vps.vc/vps-renew)", "Markdown")
                    elif provider_key == "hax":
                        sendMsg(vps_id, f"{message}[Renew](https://hax.co.id/vps-renew/)", "Markdown")
                    elif provider_key == "woiden":
                        sendMsg(vps_id, f"{message}[Renew](https://woiden.id/vps-renew/)", "Markdown")
                    else:
                        sendMsg(vps_id, "出问题了咯，请检查看看")
            except Exception as exc:
                logger.exception('Failed to process expiry reminder for VPS %s: %s', vps_id, exc)
    finally:
        _cleanup_expiry_tracker(active_ids)
