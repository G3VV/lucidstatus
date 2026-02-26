(function () {
    let categories = [];
    let servers = [];

    // ── Helpers ──────────────────────────────────────────────────────────────
    async function api(url, opts = {}) {
        const r = await fetch(url, opts);
        if (r.status === 401 || r.status === 302) {
            window.location.href = '/admin/login';
            return null;
        }
        return r.json();
    }

    function catName(id) {
        const c = categories.find(c => c.id === id);
        return c ? c.name : '—';
    }

    // ── Settings ────────────────────────────────────────────────────────────
    async function loadSettings() {
        const s = await api('/admin/api/settings');
        if (!s) return;
        document.getElementById('inp-site-name').value = s.site_name || '';
        const preview = document.getElementById('logo-preview');
        if (s.logo) { preview.src = s.logo; preview.style.display = 'block'; }
    }

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const r = await fetch('/admin/api/settings', { method: 'POST', body: fd });
        if (r.ok) {
            const data = await r.json();
            if (data.logo) {
                const preview = document.getElementById('logo-preview');
                preview.src = data.logo;
                preview.style.display = 'block';
            }
            showToast('Settings saved');
        }
    });

    // ── Categories ──────────────────────────────────────────────────────────
    async function loadCategories() {
        categories = await api('/admin/api/categories') || [];
        renderCategories();
        populateCatSelect();
    }

    function renderCategories() {
        const tbody = document.querySelector('#cat-table tbody');
        tbody.innerHTML = '';
        categories.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(c.name)}</td>
                <td>${c.sort_order}</td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteCategory(${c.id})">Delete</button></td>`;
            tbody.appendChild(tr);
        });
    }

    function populateCatSelect() {
        const sel = document.getElementById('inp-srv-cat');
        sel.innerHTML = '';
        categories.forEach(c => {
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = c.name;
            sel.appendChild(o);
        });
    }

    window.addCategory = async function () {
        const name = document.getElementById('inp-cat-name').value.trim();
        const order = parseInt(document.getElementById('inp-cat-order').value) || 0;
        if (!name) return;
        await api('/admin/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, sort_order: order }),
        });
        document.getElementById('inp-cat-name').value = '';
        loadCategories();
    };

    window.deleteCategory = async function (id) {
        if (!confirm('Delete this category and all its servers?')) return;
        await api(`/admin/api/categories/${id}`, { method: 'DELETE' });
        loadCategories();
        loadServers();
    };

    // ── Servers ─────────────────────────────────────────────────────────────
    async function loadServers() {
        servers = await api('/admin/api/servers') || [];
        renderServers();
    }

    function renderServers() {
        const tbody = document.querySelector('#srv-table tbody');
        tbody.innerHTML = '';
        servers.forEach(s => {
            const tr = document.createElement('tr');
            const seen = s.last_seen ? new Date(s.last_seen).toLocaleString() : 'Never';
            tr.innerHTML = `
                <td>${esc(s.name)}</td>
                <td>${esc(catName(s.category_id))}</td>
                <td style="color:#8b949e;font-size:.8rem">${seen}</td>
                <td style="display:flex;gap:.4rem">
                    <button class="btn btn-primary btn-sm" onclick="showScript(${s.id})">Script</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteServer(${s.id})">Delete</button>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    window.addServer = async function () {
        const name = document.getElementById('inp-srv-name').value.trim();
        const cat = document.getElementById('inp-srv-cat').value;
        const net = parseFloat(document.getElementById('inp-srv-net').value) || 1000;
        if (!name || !cat) return;
        const data = await api('/admin/api/servers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category_id: parseInt(cat), net_max_mbps: net }),
        });
        document.getElementById('inp-srv-name').value = '';
        if (data && data.bash_script) {
            document.getElementById('script-code').textContent = data.bash_script;
            document.getElementById('script-modal').classList.add('active');
        }
        loadServers();
    };

    window.deleteServer = async function (id) {
        if (!confirm('Delete this server?')) return;
        await api(`/admin/api/servers/${id}`, { method: 'DELETE' });
        loadServers();
    };

    window.showScript = async function (id) {
        const data = await api(`/admin/api/servers/${id}/script`);
        if (data) {
            document.getElementById('script-code').textContent = data.bash_script;
            document.getElementById('script-modal').classList.add('active');
        }
    };

    window.closeScriptModal = function () {
        document.getElementById('script-modal').classList.remove('active');
    };

    window.copyScript = function () {
        const code = document.getElementById('script-code').textContent;
        navigator.clipboard.writeText(code).then(() => showToast('Copied to clipboard'));
    };

    // Close modal on overlay click
    document.getElementById('script-modal').addEventListener('click', function (e) {
        if (e.target === this) closeScriptModal();
    });

    // ── Toast ───────────────────────────────────────────────────────────────
    function showToast(msg) {
        let t = document.createElement('div');
        t.textContent = msg;
        Object.assign(t.style, {
            position: 'fixed', bottom: '1.5rem', right: '1.5rem',
            background: '#22c55e', color: '#fff', padding: '.5rem 1rem',
            borderRadius: '8px', fontSize: '.85rem', fontWeight: '500',
            zIndex: '9999', opacity: '0', transition: 'opacity .3s',
        });
        document.body.appendChild(t);
        requestAnimationFrame(() => t.style.opacity = '1');
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2000);
    }

    // ── Escape ──────────────────────────────────────────────────────────────
    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // ── Init ────────────────────────────────────────────────────────────────
    loadSettings();
    loadCategories();
    loadServers();
})();
