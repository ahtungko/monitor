const STORAGE_KEY = 'renewal-monitor-cache';
const REFRESH_INTERVAL = 20000;
const FETCH_TIMEOUT = 15000;
const FOCUSABLE_SELECTORS = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ui = {
    monitorList: document.querySelector('[data-monitor-list]'),
    addButton: document.getElementById('openAddBtn'),
    installButton: document.getElementById('installBtn'),
    statusBanner: document.getElementById('statusBanner'),
    modalOverlay: document.getElementById('modalOverlay'),
    modal: document.getElementById('modal'),
    modalBody: document.getElementById('modalBody'),
    modalTitle: document.getElementById('modalTitle'),
    toastContainer: document.getElementById('toastContainer'),
    formTemplate: document.getElementById('monitor-form-template'),
    notificationPanel: document.getElementById('notificationSettings'),
    notificationToggleButton: document.getElementById('toggleNotificationSettingsBtn'),
};

const summaryOutputs = {
    total: document.querySelector('[data-summary="total"] [data-summary-value]'),
    upcoming: document.querySelector('[data-summary="upcoming"] [data-summary-value]'),
    healthy: document.querySelector('[data-summary="healthy"] [data-summary-value]'),
};

if (!ui.monitorList || !ui.formTemplate || !ui.modal || !ui.modalOverlay || !ui.modalBody || !ui.modalTitle) {
    // Required DOM anchors are missing; bail out gracefully.
    console.warn('[frontend] Required DOM nodes not found. Frontend logic aborted.');
} else {
    const urlParams = new URLSearchParams(window.location.search);
    const state = {
        monitors: [],
        loading: false,
        offline: !navigator.onLine,
        refreshTimer: null,
        deferredPrompt: null,
        focusTargetId: urlParams.get('vps'),
    };

    if ('history' in window && typeof window.history.replaceState === 'function' && state.focusTargetId) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('vps');
        window.history.replaceState({}, document.title, cleanUrl.toString());
    }

    let bannerTimeoutId = null;
    let autoCardId = 0;

    const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur';
    const MALAYSIA_TIME_SUFFIX = 'MYT';
    const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

    const modalManager = createModalManager({
        modal: ui.modal,
        overlay: ui.modalOverlay,
        titleEl: ui.modalTitle,
        bodyEl: ui.modalBody,
    });

    function isOnline() {
        return navigator.onLine;
    }

    function setBanner(message, variant = 'info', { persist = false } = {}) {
        if (!ui.statusBanner) {
            return;
        }
        ui.statusBanner.textContent = message;
        ui.statusBanner.dataset.state = variant;
        ui.statusBanner.classList.remove('hidden');
        if (bannerTimeoutId) {
            window.clearTimeout(bannerTimeoutId);
            bannerTimeoutId = null;
        }
        if (!persist) {
            bannerTimeoutId = window.setTimeout(() => {
                hideBanner();
                bannerTimeoutId = null;
            }, 4000);
        }
    }

    function hideBanner() {
        if (!ui.statusBanner) {
            return;
        }
        if (bannerTimeoutId) {
            window.clearTimeout(bannerTimeoutId);
            bannerTimeoutId = null;
        }
        ui.statusBanner.textContent = '';
        ui.statusBanner.dataset.state = '';
        ui.statusBanner.classList.add('hidden');
    }

    function showToast(message, variant = 'info', { duration = 4200 } = {}) {
        if (!ui.toastContainer) {
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast toast--${variant}`;
        toast.dataset.variant = variant;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');
        toast.setAttribute('aria-atomic', 'true');
        toast.textContent = message;
        ui.toastContainer.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.add('toast--visible');
        });
        window.setTimeout(() => {
            toast.classList.remove('toast--visible');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            }, { once: true });
        }, duration);
    }

    function setLoading(value) {
        state.loading = value;
        if (!ui.monitorList) {
            return;
        }
        ui.monitorList.setAttribute('aria-busy', String(Boolean(value)));
        if (value && state.monitors.length === 0) {
            renderSkeletons();
        }
    }

    function renderSkeletons() {
        if (!ui.monitorList) {
            return;
        }
        ui.monitorList.innerHTML = '';
        const skeletonCount = 3;
        for (let index = 0; index < skeletonCount; index += 1) {
            const card = document.createElement('article');
            card.className = 'monitor-card monitor-card--skeleton';
            card.setAttribute('aria-hidden', 'true');

            const header = document.createElement('header');
            header.className = 'monitor-card__header';

            const titleSkeleton = document.createElement('div');
            titleSkeleton.className = 'monitor-card__title';
            const titleLine = document.createElement('div');
            titleLine.className = 'skeleton-line skeleton-line--lg';
            const badgeLine = document.createElement('div');
            badgeLine.className = 'skeleton-line skeleton-line--sm';
            titleSkeleton.append(titleLine, badgeLine);

            const actionsSkeleton = document.createElement('div');
            actionsSkeleton.className = 'monitor-card__actions';
            for (let i = 0; i < 2; i += 1) {
                const actionLine = document.createElement('div');
                actionLine.className = 'skeleton-line skeleton-line--sm';
                actionsSkeleton.appendChild(actionLine);
            }

            header.append(titleSkeleton, actionsSkeleton);
            card.appendChild(header);

            const meta = document.createElement('dl');
            meta.className = 'monitor-card__meta';
            for (let i = 0; i < 4; i += 1) {
                const row = document.createElement('div');
                row.className = 'monitor-card__row';
                const label = document.createElement('div');
                label.className = 'skeleton-line skeleton-line--sm';
                const value = document.createElement('div');
                value.className = 'skeleton-line skeleton-line--sm';
                row.append(label, value);
                meta.appendChild(row);
            }

            card.appendChild(meta);
            ui.monitorList.appendChild(card);
        }
    }

    function renderEmpty(message = '未添加监控') {
        if (!ui.monitorList) {
            return;
        }
        ui.monitorList.innerHTML = '';
        const container = document.createElement('div');
        container.className = 'empty-state';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');

        const title = document.createElement('p');
        title.className = 'empty-state__title';
        title.textContent = message;

        const subtitle = document.createElement('p');
        subtitle.className = 'empty-state__subtitle';
        subtitle.textContent = '点击“添加监控”以创建新的监控任务。';

        container.append(title, subtitle);

        if (typeof openAddModal === 'function') {
            const actionButton = document.createElement('button');
            actionButton.type = 'button';
            actionButton.className = 'primary-btn';
            actionButton.textContent = '立即添加监控';
            actionButton.setAttribute('aria-label', '立即添加一个新的监控实例');
            actionButton.addEventListener('click', () => {
                openAddModal();
            });
            container.appendChild(actionButton);
        }

        ui.monitorList.append(container);
    }

    function focusMonitorCard(vpsId) {
        if (!ui.monitorList || !vpsId) {
            return;
        }
        const targetCard = ui.monitorList.querySelector(`[data-monitor-id="${vpsId}"]`);
        if (targetCard) {
            requestAnimationFrame(() => {
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetCard.classList.add('monitor-card--highlight');
                window.setTimeout(() => {
                    targetCard.classList.remove('monitor-card--highlight');
                }, 3200);
            });
        }
    }

    function normalizeMonitor(item) {
        if (!item) {
            return null;
        }
        if (Array.isArray(item)) {
            const [
                id,
                name,
                ops,
                creationDate,
                expiryDisplay,
                location,
                updateTime,
                rawState,
                expiryIso,
            ] = item;
            const updateTimeIso = updateTime ?? null;
            return {
                id,
                name,
                ops,
                creationDate,
                expiryDisplay,
                location,
                updateTimeIso,
                updateTimeDisplay: formatMalaysiaDateTime(updateTimeIso),
                rawState,
                expiryIso,
            };
        }
        if (typeof item === 'object') {
            const updateTimeIso = item.updateTime ?? item.updatedAt ?? null;
            return {
                id: item.id ?? item.monitorId ?? null,
                name: item.name ?? null,
                ops: item.ops ?? item.provider ?? null,
                creationDate: item.creationDate ?? item.createdAt ?? null,
                expiryDisplay: item.expiryDisplay ?? item.validUntilDisplay ?? item.validUntil ?? '',
                location: item.location ?? null,
                updateTimeIso,
                updateTimeDisplay: formatMalaysiaDateTime(updateTimeIso),
                rawState: item.state ?? item.rawState ?? null,
                expiryIso: item.expiryIso ?? item.expiryUTC ?? item.expiryUtc ?? null,
            };
        }
        return null;
    }

    function updateSummary(monitors = []) {
        if (!summaryOutputs.total && !summaryOutputs.upcoming && !summaryOutputs.healthy) {
            return;
        }
        const list = Array.isArray(monitors) ? monitors : [];
        let upcomingCount = 0;
        let healthyCount = 0;

        for (const item of list) {
            if (!item) {
                continue;
            }
            const expiryStatus = resolveExpiryStatus(item.expiryIso, item.expiryDisplay);
            if (expiryStatus.variant === 'warning') {
                upcomingCount += 1;
            }

            const cookieStatus = resolveCookieStatus(item.rawState);
            if (cookieStatus.variant === 'success') {
                healthyCount += 1;
            }
        }

        if (summaryOutputs.total) {
            summaryOutputs.total.textContent = String(list.length);
        }
        if (summaryOutputs.upcoming) {
            summaryOutputs.upcoming.textContent = String(upcomingCount);
        }
        if (summaryOutputs.healthy) {
            summaryOutputs.healthy.textContent = String(healthyCount);
        }
    }

    function updateMonitors(monitors) {
        const normalized = Array.isArray(monitors)
            ? monitors.map(normalizeMonitor).filter((item) => item !== null)
            : [];
        state.monitors = normalized;
        updateSummary(state.monitors);
        renderMonitors();
        if (typeof notificationManager !== 'undefined' && notificationManager.checkExpiringVPS) {
            notificationManager.checkExpiringVPS(state.monitors);
        }
    }

    function renderMonitors() {
        if (!ui.monitorList) {
            return;
        }
        ui.monitorList.innerHTML = '';
        autoCardId = 0;
        if (!state.monitors.length) {
            renderEmpty();
            return;
        }
        const fragment = document.createDocumentFragment();
        state.monitors.forEach((item) => {
            const card = buildMonitorCard(item);
            fragment.appendChild(card);
        });
        ui.monitorList.appendChild(fragment);
        if (state.focusTargetId) {
            focusMonitorCard(state.focusTargetId);
            state.focusTargetId = null;
        }
    }

    function buildMonitorCard(item) {
        if (!item) {
            const placeholder = document.createElement('article');
            placeholder.className = 'monitor-card';
            return placeholder;
        }
        const {
            id,
            name,
            ops,
            creationDate,
            expiryDisplay,
            location,
            updateTimeDisplay,
            updateTimeIso,
            rawState,
            expiryIso,
        } = item;
        const expiry = resolveExpiryStatus(expiryIso, expiryDisplay);
        const cookieStatus = resolveCookieStatus(rawState);
        const displayName = name || '未命名实例';
        const displayOps = typeof ops === 'string' ? ops.toUpperCase() : '未知';

        const card = document.createElement('article');
        card.className = 'monitor-card';
        card.dataset.monitorId = id != null ? String(id) : '';
        card.dataset.cookieState = cookieStatus.variant;
        card.dataset.expiryState = expiry.variant;

        const headingId =
            id != null ? `monitor-card-title-${id}` : `monitor-card-title-auto-${(autoCardId += 1)}`;
        card.setAttribute('aria-labelledby', headingId);

        const header = document.createElement('header');
        header.className = 'monitor-card__header';

        const title = document.createElement('h3');
        title.className = 'monitor-card__title';
        title.id = headingId;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = displayName;
        nameSpan.title = displayName;
        title.appendChild(nameSpan);

        const opsBadge = document.createElement('span');
        opsBadge.className = 'ops-badge';
        opsBadge.textContent = displayOps;
        opsBadge.setAttribute('aria-label', `服务商 ${displayOps}`);
        opsBadge.title = `服务商 ${displayOps}`;
        title.appendChild(opsBadge);

        header.appendChild(title);

        const actions = document.createElement('div');
        actions.className = 'monitor-card__actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'ghost-btn';
        editButton.dataset.action = 'edit';
        editButton.dataset.id = id != null ? String(id) : '';
        editButton.dataset.name = displayName;
        editButton.textContent = '修改';
        editButton.setAttribute('aria-label', `修改监控「${displayName}」`);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'danger-btn';
        deleteButton.dataset.action = 'delete';
        deleteButton.dataset.id = id != null ? String(id) : '';
        deleteButton.dataset.name = displayName;
        deleteButton.textContent = '删除';
        deleteButton.setAttribute('aria-label', `删除监控「${displayName}」`);

        actions.append(editButton, deleteButton);
        header.appendChild(actions);
        card.appendChild(header);

        const meta = document.createElement('dl');
        meta.className = 'monitor-card__meta';
        meta.setAttribute('aria-label', '监控详情');

        const cookieBadge = createStatusBadge(cookieStatus.label, cookieStatus.variant, {
            ariaLabel: `Cookie 状态：${cookieStatus.label}`,
            tooltip: cookieStatus.label,
        });

        const expiryValue = document.createDocumentFragment();
        const expiryBadge = createStatusBadge(expiry.label, expiry.variant, {
            ariaLabel: `过期状态：${expiry.label}`,
            tooltip: expiry.display || expiry.label,
        });
        expiryValue.appendChild(expiryBadge);
        const expiryTimeNode = createTimeDisplayNode(expiry.display, expiryIso);
        if (expiryTimeNode) {
            expiryValue.appendChild(document.createTextNode(' '));
            expiryValue.appendChild(expiryTimeNode);
        } else {
            const placeholder = document.createElement('span');
            placeholder.textContent = '—';
            expiryValue.appendChild(document.createTextNode(' '));
            expiryValue.appendChild(placeholder);
        }

        const updateTimeNode = createTimeDisplayNode(updateTimeDisplay, updateTimeIso);
        const locationValue = location || '—';
        const creationValue = creationDate || '—';

        meta.append(
            createMetaRow('Cookie 状态', cookieBadge, {
                field: 'cookie-status',
                valueTitle: cookieStatus.label,
                valueState: cookieStatus.variant,
            }),
            createMetaRow('过期时间', expiryValue, {
                field: 'expiry',
                valueTitle: expiry.display || expiry.label,
                valueState: expiry.variant,
            }),
            createMetaRow('最近查询时间', updateTimeNode || '—', {
                field: 'last-checked',
                valueTitle: updateTimeDisplay || undefined,
            }),
            createMetaRow('位置', locationValue, {
                field: 'location',
                valueTitle: location || undefined,
            }),
            createMetaRow('创建时间', creationValue, {
                field: 'created-at',
                valueTitle: creationDate || undefined,
            }),
        );
        card.appendChild(meta);

        return card;
    }

    function createStatusBadge(label, variant, { ariaLabel, tooltip } = {}) {
        const safeVariant = typeof variant === 'string' && variant ? variant : 'neutral';
        const textContent = label || '未知';
        const badge = document.createElement('span');
        badge.className = `status-badge status-badge--${safeVariant}`;
        badge.dataset.variant = safeVariant;
        badge.textContent = textContent;
        if (ariaLabel) {
            badge.setAttribute('aria-label', ariaLabel);
        } else {
            badge.setAttribute('aria-label', textContent);
        }
        if (tooltip) {
            badge.title = tooltip;
        } else {
            badge.title = textContent;
        }
        return badge;
    }

    function createTimeDisplayNode(displayValue, isoValue) {
        if (!displayValue) {
            return null;
        }
        const cleanDisplay = String(displayValue).trim();
        if (!cleanDisplay) {
            return null;
        }
        const normalized = cleanDisplay.replace(/\s+/g, '');
        if (normalized === '—' || normalized === '--') {
            return null;
        }
        const timeEl = document.createElement('time');
        timeEl.textContent = cleanDisplay;
        timeEl.title = cleanDisplay;
        if (isoValue) {
            const parsed = parseExpiryIso(isoValue);
            if (parsed) {
                timeEl.dateTime = parsed.toISOString();
            } else if (typeof isoValue === 'string') {
                timeEl.dateTime = isoValue;
            }
        }
        return timeEl;
    }

    function createMetaRow(label, value, { field, valueTitle, valueState } = {}) {
        const row = document.createElement('div');
        row.className = 'monitor-card__row';
        if (field) {
            row.dataset.field = field;
        }
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        if (value instanceof Node) {
            dd.appendChild(value);
        } else {
            dd.textContent = value;
        }
        if (valueTitle) {
            dd.title = valueTitle;
        }
        if (valueState) {
            dd.dataset.state = valueState;
        }
        row.append(dt, dd);
        return row;
    }

    function resolveCookieStatus(stateValue) {
        const numeric = Number(stateValue);
        if (Number.isNaN(numeric)) {
            return { label: '未知', variant: 'neutral' };
        }
        if (numeric === 1) {
            return { label: '正常', variant: 'success' };
        }
        if (numeric === 2) {
            return { label: '检测中', variant: 'neutral' };
        }
        if (numeric === 0) {
            return { label: '异常', variant: 'danger' };
        }
        return { label: '未知', variant: 'neutral' };
    }

    function parseExpiryIso(value) {
        if (!value) {
            return null;
        }
        let normalized = value;
        if (typeof normalized === 'string' && normalized.includes('.')) {
            normalized = normalized.replace(/(\.\d{3})\d+/, '$1');
        }
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return date;
    }

    function formatMalaysiaDisplay(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
        }
        const datePart = new Intl.DateTimeFormat('en-GB', {
            timeZone: MALAYSIA_TIME_ZONE,
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }).format(date);
        let timePart = new Intl.DateTimeFormat('en-GB', {
            timeZone: MALAYSIA_TIME_ZONE,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).format(date).toUpperCase();
        if (timePart.startsWith('0')) {
            timePart = timePart.slice(1);
        }
        return `${datePart}, ${timePart} ${MALAYSIA_TIME_SUFFIX}`;
    }

    function formatMalaysiaDateTime(value) {
        if (!value) {
            return '';
        }
        const date = value instanceof Date ? value : parseExpiryIso(value);
        if (!date) {
            return '';
        }
        return formatMalaysiaDisplay(date);
    }

    function resolveExpiryStatus(expiryIso, fallbackDisplay) {
        const expiryDate = parseExpiryIso(expiryIso);
        const display = fallbackDisplay || (expiryDate ? formatMalaysiaDisplay(expiryDate) : '');
        if (!expiryDate) {
            return { label: '无状态', variant: 'neutral', display: display || '—' };
        }
        const diffDays = (expiryDate.getTime() - Date.now()) / ONE_DAY_IN_MS;
        if (diffDays > 3) {
            return { label: '正常', variant: 'success', display: display || '—' };
        }
        if (diffDays > 0) {
            return { label: '待续期', variant: 'warning', display: display || '—' };
        }
        return { label: '已过期', variant: 'danger', display: display || '—' };
    }

    function hydrateFromCache() {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (!cached) {
            return false;
        }
        try {
            const parsed = JSON.parse(cached);
            if (parsed && Array.isArray(parsed.msg)) {
                updateMonitors(parsed.msg);
                return true;
            }
        } catch (error) {
            console.warn('[frontend] Failed to parse cached data:', error);
        }
        return false;
    }

    async function refreshData({ silent = false } = {}) {
        if (!silent) {
            setLoading(true);
        }
        const controller = new AbortController();
        const timeout = window.setTimeout(() => {
            controller.abort();
        }, FETCH_TIMEOUT);
        try {
            const response = await fetch('/select', {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            window.clearTimeout(timeout);
            if (!response.ok) {
                throw new Error(`请求失败，状态码 ${response.status}`);
            }
            const data = await response.json();
            const monitors = Array.isArray(data?.msg) ? data.msg : [];
            updateMonitors(monitors);
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ msg: monitors, updatedAt: Date.now() }));
            if (state.offline) {
                state.offline = false;
                hideBanner();
                showToast('网络已恢复', 'success');
            }
        } catch (error) {
            window.clearTimeout(timeout);
            if (!state.offline && !isOnline()) {
                state.offline = true;
                setBanner('网络连接不可用，正在显示缓存内容（如有）。', 'offline', { persist: true });
                showToast('当前离线，已切换为缓存数据。', 'warning');
            } else if (!silent) {
                setBanner('刷新监控数据失败，请稍后再试。', 'error');
                showToast('刷新监控数据失败。', 'error');
            }
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    updateMonitors(parsed?.msg || []);
                } catch (parseError) {
                    console.error('[frontend] Failed to parse cached data:', parseError);
                    renderEmpty('当前无法加载监控数据。');
                }
            } else {
                renderEmpty('当前无法连接到服务器。');
            }
            console.error('[frontend] Failed to refresh data:', error);
        } finally {
            if (!silent) {
                setLoading(false);
            } else {
                state.loading = false;
                ui.monitorList?.setAttribute('aria-busy', 'false');
            }
        }
    }

    function createForm({ mode = 'add', values = {} }) {
        const fragment = ui.formTemplate.content.cloneNode(true);
        const form = fragment.querySelector('form');
        if (!form) {
            return null;
        }

        let idField = form.querySelector('input[name="id"]');
        if (mode === 'edit') {
            if (!idField) {
                idField = document.createElement('input');
                idField.type = 'hidden';
                idField.name = 'id';
                form.appendChild(idField);
            }
            idField.value = values.id || '';
        } else if (idField) {
            idField.remove();
        }

        const opsField = form.querySelector('select[name="ops"]');
        const cookieField = form.querySelector('input[name="cookie"]');
        const nameField = form.querySelector('input[name="name"]');

        if (mode === 'edit') {
            if (opsField && values.ops) {
                opsField.value = values.ops;
            }
            if (cookieField) {
                cookieField.value = values.cookie || '';
            }
            if (nameField) {
                nameField.value = values.name || '';
            }
        }

        const cancelButton = form.querySelector('[data-modal-cancel]');
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                modalManager.close();
            });
        }
        return form;
    }

    async function submitAdd(form) {
        if (!isOnline()) {
            state.offline = true;
            setBanner('网络不可用，无法添加监控。', 'offline', { persist: true });
            showToast('当前离线，无法添加监控。', 'error');
            return;
        }
        const formData = new FormData(form);
        try {
            const response = await fetch('/add', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new Error(`添加失败，状态码 ${response.status}`);
            }
            const payload = await response.json();
            const message = payload?.message || '添加成功';
            showToast(message, 'success');
            modalManager.close();
            refreshData({ silent: true });
        } catch (error) {
            console.error('[frontend] Failed to add monitor:', error);
            showToast('添加失败，请稍后再试。', 'error');
            setBanner('添加失败，请稍后再试。', 'error');
        }
    }

    async function submitEdit(form) {
        if (!isOnline()) {
            state.offline = true;
            setBanner('网络不可用，无法修改监控。', 'offline', { persist: true });
            showToast('当前离线，无法修改。', 'error');
            return;
        }
        const formData = new FormData(form);
        try {
            const response = await fetch('/modify', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new Error(`修改失败，状态码 ${response.status}`);
            }
            const payload = await response.json();
            const message = payload?.msg || '修改成功';
            if (message.includes('成功')) {
                showToast(message, 'success');
                modalManager.close();
                refreshData({ silent: true });
            } else {
                showToast(message, 'error');
                setBanner(message, 'error', { persist: true });
            }
        } catch (error) {
            console.error('[frontend] Failed to modify monitor:', error);
            showToast('修改失败，请稍后再试。', 'error');
            setBanner('修改失败，请稍后再试。', 'error', { persist: true });
        }
    }

    async function handleDelete(id, name) {
        if (!id) {
            return;
        }
        if (!window.confirm(`确定要删除名为 ${name || ''} 的监控吗？`)) {
            return;
        }
        if (!isOnline()) {
            state.offline = true;
            setBanner('网络不可用，无法删除监控。', 'offline', { persist: true });
            showToast('当前离线，无法删除监控。', 'error');
            return;
        }
        try {
            const params = new URLSearchParams();
            params.append('id', id);
            const response = await fetch('/del', {
                method: 'POST',
                body: params,
            });
            if (!response.ok) {
                throw new Error(`删除失败，状态码 ${response.status}`);
            }
            const payload = await response.json();
            const message = payload?.msg || '删除完成';
            if (message.includes('成功')) {
                showToast(message, 'success');
                refreshData({ silent: true });
            } else {
                showToast(message, 'error');
                setBanner(message, 'error', { persist: true });
            }
        } catch (error) {
            console.error('[frontend] Failed to delete monitor:', error);
            showToast('删除失败，请稍后再试。', 'error');
            setBanner('删除失败，请稍后再试。', 'error', { persist: true });
        }
    }

    async function openEditModal(id) {
        if (!id) {
            return;
        }
        if (!isOnline()) {
            state.offline = true;
            setBanner('网络不可用，无法加载监控信息。', 'offline', { persist: true });
            showToast('当前离线，无法加载监控信息。', 'error');
            return;
        }
        const password = window.prompt('请输入验证密码：');
        if (password === null) {
            return;
        }
        try {
            const pwdParams = new URLSearchParams();
            pwdParams.append('pwd', password);
            const pwdResponse = await fetch('/checkPwd', {
                method: 'POST',
                body: pwdParams,
            });
            if (!pwdResponse.ok) {
                throw new Error(`密码验证失败，状态码 ${pwdResponse.status}`);
            }
            const pwdPayload = await pwdResponse.json();
            if (pwdPayload?.msg !== 'success') {
                window.alert('密码验证失败');
                return;
            }

            const detailParams = new URLSearchParams();
            detailParams.append('id', id);
            const detailResponse = await fetch('/sel_id', {
                method: 'POST',
                body: detailParams,
            });

            let detailPayload = null;
            try {
                detailPayload = await detailResponse.json();
            } catch (parseError) {
                detailPayload = null;
            }

            if (detailResponse.status === 404) {
                const message = detailPayload?.error || '未找到监控信息。';
                showToast(message, 'error');
                setBanner(message, 'error', { persist: true });
                return;
            }

            if (detailResponse.status === 400) {
                const message = detailPayload?.error || '请求参数无效。';
                showToast(message, 'error');
                setBanner(message, 'error', { persist: true });
                return;
            }

            if (!detailResponse.ok) {
                throw new Error(`监控信息加载失败，状态码 ${detailResponse.status}`);
            }

            if (detailPayload === null) {
                throw new Error('监控信息加载失败，响应格式无效。');
            }

            const records = Array.isArray(detailPayload?.msg) ? detailPayload.msg : [];
            const record = records[0];
            if (!record) {
                const message = detailPayload?.error || '未找到监控信息。';
                showToast(message, 'error');
                setBanner(message, 'error', { persist: true });
                return;
            }
            const form = createForm({
                mode: 'edit',
                values: {
                    id: record[0],
                    name: record[1],
                    ops: record[2],
                    cookie: record[3],
                },
            });
            if (!form) {
                showToast('无法加载编辑表单。', 'error');
                return;
            }
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                submitEdit(form);
            });
            modalManager.open({
                title: '修改监控信息',
                content: form,
                focusSelector: 'input[name="name"]',
            });
        } catch (error) {
            console.error('[frontend] Failed to load monitor detail:', error);
            showToast('加载监控信息失败，请稍后再试。', 'error');
            setBanner('加载监控信息失败，请稍后再试。', 'error', { persist: true });
        }
    }

    function openAddModal() {
        const form = createForm({ mode: 'add' });
        if (!form) {
            showToast('无法加载添加表单。', 'error');
            return;
        }
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            submitAdd(form);
        });
        modalManager.open({
            title: '添加一个监控',
            content: form,
            focusSelector: 'input[name="name"]',
        });
    }

    function handleMonitorListClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button || !ui.monitorList.contains(button)) {
            return;
        }
        const { action, id, name } = button.dataset;
        if (action === 'delete') {
            handleDelete(id, name);
        } else if (action === 'edit') {
            openEditModal(id);
        }
    }

    function handleOnline() {
        state.offline = false;
        hideBanner();
        showToast('网络已恢复', 'success');
        refreshData({ silent: true });
    }

    function handleOffline() {
        state.offline = true;
        setBanner('网络连接不可用，正在显示缓存内容（如有）。', 'offline', { persist: true });
        showToast('当前离线，将显示缓存数据。', 'warning');
    }

    function setupInstallPrompt() {
        if (!ui.installButton) {
            return;
        }
        ui.installButton.addEventListener('click', async () => {
            if (!state.deferredPrompt) {
                return;
            }
            state.deferredPrompt.prompt();
            try {
                await state.deferredPrompt.userChoice;
            } finally {
                state.deferredPrompt = null;
                ui.installButton.classList.add('hidden');
            }
        });

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            state.deferredPrompt = event;
            ui.installButton.classList.remove('hidden');
            showToast('提示：可将此应用安装到桌面。', 'info');
        });

        window.addEventListener('appinstalled', () => {
            state.deferredPrompt = null;
            ui.installButton.classList.add('hidden');
            showToast('应用安装成功！', 'success');
        });
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js').catch((error) => {
                    console.error('[frontend] Service worker registration failed:', error);
                });
            });
        }
    }

    const notificationManager = createNotificationManager({
        panelEl: document.getElementById('notificationSettings'),
        togglePanelBtn: document.getElementById('toggleNotificationSettingsBtn'),
        permissionStatusEl: document.getElementById('notificationPermissionStatus'),
        toggleEl: document.getElementById('notificationToggle'),
        requestPermissionBtn: document.getElementById('requestPermissionBtn'),
        testNotificationBtn: document.getElementById('testNotificationBtn'),
        openBrowserSettingsBtn: document.getElementById('openBrowserNotificationSettingsBtn'),
        supportHintEl: document.getElementById('notificationSupportHint'),
        showToast,
    });

    function cleanup() {
        if (state.refreshTimer) {
            window.clearInterval(state.refreshTimer);
            state.refreshTimer = null;
        }
        if (bannerTimeoutId) {
            window.clearTimeout(bannerTimeoutId);
            bannerTimeoutId = null;
        }
    }

    function init() {
        updateSummary(state.monitors);
        hydrateFromCache();
        if (state.offline) {
            setBanner('当前处于离线状态，正在显示缓存内容。', 'offline', { persist: true });
        }
        refreshData();
        state.refreshTimer = window.setInterval(() => {
            refreshData({ silent: true });
        }, REFRESH_INTERVAL);

        ui.addButton?.addEventListener('click', openAddModal);
        ui.monitorList?.addEventListener('click', handleMonitorListClick);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('beforeunload', cleanup);

        setupInstallPrompt();
        registerServiceWorker();
    }

    init();
}

function createModalManager({ modal, overlay, titleEl, bodyEl }) {
    let lastFocusedElement = null;
    let onCloseCallback = null;

    function close() {
        if (!modal || modal.classList.contains('hidden')) {
            return;
        }
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        overlay?.classList.add('hidden');
        bodyEl?.replaceChildren();
        const callback = onCloseCallback;
        onCloseCallback = null;
        const previousFocus = lastFocusedElement;
        lastFocusedElement = null;
        document.removeEventListener('keydown', trapFocus);
        if (previousFocus && typeof previousFocus.focus === 'function') {
            requestAnimationFrame(() => {
                previousFocus.focus({ preventScroll: true });
            });
        }
        if (typeof callback === 'function') {
            callback();
        }
    }

    function trapFocus(event) {
        if (!modal || modal.classList.contains('hidden')) {
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== 'Tab') {
            return;
        }
        const focusableElements = Array.from(modal.querySelectorAll(FOCUSABLE_SELECTORS)).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
        if (!focusableElements.length) {
            event.preventDefault();
            return;
        }
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        if (event.shiftKey) {
            if (document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
        } else if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function open({ title = '', content, focusSelector, onClose } = {}) {
        if (!modal || !overlay || !bodyEl) {
            return;
        }
        close();
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        overlay.classList.remove('hidden');
        bodyEl.replaceChildren(content);
        titleEl.textContent = title || '';
        onCloseCallback = typeof onClose === 'function' ? onClose : null;
        document.addEventListener('keydown', trapFocus);
        requestAnimationFrame(() => {
            const focusTarget = focusSelector ? modal.querySelector(focusSelector) : null;
            const candidate = (focusTarget instanceof HTMLElement ? focusTarget : modal.querySelector(FOCUSABLE_SELECTORS)) || modal;
            if (candidate && typeof candidate.focus === 'function') {
                candidate.focus();
            }
        });
    }

    overlay?.addEventListener('click', close);
    modal?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        if (target.closest('[data-modal-close]') || target.closest('[data-modal-cancel]')) {
            event.preventDefault();
            close();
        }
    });

    return { open, close };
}

function createNotificationManager({
    panelEl,
    togglePanelBtn,
    permissionStatusEl,
    toggleEl,
    requestPermissionBtn,
    testNotificationBtn,
    openBrowserSettingsBtn,
    supportHintEl,
    showToast,
}) {
    const STORAGE_KEY_ENABLED = 'pwa-notifications-enabled';
    const STORAGE_KEY_CHECKED_EXPIRY = 'pwa-notifications-checked-expiry';

    let enabled = localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
    let lastCheckedExpiry = new Set();

    try {
        const stored = localStorage.getItem(STORAGE_KEY_CHECKED_EXPIRY);
        if (stored) {
            lastCheckedExpiry = new Set(JSON.parse(stored));
        }
    } catch (error) {
        console.warn('[notifications] Failed to parse checked expiry list:', error);
    }

    function isNotificationSupported() {
        return 'Notification' in window && 'serviceWorker' in navigator;
    }

    function getPermissionStatus() {
        if (!isNotificationSupported()) {
            return 'unsupported';
        }
        return Notification.permission;
    }

    function updatePermissionStatusUI() {
        if (!permissionStatusEl) {
            return;
        }
        const status = getPermissionStatus();
        let text = '不支持';
        let state = 'default';

        if (status === 'granted') {
            text = '已授权 ✓';
            state = 'granted';
        } else if (status === 'denied') {
            text = '已拒绝 ✗';
            state = 'denied';
        } else if (status === 'default') {
            text = '未请求';
            state = 'default';
        } else {
            text = '不支持';
            state = 'default';
        }

        permissionStatusEl.textContent = text;
        permissionStatusEl.setAttribute('data-state', state);
    }

    function updateUI() {
        updatePermissionStatusUI();

        if (toggleEl) {
            toggleEl.checked = enabled;
            toggleEl.disabled = getPermissionStatus() !== 'granted';
        }

        if (requestPermissionBtn) {
            const status = getPermissionStatus();
            requestPermissionBtn.disabled = status === 'granted' || status === 'denied' || status === 'unsupported';
        }

        if (testNotificationBtn) {
            testNotificationBtn.disabled = !enabled || getPermissionStatus() !== 'granted';
        }

        if (supportHintEl) {
            if (!isNotificationSupported()) {
                supportHintEl.textContent = '您的浏览器不支持通知功能。请使用现代浏览器（Chrome、Edge、Firefox）。';
            } else if (getPermissionStatus() === 'denied') {
                supportHintEl.textContent = '您已拒绝通知权限。如需启用，请在浏览器设置中允许通知。';
            } else {
                supportHintEl.textContent = '';
            }
        }
    }

    function syncPanelVisibility() {
        if (!panelEl) {
            return;
        }
        const hidden = panelEl.classList.contains('hidden');
        panelEl.setAttribute('aria-hidden', hidden ? 'true' : 'false');
        if (togglePanelBtn) {
            togglePanelBtn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
        }
    }

    async function requestPermission() {
        if (!isNotificationSupported()) {
            if (showToast) {
                showToast('您的浏览器不支持通知功能。', 'error');
            }
            return false;
        }

        if (getPermissionStatus() === 'denied') {
            if (showToast) {
                showToast('通知权限已被拒绝，请在浏览器设置中允许。', 'error');
            }
            return false;
        }

        try {
            const result = await Notification.requestPermission();
            updateUI();

            if (result === 'granted') {
                if (showToast) {
                    showToast('通知权限已授予！', 'success');
                }
                setEnabled(true);
                return true;
            } else if (result === 'denied') {
                if (showToast) {
                    showToast('通知权限被拒绝。', 'error');
                }
                return false;
            } else {
                if (showToast) {
                    showToast('通知权限请求已取消。', 'info');
                }
                return false;
            }
        } catch (error) {
            console.error('[notifications] Failed to request permission:', error);
            if (showToast) {
                showToast('请求通知权限失败。', 'error');
            }
            return false;
        }
    }

    function setEnabled(value) {
        enabled = Boolean(value);
        localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
        updateUI();
    }

    async function showNotification(title, options = {}) {
        if (!enabled || getPermissionStatus() !== 'granted') {
            console.warn('[notifications] Notifications are disabled or permission not granted');
            return null;
        }

        try {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title,
                    options,
                });
                return true;
            } else {
                const notification = new Notification(title, options);
                return notification;
            }
        } catch (error) {
            console.error('[notifications] Failed to show notification:', error);
            return null;
        }
    }

    async function testNotification() {
        if (!enabled) {
            if (showToast) {
                showToast('请先启用通知功能。', 'warning');
            }
            return;
        }

        if (getPermissionStatus() !== 'granted') {
            if (showToast) {
                showToast('请先授予通知权限。', 'warning');
            }
            return;
        }

        const result = await showNotification('测试通知', {
            body: '这是一条测试通知，用于验证浏览器通知功能正常工作。',
            icon: '/icons/app-icon-192.png',
            badge: '/icons/app-icon-96.png',
            tag: 'test-notification',
            requireInteraction: false,
            data: { type: 'test' },
        });

        if (result && showToast) {
            showToast('测试通知已发送！', 'success');
        }
    }

    function checkExpiringVPS(monitors) {
        if (!enabled || getPermissionStatus() !== 'granted') {
            return;
        }

        if (!Array.isArray(monitors) || monitors.length === 0) {
            return;
        }

        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const newChecked = new Set();

        for (const monitor of monitors) {
            if (!monitor || !monitor.id) {
                continue;
            }

            const monitorKey = `${monitor.id}`;
            newChecked.add(monitorKey);

            if (lastCheckedExpiry.has(monitorKey)) {
                continue;
            }

            const expiryDate = monitor.expiryIso ? new Date(monitor.expiryIso) : null;
            if (!expiryDate || isNaN(expiryDate.getTime())) {
                continue;
            }

            const diffMs = expiryDate.getTime() - now;
            const diffDays = diffMs / ONE_DAY_MS;

            const cookieAbnormal = monitor.rawState === 0 || monitor.rawState === '0';

            if (diffDays > 0 && diffDays <= 3) {
                const daysText = Math.ceil(diffDays) === 1 ? '1 天' : `${Math.ceil(diffDays)} 天`;
                showNotification(`VPS 即将到期 - ${monitor.name || '未命名'}`, {
                    body: `您的 ${monitor.ops?.toUpperCase() || '未知'} VPS 将在 ${daysText} 后到期（${monitor.expiryDisplay || ''}）。请及时续期。`,
                    icon: '/icons/app-icon-192.png',
                    badge: '/icons/app-icon-96.png',
                    tag: `expiry-${monitor.id}`,
                    requireInteraction: true,
                    data: { type: 'expiry', vpsId: monitor.id },
                });
            } else if (cookieAbnormal) {
                showNotification(`Cookie 异常 - ${monitor.name || '未命名'}`, {
                    body: `您的 ${monitor.ops?.toUpperCase() || '未知'} VPS 的 Cookie 状态异常，可能需要更新。`,
                    icon: '/icons/app-icon-192.png',
                    badge: '/icons/app-icon-96.png',
                    tag: `cookie-${monitor.id}`,
                    requireInteraction: false,
                    data: { type: 'cookie-failure', vpsId: monitor.id },
                });
            }
        }

        lastCheckedExpiry = newChecked;
        try {
            localStorage.setItem(STORAGE_KEY_CHECKED_EXPIRY, JSON.stringify(Array.from(lastCheckedExpiry)));
        } catch (error) {
            console.warn('[notifications] Failed to save checked expiry list:', error);
        }
    }

    function togglePanel() {
        if (!panelEl) {
            return;
        }
        const isHidden = panelEl.classList.contains('hidden');
        if (isHidden) {
            panelEl.classList.remove('hidden');
        } else {
            panelEl.classList.add('hidden');
        }
        syncPanelVisibility();
    }

    if (togglePanelBtn) {
        togglePanelBtn.addEventListener('click', togglePanel);
    }

    if (requestPermissionBtn) {
        requestPermissionBtn.addEventListener('click', requestPermission);
    }

    if (testNotificationBtn) {
        testNotificationBtn.addEventListener('click', testNotification);
    }

    if (toggleEl) {
        toggleEl.addEventListener('change', (event) => {
            setEnabled(event.target.checked);
            if (enabled && showToast) {
                showToast('通知功能已启用。', 'success');
            } else if (showToast) {
                showToast('通知功能已禁用。', 'info');
            }
        });
    }

    if (openBrowserSettingsBtn) {
        openBrowserSettingsBtn.addEventListener('click', () => {
            if (showToast) {
                showToast('请在浏览器地址栏点击锁图标，进入"网站设置"管理通知权限。', 'info', { duration: 6000 });
            }
        });
    }

    syncPanelVisibility();
    updateUI();

    return {
        isSupported: isNotificationSupported,
        getPermission: getPermissionStatus,
        requestPermission,
        showNotification,
        checkExpiringVPS,
        isEnabled: () => enabled,
        updateUI,
    };
}
