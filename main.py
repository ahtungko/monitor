# -*- coding: utf-8 -*-
from bottle import route, run, template, debug, request, static_file, response
from add import *
import logging
import threading, time, sys, signal
from pathlib import Path

logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('[%(asctime)s] %(levelname)s %(name)s: %(message)s'))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False

should_stop_checking = False
def check_vps():
    global should_stop_checking
    while not should_stop_checking:
        CheckVPS()
        checkDateTime()
        time.sleep(10) # 每隔60秒执行一次
        
# 正常结束进程
def signal_handler(sig, frame):
    global should_stop_checking
    should_stop_checking = True
    print("程序已结束,等待进程关闭")
    sys.exit(0)
# 多线程
def thread_check(signal_handler):
    signal.signal(signal.SIGINT, signal_handler)
    t1 = threading.Thread(target=check_vps)
    t1.start()

thread_check(signal_handler)

BASE_DIR = Path(__file__).resolve().parent
STATIC_ROOT = BASE_DIR / 'static'

CACHE_ONE_DAY = 24 * 60 * 60
CACHE_ONE_WEEK = 7 * CACHE_ONE_DAY


def add_cache_headers(resp, max_age=CACHE_ONE_DAY):
    if resp:
        resp.set_header('Cache-Control', f'public, max-age={max_age}')
    return resp


def no_store(resp):
    if resp:
        resp.set_header('Cache-Control', 'no-store')
    return resp


debug(True)
@route('/')
def home():
    return template('tpl/home.tpl')

@route('/css/<filepath:path>', method='GET')
def serve_css(filepath):
    resp = static_file(filepath, root=str(STATIC_ROOT / 'css'))
    return add_cache_headers(resp, CACHE_ONE_WEEK)

@route('/js/<filepath:path>', method='GET')
def serve_js(filepath):
    resp = static_file(filepath, root=str(STATIC_ROOT / 'js'))
    return add_cache_headers(resp, CACHE_ONE_WEEK)

@route('/icons/<filepath:path>', method='GET')
def serve_icons(filepath):
    resp = static_file(filepath, root=str(STATIC_ROOT / 'icons'))
    return add_cache_headers(resp, CACHE_ONE_WEEK)

@route('/manifest.json', method='GET')
def manifest():
    resp = static_file('manifest.json', root=str(BASE_DIR))
    if resp:
        resp.content_type = 'application/manifest+json'
    return add_cache_headers(resp, CACHE_ONE_DAY)

@route('/service-worker.js', method='GET')
def service_worker():
    resp = static_file('service-worker.js', root=str(BASE_DIR))
    if resp:
        resp.content_type = 'application/javascript'
    return no_store(resp)

@route('/add', method = 'POST')
def add():
    name = request.forms.get('name')
    ops = request.forms.get('ops')
    cookie = request.forms.get('cookie')
    addVps({'name': name, 'ops': ops, 'cookie': cookie})
    return {'message':'添加成功'}
@route('/select')
def select():
    return selectAllInfo_Info()
@route('/del', method='POST')
def delete_monitor():
    payload = deleteVPS(request.forms.get('id'))
    if isinstance(payload, dict):
        status_code = payload.get('status')
        if status_code is not None:
            response.status = status_code
        elif payload.get('success') is False:
            response.status = 400
    return payload


@route('/modify', method='POST')
def update_monitor():
    id = request.forms.get('id')
    name = request.forms.get('name')
    ops = request.forms.get('ops')
    cookie = request.forms.get('cookie')
    return updateVPS([id, name, ops, cookie])

@route('/checkPwd', method = 'POST')
def checkPwd():
    try:
        res = conf('password')
        Password = res['password']
        pwd = request.forms.get('pwd')
        if pwd == Password:
            return {'msg': 'success'}
        else:
            return {'msg': 'reject'}
    except:
        print(conf('password'))
        print(request.forms.get('pwd'))
        print('error')
@route('/sel_id', method='POST')
def sel_Id():
    raw_id = request.forms.get('id')
    raw_id_text = '' if raw_id is None else str(raw_id).strip()
    client_ip = request.remote_addr or '-'

    if not raw_id_text:
        logger.warning('Missing monitor id in /sel_id request from %s', client_ip)
        response.status = 400
        return {'msg': None, 'error': '监控 ID 不能为空。'}

    try:
        monitor_id = int(raw_id_text)
    except ValueError:
        logger.warning('Invalid monitor id "%s" in /sel_id request from %s', raw_id_text, client_ip)
        response.status = 400
        return {'msg': None, 'error': '监控 ID 格式不正确。'}

    try:
        payload = selectVPSForId(monitor_id)
    except Exception:
        logger.exception('Failed to retrieve monitor details for id %s', monitor_id)
        response.status = 500
        return {'msg': None, 'error': '加载监控信息失败。'}

    records = []
    if isinstance(payload, dict):
        records = payload.get('msg') or []
    elif payload is not None:
        records = payload

    if not records:
        logger.info('Monitor %s not found', monitor_id)
        response.status = 404
        return {'msg': [], 'error': '未找到监控信息。'}

    response.status = 200
    return payload
# run(host='localhost', port=8080, reloader=True, server='wsgiref')


cf = conf('prot')
# print(cf)
if cf == None:
        print('配置文件读取失败')
        sys.exit(0)
else:
    if cf['port'] != '':
            run(host='::', port=cf['port'], server='wsgiref')
    else:
        print('配置文件读取不正确')

# 后台运行
# nohup python3 -u main.py > monitor.log 2>&1 &
