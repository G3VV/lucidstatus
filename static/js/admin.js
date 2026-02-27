/* ── Admin Dashboard JS ───────────────────────────────────────────────────── */
(function () {
    // ── Tabs ──────────────────────────────────────────────────────────────
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });

    let categories = [];
    let servers = [];
    let editingServerId = null;
    let editingCatId = null;

    // ── Fetch helpers ─────────────────────────────────────────────────────
    async function api(url, opts = {}) {
        if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
            opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
            opts.body = JSON.stringify(opts.body);
        }
        const res = await fetch(url, opts);
        return res.json();
    }

    // ══════════════════════════════════════════════════════════════════════
    //  SERVERS TAB
    // ══════════════════════════════════════════════════════════════════════
    async function loadServers() {
        servers = await api('/admin/api/servers');
        renderServers();
    }
    async function loadCategories() {
        categories = await api('/admin/api/categories');
    }

    function renderServers() {
        const list = document.getElementById('servers-list');
        if (!servers.length) {
            list.innerHTML = '<p style="color:var(--text-secondary);padding:12px;">No servers yet.</p>';
            return;
        }
        list.innerHTML = servers.map(s => {
            const catName = (categories.find(c => c.id === s.category_id) || {}).name || '—';
            const seen = s.last_seen ? new Date(s.last_seen).toLocaleString() : 'Never';
            return `<div class="item-row">
                <div class="item-info">
                    <div class="item-name">${esc(s.name)}</div>
                    <div class="item-sub">Category: ${esc(catName)} · Last seen: ${seen}</div>
                </div>
                <div class="item-actions">
                    <button class="btn-secondary btn-small" onclick="showScript(${s.id})">Script</button>
                    <button class="btn-secondary btn-small" onclick="editServer(${s.id})">Edit</button>
                    <button class="btn-danger btn-small" onclick="deleteServer(${s.id})">Delete</button>
                </div>
            </div>`;
        }).join('');
    }

    document.getElementById('btn-add-server').addEventListener('click', () => {
        editingServerId = null;
        document.getElementById('server-modal-title').textContent = 'Add Server';
        document.getElementById('srv-name').value = '';
        document.getElementById('srv-netmax').value = 1000;
        populateCategorySelect();
        document.getElementById('server-modal').style.display = 'flex';
    });

    window.editServer = function (id) {
        const s = servers.find(x => x.id === id);
        if (!s) return;
        editingServerId = id;
        document.getElementById('server-modal-title').textContent = 'Edit Server';
        document.getElementById('srv-name').value = s.name;
        document.getElementById('srv-netmax').value = s.net_max_mbps;
        populateCategorySelect(s.category_id);
        document.getElementById('server-modal').style.display = 'flex';
    };

    function populateCategorySelect(selectedId) {
        const sel = document.getElementById('srv-category');
        sel.innerHTML = categories.map(c =>
            `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`
        ).join('');
    }

    document.getElementById('srv-cancel').addEventListener('click', () => {
        document.getElementById('server-modal').style.display = 'none';
    });

    document.getElementById('srv-save').addEventListener('click', async () => {
        const name = document.getElementById('srv-name').value.trim();
        const catId = parseInt(document.getElementById('srv-category').value);
        const netMax = parseFloat(document.getElementById('srv-netmax').value) || 1000;
        if (!name) return alert('Name is required');
        if (!catId) return alert('Select a category');

        if (editingServerId) {
            await api(`/admin/api/servers/${editingServerId}`, {
                method: 'PUT', body: { name, category_id: catId, net_max_mbps: netMax }
            });
        } else {
            const result = await api('/admin/api/servers', {
                method: 'POST', body: { name, category_id: catId, net_max_mbps: netMax }
            });
            // Show the script immediately after creating
            if (result.bash_script) {
                document.getElementById('server-modal').style.display = 'none';
                showScriptContent(result.bash_script);
                await loadServers();
                return;
            }
        }
        document.getElementById('server-modal').style.display = 'none';
        await loadServers();
    });

    window.deleteServer = async function (id) {
        if (!confirm('Delete this server and all its data?')) return;
        await api(`/admin/api/servers/${id}`, { method: 'DELETE' });
        await loadServers();
    };

    window.showScript = async function (id) {
        const data = await api(`/admin/api/servers/${id}/script`);
        showScriptContent(data.bash_script);
    };

    function showScriptContent(script) {
        document.getElementById('script-content').textContent = script;
        document.getElementById('script-modal').style.display = 'flex';
    }

    document.getElementById('script-copy').addEventListener('click', () => {
        const text = document.getElementById('script-content').textContent;
        navigator.clipboard.writeText(text).then(() => {
            document.getElementById('script-copy').textContent = 'Copied!';
            setTimeout(() => document.getElementById('script-copy').textContent = 'Copy', 1500);
        });
    });
    document.getElementById('script-close').addEventListener('click', () => {
        document.getElementById('script-modal').style.display = 'none';
    });

    // ══════════════════════════════════════════════════════════════════════
    //  CATEGORIES TAB
    // ══════════════════════════════════════════════════════════════════════
    function renderCategories() {
        const list = document.getElementById('categories-list');
        if (!categories.length) {
            list.innerHTML = '<p style="color:var(--text-secondary);padding:12px;">No categories yet.</p>';
            return;
        }
        list.innerHTML = categories.map(c => `<div class="item-row">
            <div class="item-info">
                <div class="item-name">${esc(c.name)}</div>
                <div class="item-sub">Sort order: ${c.sort_order}</div>
            </div>
            <div class="item-actions">
                <button class="btn-secondary btn-small" onclick="editCat(${c.id})">Edit</button>
                <button class="btn-danger btn-small" onclick="deleteCat(${c.id})">Delete</button>
            </div>
        </div>`).join('');
    }

    document.getElementById('btn-add-cat').addEventListener('click', () => {
        editingCatId = null;
        document.getElementById('cat-modal-title').textContent = 'Add Category';
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-order').value = 0;
        document.getElementById('cat-modal').style.display = 'flex';
    });

    window.editCat = function (id) {
        const c = categories.find(x => x.id === id);
        if (!c) return;
        editingCatId = id;
        document.getElementById('cat-modal-title').textContent = 'Edit Category';
        document.getElementById('cat-name').value = c.name;
        document.getElementById('cat-order').value = c.sort_order;
        document.getElementById('cat-modal').style.display = 'flex';
    };

    document.getElementById('cat-cancel').addEventListener('click', () => {
        document.getElementById('cat-modal').style.display = 'none';
    });

    document.getElementById('cat-save').addEventListener('click', async () => {
        const name = document.getElementById('cat-name').value.trim();
        const order = parseInt(document.getElementById('cat-order').value) || 0;
        if (!name) return alert('Name is required');

        if (editingCatId) {
            await api(`/admin/api/categories/${editingCatId}`, {
                method: 'PUT', body: { name, sort_order: order }
            });
        } else {
            await api('/admin/api/categories', {
                method: 'POST', body: { name, sort_order: order }
            });
        }
        document.getElementById('cat-modal').style.display = 'none';
        await loadCategories();
        renderCategories();
    });

    window.deleteCat = async function (id) {
        if (!confirm('Delete this category and all its servers?')) return;
        await api(`/admin/api/categories/${id}`, { method: 'DELETE' });
        await loadCategories();
        renderCategories();
        await loadServers();
    };

    // ══════════════════════════════════════════════════════════════════════
    //  SETTINGS TAB
    // ══════════════════════════════════════════════════════════════════════
    async function loadSettings() {
        const s = await api('/admin/api/settings');
        document.getElementById('set-sitename').value = s.site_name || '';
        document.getElementById('set-discord-webhook').value = s.discord_webhook_url || '';
        if (s.logo) {
            document.getElementById('set-logo-preview').innerHTML = `<img src="${s.logo}">`;
        }
    }

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.append('site_name', document.getElementById('set-sitename').value);
        fd.append('discord_webhook_url', document.getElementById('set-discord-webhook').value);
        const pw = document.getElementById('set-password').value;
        if (pw) fd.append('new_password', pw);
        const logo = document.getElementById('set-logo').files[0];
        if (logo) fd.append('logo', logo);

        const res = await fetch('/admin/api/settings', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.ok) {
            if (data.logo) {
                document.getElementById('set-logo-preview').innerHTML = `<img src="${data.logo}">`;
            }
            alert('Settings saved!');
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    //  THEME TAB
    // ══════════════════════════════════════════════════════════════════════
    const THEME_FIELDS = [
        { key: 'bg_outer', label: 'Background (outer)', type: 'color' },
        { key: 'bg_panel', label: 'Background (panel)', type: 'color' },
        { key: 'bg_card', label: 'Card background', type: 'color' },
        { key: 'bg_bar', label: 'Bar background', type: 'color' },
        { key: 'text_primary', label: 'Text (primary)', type: 'color' },
        { key: 'text_secondary', label: 'Text (secondary)', type: 'color' },
        { key: 'accent', label: 'Accent color', type: 'color' },
        { key: 'border_online', label: 'Online indicator', type: 'color' },
        { key: 'border_offline', label: 'Offline indicator', type: 'color' },
        { key: 'border_partial', label: 'Partial indicator', type: 'color' },
        { key: 'bar_cpu', label: 'CPU bar', type: 'color' },
        { key: 'bar_ram', label: 'RAM bar', type: 'color' },
        { key: 'bar_disk', label: 'Disk bar', type: 'color' },
        { key: 'bar_net_in', label: 'Net In bar', type: 'color' },
        { key: 'bar_net_out', label: 'Net Out bar', type: 'text' },
        { key: 'dot_up', label: 'Uptime dot (up)', type: 'color' },
        { key: 'dot_down', label: 'Uptime dot (down)', type: 'color' },
        { key: 'dot_partial', label: 'Uptime dot (partial)', type: 'color' },
        { key: 'dot_grey', label: 'Uptime dot (no data)', type: 'color' },
        { key: 'glow_from', label: 'Header glow', type: 'text' },
        { key: 'status_operational', label: 'Status: Operational', type: 'color' },
        { key: 'status_degraded', label: 'Status: Degraded', type: 'color' },
        { key: 'status_partial', label: 'Status: Partial outage', type: 'color' },
        { key: 'status_major', label: 'Status: Major outage', type: 'color' },
    ];

    const THEME_DEFAULTS = {
        bg_outer: '#1C2327', bg_panel: '#1E252A', bg_card: '#28333A', bg_bar: '#32434D',
        text_primary: '#F2FAFF', text_secondary: '#8B949E', accent: '#307EB4',
        border_online: '#83FF78', border_offline: '#FF5D5D', border_partial: '#FFD95D',
        bar_cpu: '#78A3FF', bar_ram: '#78FFB5', bar_disk: '#E6FF78',
        bar_net_in: '#C7FF78', bar_net_out: 'rgba(255,183,120,0.75)',
        dot_up: '#83FF78', dot_down: '#FF5D5D', dot_partial: '#FFD95D', dot_grey: '#32434D',
        glow_from: 'rgba(37,111,162,0.1)',
        status_operational: '#83FF78', status_degraded: '#FFD95D',
        status_partial: '#FFB778', status_major: '#FF5D5D',
    };

    let currentTheme = {};

    async function loadTheme() {
        currentTheme = await api('/admin/api/theme');
        renderThemeEditor();
    }

    function renderThemeEditor() {
        const editor = document.getElementById('theme-editor');
        editor.innerHTML = THEME_FIELDS.map(f => {
            const val = currentTheme[f.key] || '';
            if (f.type === 'color') {
                const hexVal = val.startsWith('#') ? val : '#000000';
                return `<div class="theme-field">
                    <label>${f.label}</label>
                    <input type="color" data-key="${f.key}" value="${hexVal}">
                </div>`;
            }
            return `<div class="theme-field">
                <label>${f.label}</label>
                <input type="text" data-key="${f.key}" value="${esc(val)}">
            </div>`;
        }).join('');
    }

    document.getElementById('btn-save-theme').addEventListener('click', async () => {
        const inputs = document.querySelectorAll('#theme-editor input');
        const data = {};
        inputs.forEach(inp => { data[inp.dataset.key] = inp.value; });
        await api('/admin/api/theme', { method: 'POST', body: data });
        alert('Theme saved!');
    });

    document.getElementById('btn-reset-theme').addEventListener('click', async () => {
        if (!confirm('Reset all theme colors to defaults?')) return;
        await api('/admin/api/theme', { method: 'POST', body: THEME_DEFAULTS });
        await loadTheme();
        alert('Theme reset to defaults.');
    });

    // ── Helpers ────────────────────────────────────────────────────────────
    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.style.display = 'none';
        });
    });

    // ── Init ──────────────────────────────────────────────────────────────
    async function init() {
        await loadCategories();
        await loadServers();
        await loadSettings();
        await loadTheme();
        renderCategories();
    }
    init();
})();
