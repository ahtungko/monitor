(function () {
    'use strict';

    const addTrigger = document.querySelector('.add_span a');
    const addWindow = document.querySelector('.add_window');
    const overlay = document.querySelector('.overlay');
    const addForm = document.getElementById('add');
    const closeAddButton = document.getElementById('close_add');
    const modifyContainer = document.querySelector('.modify_window');
    const contentEl = document.querySelector('.content');
    const statusBanner = document.getElementById('statusBanner');
    const installButton = document.getElementById('installBtn');

    if (!contentEl) {
        return;
    }

    const STORAGE_KEY = 'renewal-monitor-cache';
    const REFRESH_INTERVAL = 20000;

    let activeModal = null;
    let refreshTimer = null;
    let deferredPrompt = null;
    let statusTimeoutId = null;

    const isOnline = () => navigator.onLine;

    function openModal(element) {
        if (!element) {
            return;
        }
        closeActiveModal();
        element.style.display = 'flex';
        if (overlay) {
            overlay.style.display = 'block';
        }
        activeModal = element;
    }

    function closeActiveModal() {
        if (activeModal) {
            activeModal.style.display = 'none';
            activeModal = null;
        }
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    function hideStatus() {
        if (!statusBanner) {
            return;
        }
        statusBanner.textContent = '';
        statusBanner.dataset.state = '';
        statusBanner.classList.add('hidden');
    }

    function showStatus(message, state = 'info', { persist = false } = {}) {
        if (!statusBanner) {
            return;
        }
        statusBanner.textContent = message;
        statusBanner.dataset.state = state;
        statusBanner.classList.remove('hidden');
        if (statusTimeoutId) {
            window.clearTimeout(statusTimeoutId);
            statusTimeoutId = null;
        }
        if (!persist && state !== 'offline') {
            statusTimeoutId = window.setTimeout(() => {
                hideStatus();
                statusTimeoutId = null;
            }, 4000);
        }
    }

    function handleOffline(message) {
        showStatus(message || '网络连接不可用，正在显示缓存内容。', 'offline', { persist: true });
    }

    function handleOnline() {
        showStatus('网络已恢复。', 'success');
    }

    function ckState(state) {
        let monitorStat = '异常';
        let monitorColor = 'red';
        if (state === 1 || state === '1') {
            monitorStat = '正常';
            monitorColor = 'green';
        }
        return [monitorStat, monitorColor];
    }

    function ckDate(state) {
        const target = new Date(state);
        if (Number.isNaN(target.getTime())) {
            return ['无状态', 'red'];
        }
        let dt = ((target.getTime() - Date.now()) / 1000).toFixed(2);
        dt = dt / 3600 / 24;
        if (dt > 3) {
            return ['正常', 'green'];
        }
        if (dt > 0 && dt <= 3) {
            return ['待续期', 'yellow'];
        }
        if (dt > 10 || dt < 0) {
            return ['已过期', 'red'];
        }
        return ['无状态', 'red'];
    }

    function toUtc8Display(validUntil) {
        if (!validUntil) {
            return { iso: null, display: 'null' };
        }
        const pstTime = new Date(`${validUntil} 00:00:00 PST`);
        if (Number.isNaN(pstTime.getTime())) {
            return { iso: null, display: 'null' };
        }
        pstTime.setHours(pstTime.getHours() + 23);
        pstTime.setMinutes(pstTime.getMinutes() + 59);
        pstTime.setSeconds(pstTime.getSeconds() + 59);
        const timeZoneOffset = new Date().getTimezoneOffset() * 60 * 1000;
        const utcTimestamp = pstTime.getTime() - timeZoneOffset;
        const utcTime = new Date(utcTimestamp);
        if (Number.isNaN(utcTime.getTime())) {
            return { iso: null, display: 'null' };
        }
        const iso = utcTime.toISOString();
        const display = `${iso.replace('T', ' ').replace('Z', '').substring(0, 19)} UTC+8`;
        return { iso, display };
    }

    function renderEmpty(message) {
        contentEl.innerHTML = '';
        const emptyState = document.createElement('h2');
        emptyState.textContent = message || '未添加监控';
        contentEl.appendChild(emptyState);
    }

    function buildMonitorCard(item) {
        const [id, name, ops, creationDate, validUntil, location, updateTime, state] = item;
        const { display } = toUtc8Display(validUntil);
        const [statusLabel, statusColor] = ckDate(display);
        const [stateLabel, stateColor] = ckState(state);

        const card = document.createElement('div');
        card.className = 'vps';

        const header = document.createElement('div');
        header.id = 'vpsHeader';

        const opsSpan = document.createElement('span');
        opsSpan.id = 'opsVal';
        opsSpan.textContent = ops;
        header.appendChild(opsSpan);

        const nameSpan = document.createElement('span');
        nameSpan.id = 'name';
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status-chip';
        statusSpan.style.color = statusColor;
        statusSpan.style.fontSize = '15px';
        statusSpan.style.width = '55px';
        statusSpan.textContent = statusLabel;
        nameSpan.appendChild(statusSpan);
        nameSpan.appendChild(document.createTextNode(':'));

        const nameText = document.createElement('span');
        nameText.id = 'headerName';
        nameText.textContent = ` ${name}`;
        nameSpan.appendChild(nameText);
        header.appendChild(nameSpan);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.dataset.action = 'delete';
        deleteButton.dataset.id = id;
        deleteButton.dataset.name = name;
        deleteButton.style.color = 'red';
        deleteButton.textContent = '删除';
        header.appendChild(deleteButton);

        const modifyButton = document.createElement('button');
        modifyButton.type = 'button';
        modifyButton.dataset.action = 'modify';
        modifyButton.dataset.id = id;
        modifyButton.dataset.name = name;
        modifyButton.style.color = 'green';
        modifyButton.textContent = '修改';
        header.appendChild(modifyButton);

        card.appendChild(header);

        const info = document.createElement('div');
        info.id = 'vpsInfo';
        info.innerHTML = `
            <span>Cookie状态：</span> <h5 style="color: ${stateColor}">${ops} : ${stateLabel}</h5>
            <span>过期时间：</span> <h5 style="color: #fef50c; font-size: 14px">${display}</h5>
            <span>最近查询时间：</span> <h5 style="color: blue;">${updateTime || '—'}</h5>
            <span>位置：</span> <h5>${location || '—'}</h5>
            <span>Creation Date：</span> <h5 class="ip_address">${creationDate || '—'}</h5>
        `;
        card.appendChild(info);

        return card;
    }

    function renderMonitors(resp) {
        contentEl.innerHTML = '';
        if (!resp || !Array.isArray(resp.msg) || resp.msg.length === 0) {
            renderEmpty('未添加监控');
            return;
        }
        const fragment = document.createDocumentFragment();
        resp.msg.forEach((item) => {
            fragment.appendChild(buildMonitorCard(item));
        });
        contentEl.appendChild(fragment);
    }

    async function refreshData({ silent = false } = {}) {
        if (!silent) {
            showStatus('正在加载最新数据…', 'info');
        }
        try {
            const response = await fetch('/select', { headers: { 'Accept': 'application/json' } });
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            const data = await response.json();
            renderMonitors(data);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            if (!silent) {
                hideStatus();
            }
        } catch (error) {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    renderMonitors(parsed);
                } catch (parseError) {
                    renderEmpty('当前无法加载数据。');
                }
            } else {
                renderEmpty('当前无法连接到服务器。');
            }
            handleOffline('网络不可用，已显示最近一次的缓存数据（如有）。');
            if (!silent) {
                console.error('[PWA] Failed to refresh data:', error);
            }
        }
    }

    async function submitAdd(event) {
        event.preventDefault();
        if (!isOnline()) {
            handleOffline('网络不可用，无法添加监控。');
            return;
        }
        const formData = new FormData(addForm);
        try {
            const response = await fetch('/add', { method: 'POST', body: formData });
            if (!response.ok) {
                throw new Error(`Add failed with status ${response.status}`);
            }
            const payload = await response.json();
            showStatus(payload.message || '添加成功', 'success');
            closeActiveModal();
            addForm.reset();
            refreshData({ silent: true });
        } catch (error) {
            console.error('[PWA] Failed to add monitor:', error);
            showStatus('添加失败，请稍后再试。', 'error', { persist: true });
        }
    }

    async function handleDelete(button) {
        const id = button.dataset.id;
        const name = button.dataset.name || '';
        const confirmed = window.confirm(`确定要删除名为 ${name} 的监控吗？`);
        if (!confirmed) {
            return;
        }
        if (!isOnline()) {
            handleOffline('网络不可用，无法删除监控。');
            return;
        }
        try {
            const params = new URLSearchParams();
            params.append('id', id);
            const response = await fetch('/del', { method: 'POST', body: params });
            if (!response.ok) {
                throw new Error(`Delete failed with status ${response.status}`);
            }
            const payload = await response.json();
            if (payload.msg && payload.msg.indexOf('成功') !== -1) {
                showStatus(payload.msg, 'success');
                refreshData({ silent: true });
            } else {
                showStatus(payload.msg || '删除失败', 'error', { persist: true });
            }
        } catch (error) {
            console.error('[PWA] Failed to delete monitor:', error);
            showStatus('删除失败，请稍后再试。', 'error', { persist: true });
        }
    }

    function bindModifyForm() {
        const modifyForm = document.getElementById('modifyWindow');
        const cancelButton = document.getElementById('cancel');
        if (modifyForm) {
            modifyForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!isOnline()) {
                    handleOffline('网络不可用，无法提交修改。');
                    return;
                }
                const formData = new FormData(modifyForm);
                try {
                    const response = await fetch('/modify', { method: 'POST', body: formData });
                    if (!response.ok) {
                        throw new Error(`Modify failed with status ${response.status}`);
                    }
                    const payload = await response.json();
                    if (payload.msg && payload.msg.indexOf('成功') !== -1) {
                        showStatus(payload.msg, 'success');
                        closeActiveModal();
                        modifyContainer.innerHTML = '';
                        refreshData({ silent: true });
                    } else {
                        showStatus(payload.msg || '修改失败', 'error', { persist: true });
                    }
                } catch (error) {
                    console.error('[PWA] Failed to modify monitor:', error);
                    showStatus('修改失败，请稍后再试。', 'error', { persist: true });
                }
            });
        }
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                closeActiveModal();
                modifyContainer.innerHTML = '';
            });
        }
    }

    async function handleModify(button) {
        const id = button.dataset.id;
        if (!isOnline()) {
            handleOffline('网络不可用，无法加载监控信息。');
            return;
        }
        const pwd = window.prompt('请输入验证密码：');
        if (pwd === null) {
            return;
        }
        try {
            const pwdParams = new URLSearchParams();
            pwdParams.append('pwd', pwd);
            const pwdResp = await fetch('/checkPwd', { method: 'POST', body: pwdParams });
            if (!pwdResp.ok) {
                throw new Error(`Password check failed with status ${pwdResp.status}`);
            }
            const pwdPayload = await pwdResp.json();
            if (pwdPayload.msg !== 'success') {
                window.alert('密码验证失败');
                return;
            }
            const idParams = new URLSearchParams();
            idParams.append('id', id);
            const detailResp = await fetch('/sel_id', { method: 'POST', body: idParams });
            if (!detailResp.ok) {
                throw new Error(`Fetch detail failed with status ${detailResp.status}`);
            }
            const detailPayload = await detailResp.json();
            const record = Array.isArray(detailPayload.msg) ? detailPayload.msg[0] : null;
            if (!record) {
                showStatus('未找到监控信息。', 'error', { persist: true });
                return;
            }
            const ops = record[2];
            modifyContainer.innerHTML = `
                <h2>修改监控信息</h2>
                <form id="modifyWindow">
                    <ul>
                        <li>
                            <input type="text" id="id" name="id" value="${record[0]}" style="display: none" readonly required>
                            <label for="ops">选择小鸡站：</label>
                            <select id="ops" name="ops">
                                <option value="hax" ${ops === 'hax' ? 'selected' : ''}>Hax</option>
                                <option value="woiden" ${ops === 'woiden' ? 'selected' : ''}>Woiden</option>
                                <option value="vc" ${ops === 'vc' ? 'selected' : ''}>Vc</option>
                            </select>
                        </li>
                        <li>
                            <label for="cookie">网页Cookie：</label>
                            <input type="text" id="cookie" name="cookie" value="${record[3]}" required>
                        </li>
                        <li>
                            <label for="name">设置备注名：</label>
                            <input type="text" id="name" name="name" value="${record[1]}" required>
                        </li>
                        <li>
                            <button type="submit" id="modify_commit">提交</button>
                            <button type="button" id="cancel">取消</button>
                        </li>
                    </ul>
                </form>
            `;
            openModal(modifyContainer);
            bindModifyForm();
        } catch (error) {
            console.error('[PWA] Failed to load monitor detail:', error);
            showStatus('加载监控信息失败，请稍后再试。', 'error', { persist: true });
        }
    }

    function handleContentClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button || !contentEl.contains(button)) {
            return;
        }
        const action = button.dataset.action;
        if (action === 'delete') {
            handleDelete(button);
        } else if (action === 'modify') {
            handleModify(button);
        }
    }

    function initEvents() {
        if (addTrigger) {
            addTrigger.addEventListener('click', () => openModal(addWindow));
        }
        if (closeAddButton) {
            closeAddButton.addEventListener('click', closeActiveModal);
        }
        if (overlay) {
            overlay.addEventListener('click', () => {
                closeActiveModal();
                modifyContainer.innerHTML = '';
            });
        }
        if (addForm) {
            addForm.addEventListener('submit', submitAdd);
        }
        if (contentEl) {
            contentEl.addEventListener('click', handleContentClick);
        }
        window.addEventListener('online', () => {
            handleOnline();
            refreshData({ silent: true });
        });
        window.addEventListener('offline', () => handleOffline('网络连接不可用，正在使用缓存数据。'));
    }

    function initInstallPrompt() {
        if (!installButton) {
            return;
        }
        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) {
                return;
            }
            deferredPrompt.prompt();
            try {
                await deferredPrompt.userChoice;
            } finally {
                deferredPrompt = null;
                installButton.classList.add('hidden');
            }
        });

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredPrompt = event;
            installButton.classList.remove('hidden');
            showStatus('应用可安装，点击“安装应用”按钮以添加到桌面。', 'info', { persist: true });
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            installButton.classList.add('hidden');
            showStatus('应用安装成功！', 'success');
        });
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js').catch((error) => {
                    console.error('[PWA] Service worker registration failed:', error);
                });
            });
        }
    }

    function init() {
        initEvents();
        initInstallPrompt();
        registerServiceWorker();
        if (!isOnline()) {
            handleOffline('网络不可用，尝试加载缓存数据。');
        }
        refreshData();
        refreshTimer = window.setInterval(() => refreshData({ silent: true }), REFRESH_INTERVAL);
    }

    init();

    window.addEventListener('beforeunload', () => {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
        }
        if (statusTimeoutId) {
            window.clearTimeout(statusTimeoutId);
        }
    });
})();
