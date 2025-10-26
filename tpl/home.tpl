<!DOCTYPE html>
<html lang="zh-Hans">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0ea5e9">
    <meta name="description" content="小鸡监控系统 - 自托管的 VPS 续期与 Cookie 状态监控面板。">
    <title>小鸡监控系统</title>
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/app-icon-192.png">
    <link rel="apple-touch-icon" href="/icons/app-icon-192.png">
    <link rel="stylesheet" href="/css/theme.css">
    <link rel="stylesheet" href="/css/components.css">
</head>

<body>
    <div id="statusBanner" class="status-banner hidden" role="status" aria-live="polite"></div>

    <div class="app-shell box" data-app-shell>
        <header class="app-shell__header hero" role="banner">
            <div class="app-shell__headline">
                <p class="app-shell__eyebrow">Renewal Monitoring</p>
                <h1>小鸡监控系统</h1>
                <p class="app-shell__subtitle">集中查看监控实例状态，管理续期提醒。</p>
            </div>
            <div class="app-shell__controls actions" role="group" aria-label="监控操作">
                <button id="openAddBtn" class="primary-btn" type="button">添加监控</button>
                <button id="installBtn" class="install-btn hidden" type="button">安装应用</button>
            </div>
        </header>

        <section class="app-shell__metrics" aria-labelledby="summaryTitle">
            <h2 id="summaryTitle" class="visually-hidden">监控概览</h2>
            <article class="metric-card" data-summary-card data-summary="total">
                <p class="metric-card__label">监控总数</p>
                <output class="metric-card__value" name="total-monitors" data-summary-value>--</output>
                <p class="metric-card__hint">当前正在追踪的监控实例。</p>
            </article>
            <article class="metric-card" data-summary-card data-summary="upcoming">
                <p class="metric-card__label">即将到期</p>
                <output class="metric-card__value" name="upcoming-renewals" data-summary-value>--</output>
                <p class="metric-card__hint">需要留意续费的实例数量。</p>
            </article>
            <article class="metric-card" data-summary-card data-summary="healthy">
                <p class="metric-card__label">Cookie 正常</p>
                <output class="metric-card__value" name="healthy-cookies" data-summary-value>--</output>
                <p class="metric-card__hint">状态良好的 Cookie 数量。</p>
            </article>
        </section>

        <main id="mainContent" class="app-shell__main" tabindex="-1">
            <section class="monitor-collection" aria-labelledby="monitorSectionTitle">
                <div class="monitor-collection__header">
                    <h2 id="monitorSectionTitle" class="monitor-collection__title">监控列表</h2>
                    <p class="monitor-collection__subtitle">实时显示监控实例的 Cookie 状态与过期时间。</p>
                </div>
                <div id="monitorList" class="monitor-collection__grid monitor-list" data-monitor-list aria-live="polite" aria-busy="false"></div>
            </section>
        </main>
    </div>

    <div id="modalOverlay" class="modal-overlay hidden"></div>
    <section id="modal" class="modal hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalTitle" aria-describedby="modalDescription">
        <div class="modal__surface" role="document">
            <header class="modal__header">
                <h2 id="modalTitle" class="modal__title"></h2>
                <button type="button" class="modal__close" data-modal-close aria-label="关闭弹窗">✕</button>
            </header>
            <p id="modalDescription" class="modal__description visually-hidden">填写监控信息后提交可保存设置，取消将关闭弹窗。</p>
            <div id="modalBody" class="modal__body" data-modal-body></div>
        </div>
    </section>

    <div id="installPrompt" class="install-prompt hidden" role="dialog" aria-live="polite" aria-label="安装应用提示" aria-hidden="true">
        <div class="install-prompt__content">
            <div class="install-prompt__text">
                <strong>安装应用</strong>
                <p>将此监控面板添加到桌面，随时快速访问。</p>
            </div>
            <div class="install-prompt__actions">
                <button type="button" class="install-btn install-btn--compact" data-install-accept>立即安装</button>
                <button type="button" class="ghost-btn ghost-btn--compact" data-install-dismiss>稍后再说</button>
            </div>
        </div>
    </div>

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
                    <label for="monitorCookie">网页 Cookie：</label>
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
