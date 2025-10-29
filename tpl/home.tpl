<!DOCTYPE html>
<html lang="zh-Hans">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#2563eb">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0c1424">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="description" content="小鸡监控系统 - 自托管的 VPS 续期与 Cookie 状态监控面板。">
    <title>小鸡监控系统</title>
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/app-icon-192.png">
    <link rel="apple-touch-icon" href="/icons/app-icon-192.png">
    <link rel="stylesheet" href="/css/tokens.css">
    <link rel="stylesheet" href="/css/base.css">
    <link rel="stylesheet" href="/css/components.css">
</head>

<body>
    <div id="statusBanner" class="status-banner hidden" role="status" aria-live="polite"></div>

    <div class="dashboard-shell box" data-app-shell>
        <header class="dashboard-header" role="banner">
            <div class="dashboard-header__primary">
                <div class="dashboard-header__titles">
                    <p class="dashboard-header__eyebrow">Renewal Monitoring</p>
                    <h1 class="dashboard-header__title">小鸡监控系统</h1>
                    <p class="dashboard-header__subtitle supporting-text">集中查看监控实例状态，管理续期提醒。</p>
                </div>
                <div class="dashboard-header__actions" role="group" aria-label="监控操作">
                    <div class="dashboard-header__quick-actions" role="group" aria-label="快速操作">
                        <button id="toggleNotificationSettingsBtn" class="dashboard-header__quick-action ghost-btn" type="button" aria-label="通知设置" aria-controls="notificationSettings" aria-expanded="false">
                            <span aria-hidden="true">🔔</span>
                            <span class="dashboard-header__quick-action-label">通知</span>
                        </button>
                        <button id="installBtn" class="dashboard-header__quick-action install-btn hidden" type="button">安装应用</button>
                    </div>
                    <button id="openAddBtn" class="primary-btn dashboard-header__cta" type="button">添加监控</button>
                </div>
            </div>
        </header>

        <main id="mainContent" class="dashboard-main" tabindex="-1">
            <section class="summary-section" aria-labelledby="summaryTitle">
                <header class="section-header">
                    <h2 id="summaryTitle" class="section-title">监控概览</h2>
                    <p class="section-description supporting-text">快速了解监控总量、续期风险与 Cookie 状态。</p>
                </header>
                <div class="summary-grid" data-summary-collection>
                    <article class="summary-card metric-card" data-summary-card data-summary="total">
                        <p class="summary-card__label metric-card__label">监控总数</p>
                        <output class="summary-card__value metric-card__value" name="total-monitors" data-summary-value>--</output>
                        <p class="summary-card__hint metric-card__hint supporting-text">当前正在追踪的监控实例。</p>
                    </article>
                    <article class="summary-card metric-card" data-summary-card data-summary="upcoming">
                        <p class="summary-card__label metric-card__label">即将到期</p>
                        <output class="summary-card__value metric-card__value" name="upcoming-renewals" data-summary-value>--</output>
                        <p class="summary-card__hint metric-card__hint supporting-text">需要留意续费的实例数量。</p>
                    </article>
                    <article class="summary-card metric-card" data-summary-card data-summary="healthy">
                        <p class="summary-card__label metric-card__label">Cookie 正常</p>
                        <output class="summary-card__value metric-card__value" name="healthy-cookies" data-summary-value>--</output>
                        <p class="summary-card__hint metric-card__hint supporting-text">状态良好的 Cookie 数量。</p>
                    </article>
                </div>
            </section>

            <section id="notificationSettings" class="notification-panel hidden" aria-labelledby="notificationSettingsTitle" aria-hidden="true">
                <article class="notification-card notification-settings" role="region" aria-live="polite" aria-labelledby="notificationSettingsTitle">
                    <header class="notification-card__header">
                        <div class="notification-card__titles">
                            <h2 id="notificationSettingsTitle" class="notification-card__title notification-settings__title">通知设置</h2>
                            <p class="notification-card__subtitle supporting-text">配置浏览器推送提醒，及时掌握续期与异常变化。</p>
                        </div>
                        <div class="notification-card__controls notification-settings__status">
                            <div class="notification-card__permission notification-status">
                                <span class="notification-status__label">浏览器通知权限：</span>
                                <span id="notificationPermissionStatus" class="notification-status__value">检查中...</span>
                            </div>
                            <div class="notification-card__toggle notification-status">
                                <span class="notification-status__label">通知开关：</span>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="notificationToggle" aria-label="启用或禁用通知">
                                    <span class="toggle-switch__slider"></span>
                                </label>
                            </div>
                        </div>
                    </header>
                    <div class="notification-card__body notification-settings__content">
                        <div class="notification-card__actions notification-settings__actions">
                            <button id="requestPermissionBtn" class="secondary-btn" type="button">请求通知权限</button>
                            <button id="testNotificationBtn" class="secondary-btn" type="button">测试通知</button>
                            <button id="openBrowserNotificationSettingsBtn" class="ghost-btn" type="button">浏览器通知设置</button>
                        </div>
                        <p class="notification-card__hint notification-settings__hint" id="notificationSupportHint"></p>
                    </div>
                </article>
            </section>

            <section class="monitor-section" aria-labelledby="monitorSectionTitle">
                <header class="section-header">
                    <h2 id="monitorSectionTitle" class="section-title">监控列表</h2>
                    <p class="section-description supporting-text">实时显示监控实例的 Cookie 状态与过期时间。</p>
                </header>
                <div id="monitorList" class="monitor-board monitor-list" data-monitor-list aria-live="polite" aria-busy="false"></div>
            </section>
        </main>
    </div>

    <div id="modalOverlay" class="dialog__backdrop modal-overlay hidden"></div>
    <section id="modal" class="dialog modal hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="modalTitle" aria-describedby="modalDescription">
        <div class="dialog__surface modal__surface" role="document">
            <header class="dialog__header modal__header">
                <h2 id="modalTitle" class="dialog__title modal__title"></h2>
                <button type="button" class="dialog__close modal__close" data-modal-close aria-label="关闭弹窗">✕</button>
            </header>
            <p id="modalDescription" class="dialog__description modal__description visually-hidden">填写监控信息后提交可保存设置，取消将关闭弹窗。</p>
            <div id="modalBody" class="dialog__body modal__body" data-modal-body></div>
        </div>
    </section>

    <template id="monitor-form-template">
        <form class="monitor-form" novalidate>
            <fieldset class="form-fieldset monitor-form__fieldset">
                <legend class="visually-hidden">监控详情</legend>
                <div class="form-field form-group">
                    <label for="monitorOps" class="form-field__label">选择小鸡站</label>
                    <div class="form-field__control">
                        <select id="monitorOps" name="ops" required aria-describedby="monitorOpsHint">
                            <option value="hax">Hax</option>
                            <option value="woiden">Woiden</option>
                            <option value="vc">Vc</option>
                        </select>
                    </div>
                    <p id="monitorOpsHint" class="form-field__hint supporting-text">选择要监控的服务提供商。</p>
                </div>
                <div class="form-field form-group">
                    <label for="monitorCookie" class="form-field__label">网页 Cookie</label>
                    <div class="form-field__control">
                        <input id="monitorCookie" name="cookie" type="text" required autocomplete="off" aria-describedby="monitorCookieHint">
                    </div>
                    <p id="monitorCookieHint" class="form-field__hint supporting-text">粘贴当前登录会话的 Cookie 值。</p>
                </div>
                <div class="form-field form-group">
                    <label for="monitorName" class="form-field__label">设置备注名</label>
                    <div class="form-field__control">
                        <input id="monitorName" name="name" type="text" required autocomplete="off" aria-describedby="monitorNameHint">
                    </div>
                    <p id="monitorNameHint" class="form-field__hint supporting-text">用于在列表中快速识别该监控实例。</p>
                </div>
            </fieldset>
            <div class="dialog__actions modal__actions">
                <button type="submit" class="primary-btn">提交</button>
                <button type="button" class="secondary-btn" data-modal-cancel>取消</button>
            </div>
        </form>
    </template>

    <div id="toastContainer" class="toast-container" role="status" aria-live="assertive"></div>

    <script type="module" src="/js/app.js"></script>
</body>

</html>
