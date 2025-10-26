# -*- coding: utf-8 -*-
import requests, datetime, pytz
from bs4 import BeautifulSoup
from sql import *
from send import *

def addVps(obj):
    addSql(obj['name'], obj['ops'], obj['cookie'])

def CheckVPS():
    try:
        for vps in selectSql():
            if str(vps[2]) == 'hax':
                checkHaxInfo(vps)
            elif str(vps[2]) == 'woiden':
                checkWoidenInfo(vps)
            elif str(vps[2]) == 'vc':
                checkVCInfo(vps)
            else:
                print('无法识别的母鸡')
    except:
        print('无监控信息')
def checkHaxInfo(vps):
    url = 'https://hax.co.id/vps-info/'
    headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Cookie': str(vps[3]),
    }
    resp = requests.get(url=url, headers=headers)
    html_content = resp.content.decode('UTF-8')
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        meta = soup.find('meta')
        if str(meta) == '<meta charset="utf-8"/>':
            key = soup.find_all('label', {'class':'col-sm-5 col-form-label'})
            val = soup.find_all('div', {'class':'col-sm-7'})
            info = {}
            for k, v in zip(key, val):
                if k.text in ['VPS Creation Date','Valid until',"IPv6","Location","Total disk space","Ram"]:
                    info.update({k.text:str(v.text).strip()})
            try:
                updateInfoSql(info['VPS Creation Date'], info['Valid until'], info["Location"],info["IPv6"],info["Ram"],info["Total disk space"],vps[0])
            except Exception as e:
                updateState(1, vps[0])
                pass
        else:
            updateState(0, vps[0])
            print('cookie已过期')
            pass
    except:
        # print('网络异常，请求失败')
        pass
def checkWoidenInfo(vps):
    url = 'https://woiden.id/vps-info/'
    headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Cookie': str(vps[3]),
    }
    resp = requests.get(url=url, headers=headers)
    html_content = resp.content.decode('UTF-8')
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        meta = soup.find('meta')
        if str(meta) == '<meta charset="utf-8"/>':
            key = soup.find_all('label', {'class':'col-sm-5 col-form-label'})
            val = soup.find_all('div', {'class':'col-sm-7'})
            info = {}
            for k, v in zip(key, val):
                if k.text in ['VPS Creation Date','Valid until',"IPv6","Location","Total disk space","Ram"]:
                    info.update({k.text:str(v.text).strip()})
            try:
                # print('success')
                updateInfoSql(info['VPS Creation Date'], info['Valid until'], info["Location"],info["IPv6"],info["Ram"],info["Total disk space"],vps[0])
            except Exception as e:
                updateState(1, vps[0])
                pass
        else:
            updateState(0, vps[0])
            pass
            # print('cookie已过期')
    except Exception  as e:
        # print(e)
        pass
        # print('网络异常，请求失败')
    
def checkVCInfo(vps):
    url = 'https://free.vps.vc/vps-info'
    headers = {
    "cookie": str(vps[3]),
    "referer": "https://free.vps.vc/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    }
    resp = requests.get(url=url, headers=headers)
    html_content = resp.content.decode('UTF-8')
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        meta = soup.find('meta')
        if str(meta) == '<meta charset="utf-8"/>':
            key = soup.find_all('label', {'class':'col-sm-5 col-form-label'})
            val = soup.find_all('div', {'class':'col-sm-7'})
            info = {}
            for k, v in zip(key, val):
                if k.text in ['VPS Creation Date','Valid until',"IPv6","Location","Total disk space","Ram"]:
                    info.update({k.text:str(v.text).strip()})
            try:
                updateInfoSql(info['VPS Creation Date'], info['Valid until'], info["Location"],info["IPv6"],info["Ram"],info["Total disk space"],vps[0])
            except Exception as e:
                updateState(1, vps[0])
                pass
        else:
            updateState(0, vps[0])
            # print(soup)
            # print('cookie已过期')
            pass
    except:
        # print('网络异常，请求失败')
        pass
def selectAllInfo():
    res = selectSql()
    if res == []:
        return {'msg' : None}
    else:
        return{'msg': res}
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
def selectVPSForId(id):
    res = selectSql_VPS_ID(id)
    return {'msg': res}
def deleteVPS(id):
    try:
        deleteVps(id)
        return{'msg': '删除成功'}
    except Exception as e:
        return{'msg': f'删除失败,{e}'}
def updateVPS(list):
    try:
        updateVps(list[1], list[2], list[3], list[0])
        return{'msg':f'修改成功'}
    except Exception as e:
        return{'msg':f'修改失败{e}'}

def checkDateTime():
    res = selectSql()
    if not res:
        return
    try:
        for vps in res:
            expiry_dt, expiry_iso, expiry_display = resolve_expiry_values(
                vps['creation_date'], vps['valid_until'], vps['expiry_utc']
            )
            if expiry_iso and vps['expiry_utc'] != expiry_iso:
                update_expiry_utc(vps['id'], expiry_iso)
            if expiry_dt is None:
                continue
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            delta_time = expiry_dt - now_utc
            if datetime.timedelta(days=0) < delta_time <= datetime.timedelta(days=3):
                ops_label = vps['ops'] or ''
                name_label = vps['name'] or ''
                vps_type = str(ops_label).lower()
                pretty_time = expiry_display or format_malaysia_display(expiry_dt)
                message = (
                    f"你的{ops_label}小鸡\n"
                    f"名称:{name_label}即将到期\n"
                    f"到期时间为{pretty_time}\n"
                    f"距离到期还剩下{delta_time}\n"
                )
                if vps_type == "vc":
                    sendMsg(vps['id'], f"{message}[Renew](https://free.vps.vc/vps-renew)", "Markdown")
                elif vps_type == "hax":
                    sendMsg(vps['id'], f"{message}[Renew](https://hax.co.id/vps-renew/)", "Markdown")
                elif vps_type == "woiden":
                    sendMsg(vps['id'], f"{message}[Renew](https://woiden.id/vps-renew/)", "Markdown")
                else:
                    sendMsg(vps['id'], "出问题了咯，请检查看看")
    except Exception:
        pass
