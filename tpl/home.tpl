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
    <link rel="stylesheet" href="/css/pico.min.css">
    <link rel="stylesheet" href="/css/theme.css">
    <link rel="stylesheet" href="/css/components.css">
</head>

<body>
    <div id="statusBanner" class="status-banner hidden" role="status" aria-live="polite"></div>
    <div class="box">
        <header class="hero">
            <h1>小鸡监控系统</h1>
            <div class="actions">
                <span class="add_span">
                    <button id="openAddBtn" class="primary-btn" type="button">添加监控</button>
                </span>
                <button id="installBtn" class="install-btn hidden" type="button">安装应用</button>
            </div>
        </header>
        <main id="monitorList" class="content monitor-list" data-monitor-list aria-live="polite" aria-busy="false"></main>
    </div>

    <div id="modalOverlay" class="modal-overlay hidden"></div>
    <section id="modal" class="modal hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalTitle">
        <div class="modal__surface" role="document">
            <header class="modal__header">
                <h2 id="modalTitle" class="modal__title"></h2>
                <button type="button" class="modal__close" data-modal-close aria-label="关闭">✕</button>
            </header>
            <div id="modalBody" class="modal__body"></div>
        </div>
    </section>

    <template id="monitor-form-template">
        <form class="monitor-form" novalidate>
            <fieldset class="form-fieldset">
                <legend class="visually-hidden">监控详情</legend>
                <div class="form-group">
                    <label for="monitorOps">选择小鸡站：</label>
                    <select id="monitorOps" name="ops" required>
                        <option value="hax">Hax</option>
                        <option value="woiden">Woiden</option>
                        <option value="vc">Vc</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="monitorCookie">网页Cookie：</label>
                    <input id="monitorCookie" name="cookie" type="text" required autocomplete="off">
                </div>
                <div class="form-group">
                    <label for="monitorName">设置备注名：</label>
                    <input id="monitorName" name="name" type="text" required autocomplete="off">
                </div>
            </fieldset>
            <div class="modal__actions">
                <button type="submit" class="primary-btn">提交</button>
                <button type="button" class="secondary-btn" data-modal-cancel>取消</button>
            </div>
        </form>
    </template>

    <div id="toastContainer" class="toast-container" role="status" aria-live="assertive"></div>

    <script type="module" src="/js/app.js"></script>
</body>

</html>
