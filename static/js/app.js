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
    const state = {
        monitors: [],
        loading: false,
        offline: !navigator.onLine,
        refreshTimer: null,
        deferredPrompt: null,
    };

    let bannerTimeoutId = null;

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
        toast.setAttribute('role', 'alert');
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
        for (let index = 0; index < 3; index += 1) {
            const card = document.createElement('article');
            card.className = 'monitor-card monitor-card--skeleton';

            const header = document.createElement('div');
            header.className = 'monitor-card__header';
            const titleSkeleton = document.createElement('div');
            titleSkeleton.className = 'skeleton-line skeleton-line--lg';
            header.appendChild(titleSkeleton);
            card.appendChild(header);

            const meta = document.createElement('div');
            meta.className = 'monitor-card__meta';
            for (let i = 0; i < 3; i += 1) {
                const line = document.createElement('div');
                line.className = 'skeleton-line';
                meta.appendChild(line);
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

        const title = document.createElement('p');
        title.className = 'empty-state__title';
        title.textContent = message;

        const subtitle = document.createElement('p');
        subtitle.className = 'empty-state__subtitle';
        subtitle.textContent = '点击“添加监控”以创建新的监控任务。';

        container.append(title, subtitle);
        ui.monitorList.append(container);
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
    }

    function renderMonitors() {
        if (!ui.monitorList) {
            return;
        }
        ui.monitorList.innerHTML = '';
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
            rawState,
            expiryIso,
        } = item;
        const expiry = resolveExpiryStatus(expiryIso, expiryDisplay);
        const cookieStatus = resolveCookieStatus(rawState);
        const displayName = name || '未命名实例';
        const displayOps = ops ? ops.toUpperCase() : '未知';

        const card = document.createElement('article');
        card.className = 'monitor-card';
        card.dataset.monitorId = id != null ? String(id) : '';

        const header = document.createElement('div');
        header.className = 'monitor-card__header';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'monitor-card__title';

        const title = document.createElement('span');
        title.textContent = displayName;
        titleWrap.appendChild(title);

        const opsBadge = document.createElement('span');
        opsBadge.className = 'ops-badge';
        opsBadge.textContent = displayOps;
        titleWrap.appendChild(opsBadge);

        const actions = document.createElement('div');
        actions.className = 'monitor-card__actions';

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'ghost-btn';
        editButton.dataset.action = 'edit';
        editButton.dataset.id = id != null ? String(id) : '';
        editButton.dataset.name = displayName;
        editButton.textContent = '修改';

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'danger-btn';
        deleteButton.dataset.action = 'delete';
        deleteButton.dataset.id = id != null ? String(id) : '';
        deleteButton.dataset.name = displayName;
        deleteButton.textContent = '删除';

        actions.append(editButton, deleteButton);
        header.append(titleWrap, actions);
        card.appendChild(header);

        const meta = document.createElement('dl');
        meta.className = 'monitor-card__meta';
        meta.append(
            createMetaRow('Cookie 状态', createStatusBadge(cookieStatus.label, cookieStatus.variant)),
            createMetaRow('过期时间', expiry.display || '—'),
            createMetaRow('最近查询时间', updateTimeDisplay || '—'),
            createMetaRow('位置', location || '—'),
            createMetaRow('创建时间', creationDate || '—'),
        );
        card.appendChild(meta);

        return card;
    }

    function createStatusBadge(label, variant) {
        const badge = document.createElement('span');
        badge.className = `status-badge status-badge--${variant}`;
        badge.textContent = label;
        return badge;
    }

    function createMetaRow(label, value) {
        const row = document.createElement('div');
        row.className = 'monitor-card__row';
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        if (value instanceof Node) {
            dd.appendChild(value);
        } else {
            dd.textContent = value;
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
        return { label: '异常', variant: 'danger' };
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
            if (!detailResponse.ok) {
                throw new Error(`监控信息加载失败，状态码 ${detailResponse.status}`);
            }
            const detailPayload = await detailResponse.json();
            const record = Array.isArray(detailPayload?.msg) ? detailPayload.msg[0] : null;
            if (!record) {
                showToast('未找到监控信息。', 'error');
                setBanner('未找到监控信息。', 'error', { persist: true });
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
