# hax-woiden-vc-renew-monitor

监控系统基于Python3

##食用方法：

* 填写`config.ini`配置文件
* 将需要启用的消息媒介值改为`1`
* **注意：当使用tgbot的时候一定要设置`chat_ids`,填自己的`tgid` 可以填多个`tgid` 用逗号隔开**

  ```ini
  [options]
  #需要使用的提醒方式将0改为1
  tgbot = 0
  email = 0

  ```


* 按文件提示填写消息媒介资料

  ```ini
  [email_info]
  #发件方邮箱
  sender_email = 
  #密码或者key
  sender_password = 
  #收件人信息,多个请用英文逗号隔开
  receiver_email = 
  #smtp服务器,默认是QQ邮箱,如用其他邮箱请自行修改
  smtp_server = 
  #邮件标题(修改即生效)
  subject = VPS即将到期通知
  [tgbot_info]
  #telegram 机器人的key
  tgbot_token = 
  #指定推送的TGchatid,如有多个ID用英文逗号(,)隔开,选择tgbot则此项必填
  chat_ids = 
  ```
* 配置网页端口信息
  默认端口8080，访问 `ip:8080` 修改该项后使用 `ip:端口` 访问

  ```
  [prot]
  #网页运行端口
  port = 8080
  ```
* 安装支持包

  ```bash
  #进入到项目目录下执行
  pip3 install -r requirements.txt
  ```
* 启动监控

  ```bash
  #直接启动
  python3 main.py
  #后台运行,记录日志(日志记录在当前目录的bot.log中)
  nohup python3 -u main.py > monitor.log 2>&1 &
  ```

## PWA 使用说明

- 网页端现已支持 Progressive Web App，可通过浏览器地址栏的安装提示或页面中的“安装应用”按钮，将监控面板安装到桌面。
- `manifest.json` 位于项目根目录，新的图标资源存放在 `static/icons/`，核心脚本/样式位于 `static/js/` 与 `static/css/`。
- `service-worker.js` 会在访问首页时注册：
  - 预缓存首页、CSS、JavaScript 以及所有图标资源，确保在离线状态下仍可以打开基础界面；
  - 对 `/select` 等数据接口采用 network-first 策略，无法联网时自动回退到缓存数据并在页面顶部显示离线提示。
- 开发调试时，如修改了前端资源或 service worker，请在浏览器 DevTools 中执行 **Hard Reload + Clear Storage** 或注销旧的 service worker 以便加载最新缓存。
- 启动方式与此前一致，运行 `python3 main.py` 即会同时提供 PWA 资源。部署后建议使用 Chrome DevTools → Lighthouse → **Progressive Web App** 检查项，自检是否满足 *Installable* 与 *Offline capable* 要求。
- 详见 [`docs/ui-redesign.md`](docs/ui-redesign.md) 获取桌面/平板/移动端响应式验证、PWA 安装与离线冒烟测试的手动检查清单。

## 前端样式说明

- 页面现在使用自托管的 Pico.css 精简构建 (`static/css/pico.min.css`) 作为基础样式，配合 `static/css/theme.css` 与 `static/css/components.css` 定义的设计令牌与组件外观。
- 统一的颜色、排版、间距变量支持 `prefers-color-scheme`，在浅色与深色模式之间自动切换，同时保留可访问的对比度与焦点状态。
- 监控卡片、表单、弹窗及提示采用响应式网格与柔和过渡动画，覆盖移动端到桌面端的触控与键盘操作场景。
