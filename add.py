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
    if res == []:
        return {'msg' : None}
    else:
        data = []
        for vps in res:
            data.append((vps[0],vps[1],vps[2],vps[4],vps[5],vps[6],vps[10],vps[11]))
        return{'msg': data}
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
    #print(res)
    # res = [(3, 'J', 'vc', 'PHPSESSID=dnjdn', 'November 05, 2023', 'November 24, 2023', 'EU1-LON-kvm', '2001:41d0:800:29c6:9ec1:306e:e923:f653', '512 MB', '5 GB', '2023-11-23 08:51:06.971761', 1)]
    if len(res) != 0:
        try:
            for vps in res:
                # 将PST时间字符串转换为datetime对象，并设置时区为America/Los_Angeles
                pst_time = datetime.datetime.strptime(vps[5], "%B %d, %Y").replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=pytz.timezone('America/Los_Angeles'))
                #pst_time = datetime.datetime.strptime(vps[5], "%B %d, %Y").replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=pytz.timezone('Asia/Kuala_Lumpur'))
                # 在PST时间上加上23小时59分59秒
                # pst_time = pst_time + datetime.timedelta(hours=23, minutes=59, seconds=59) + datetime.timedelta(minutes=7)
                # 将时区转换为Asia/Shanghai，并格式化为UTC+8时间字符串
                utc_time = pst_time.astimezone(pytz.timezone('Asia/Kuala_Lumpur'))
                delta_time = utc_time - datetime.datetime.now(pytz.timezone('Asia/Kuala_Lumpur')) 
                if datetime.timedelta(days=0) < delta_time < datetime.timedelta(days=3):
                    # print(f'小于5天{delta_time}')
                    vpsType = vps[2].lower()
                    if vpsType == "vc":
                        sendMsg(vps[0], f"你的{vps[2]}小鸡\n名称:{vps[1]}即将到期\n到期时间为{utc_time}\n距离到期还剩下{delta_time}\n[Renew](https://free.vps.vc/vps-renew)", "Markdown")
                    elif vpsType == "hax":
                        sendMsg(vps[0], f"你的{vps[2]}小鸡\n名称:{vps[1]}即将到期\n到期时间为{utc_time}\n距离到期还剩下{delta_time}\n[Renew](https://hax.co.id/vps-renew/)", "Markdown")
                    elif vpsType == "woiden":
                        sendMsg(vps[0], f"你的{vps[2]}小鸡\n名称:{vps[1]}即将到期\n到期时间为{utc_time}\n距离到期还剩下{delta_time}\n[Renew](https://woiden.id/vps-renew/)", "Markdown")
                    else:
                        sendMsg(vps[0], f"出问题了咯，请检查看看")
                   
                   # python 3.10+ only
                    # match vpsType:
                    #     case "vc":
                    #         sendMsg(vps[0], f"你的{vps[2]}小鸡\n名称:{vps[1]}即将到期\n到期时间为{utc_time}\n距离到期还剩下{delta_time}\n[Renew](https://free.vps.vc/vps-renew)", "Markdown")
                    #     case "hax":
                    #         sendMsg(vps[0], f"你的{vps[2]}小鸡\n名称:{vps[1]}即将到期\n到期时间为{utc_time}\n距离到期还剩下{delta_time}\n[Renew](https://hax.co.id/vps-renew/)", "Markdown")
                    #     case "woiden":
                    #         sendMsg(vps[0], f"你的{vps[2]}小鸡\n名称:{vps[1]}即将到期\n到期时间为{utc_time}\n距离到期还剩下{delta_time}\n[Renew](https://woiden.id/vps-renew/)", "Markdown")
                    #     case _:
                    #         sendMsg(vps[0], f"出问题了咯， 请检查看看")
                # else:
                #     print(f'大于5天{delta_time}')
        except:
            pass