<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Renewal Monitoring Sys</title>
    <meta name="theme-color" content="#0ea5e9">
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/app-icon-192.png">
    <link rel="apple-touch-icon" href="/icons/app-icon-192.png">
    <link rel="stylesheet" type="text/css" href="/css/home.css">
    <script src="/js/vendor/jquery-3.6.0.min.js" defer></script>
    <script src="/js/app.js" defer></script>
</head>

<body>
    <div id="statusBanner" class="status-banner hidden" role="status" aria-live="polite"></div>
    <div class="box">
        <h1>小鸡监控系统</h1>
        <div class="actions">
            <span class="add_span"><a>添加监控</a></span>
            <button id="installBtn" class="install-btn hidden" type="button">安装应用</button>
        </div>
        <div class="content"></div>
    </div>

    <div class="overlay"></div>
    <!-- 隐藏的添加窗口 -->
    <div class="add_window">
        <h2>添加一个监控</h2>
        <form id="add">
            <ul>
                <li>
                    <label for="ops">选择小鸡站：</label>
                    <select id="ops" name="ops">
                        <option value="hax">Hax</option>
                        <option value="woiden">Woiden</option>
                        <option value="vc">Vc</option>
                    </select>
                </li>
                <li>
                    <label for="cookie">网页Cookie：</label>
                    <input type="text" id="cookie" name="cookie" required>
                </li>
                <li>
                    <label for="name">设置备注名：</label>
                    <input type="text" id="name" name="name" required>
                </li>
                <li>
                    <button type="submit">提交</button>
                    <button type="button" id="close_add">取消</button>
                </li>
            </ul>
        </form>
    </div>
    <div class="modify_window">
    </div>
</body>


</html>