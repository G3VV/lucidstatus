/* ── Main Status Page JS ──────────────────────────────────────────────────── */
(function () {
    const API = '/api/status';
    const POLL_INTERVAL = 10000;
    let advancedMode = localStorage.getItem('adv_mode') === '1';

    function initAdvToggle() {
        const btn = document.getElementById('adv-toggle');
        if (!btn) return;
        if (advancedMode) btn.classList.add('active');
        btn.addEventListener('click', () => {
            advancedMode = !advancedMode;
            btn.classList.toggle('active', advancedMode);
            localStorage.setItem('adv_mode', advancedMode ? '1' : '0');
            // Re-render with current data
            if (lastData) renderCategories(lastData.categories);
        });
    }

    let lastData = null;

    function applyTheme(theme) {
        const root = document.documentElement;
        const map = {
            bg_outer: '--bg-outer', bg_panel: '--bg-panel', bg_card: '--bg-card',
            bg_bar: '--bg-bar', text_primary: '--text-primary', text_secondary: '--text-secondary',
            accent: '--accent', border_online: '--border-online', border_offline: '--border-offline',
            border_partial: '--border-partial', bar_cpu: '--bar-cpu', bar_ram: '--bar-ram',
            bar_disk: '--bar-disk', bar_net_in: '--bar-net-in', bar_net_out: '--bar-net-out',
            dot_up: '--dot-up', dot_down: '--dot-down', dot_partial: '--dot-partial',
            dot_grey: '--dot-grey', glow_from: '--glow-from',
            status_operational: '--status-operational', status_degraded: '--status-degraded',
            status_partial: '--status-partial', status_major: '--status-major',
        };
        for (const [key, prop] of Object.entries(map)) {
            if (theme[key]) root.style.setProperty(prop, theme[key]);
        }
    }

    function renderLogo(data) {
        const area = document.getElementById('logo-area');
        if (data.logo) {
            area.innerHTML = `<img src="${data.logo}" alt="Logo">`;
        } else {
            area.innerHTML = `<span class="site-name">${escHtml(data.site_name)}</span>`;
        }
    }

    function renderBanner(data) {
        const dot = document.getElementById('status-dot');
        const txt = document.getElementById('status-text');
        dot.style.background = data.status_color;
        dot.style.boxShadow = `0 0 10px ${data.status_color}40`;
        txt.textContent = data.status_label;
    }

    function pct(val) { return Math.min(100, Math.max(0, val)); }

    function makeBarGroup(label, value, cssClass, tooltipText) {
        const h = pct(value);
        return `<div class="bar-group">
            <div class="bar-tooltip">${escHtml(tooltipText)}</div>
            <div class="bar-label">${label}</div>
            <div class="bar-outer">
                <div class="bar-fill ${cssClass}" style="height:${h}%"></div>
            </div>
        </div>`;
    }

    function makeNetBars(server) {
        const maxNet = server.net_max || 1000;
        const pctIn = pct((server.net_in / maxNet) * 100);
        const pctOut = pct((server.net_out / maxNet) * 100);
        return `<div class="bar-group">
            <div class="bar-tooltip">${server.net_in} Mbps</div>
            <div class="bar-label">IN</div>
            <div class="bar-outer">
                <div class="bar-fill net-in" style="height:${pctIn}%"></div>
            </div>
        </div>
        <div class="bar-group">
            <div class="bar-tooltip">${server.net_out} Mbps</div>
            <div class="bar-label">OUT</div>
            <div class="bar-outer">
                <div class="bar-fill net-out" style="height:${pctOut}%"></div>
            </div>
        </div>`;
    }

    function renderCategories(categories) {
        const container = document.getElementById('categories-container');
        if (!categories.length) {
            container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;margin-top:40px;">No servers configured yet.</p>';
            return;
        }
        let html = '';
        for (const cat of categories) {
            html += `<div class="category"><div class="category-title">${escHtml(cat.name)}</div>`;
            for (const srv of cat.servers) {
                const dotColor = srv.online ? 'var(--border-online)' : 'var(--border-offline)';
                const bars = makeBarGroup('CPU', srv.cpu, 'cpu', `CPU: ${srv.cpu}%`)
                    + makeBarGroup('RAM', srv.ram, 'ram', `RAM: ${srv.ram}%`)
                    + makeBarGroup('DISK', srv.disk, 'disk', `Disk: ${srv.disk}%`)
                    + makeNetBars(srv);

                let dots = '';
                for (const d of srv.uptime) {
                    dots += `<div class="uptime-dot ${d}"></div>`;
                }

                let advHtml = '';
                if (advancedMode) {
                    const lastSeen = srv.last_seen ? new Date(srv.last_seen).toLocaleString() : 'Never';
                    advHtml = `<div class="adv-row">
                        <div class="adv-item"><span class="adv-label">IOWait</span><span class="adv-value">${srv.iowait}%</span></div>
                        <div class="adv-item"><span class="adv-label">Steal</span><span class="adv-value">${srv.steal}%</span></div>
                        <div class="adv-item"><span class="adv-label">Swap</span><span class="adv-value">${srv.swap}%</span></div>
                        <div class="adv-item"><span class="adv-label">Buffered</span><span class="adv-value">${srv.buffered}%</span></div>
                        <div class="adv-item"><span class="adv-label">Cached</span><span class="adv-value">${srv.cached}%</span></div>
                        <div class="adv-item"><span class="adv-label">Last Seen</span><span class="adv-value">${escHtml(lastSeen)}</span></div>
                    </div>`;
                }

                html += `<div class="server-card" onclick="location.href='/server/${srv.id}'">
                    <div class="server-top">
                        <div class="server-name-area">
                            <div class="server-status-dot" style="background:${dotColor};box-shadow:0 0 8px ${dotColor}40"></div>
                            <div class="server-name">${escHtml(srv.name)}</div>
                        </div>
                        <div class="uptime-row">${dots}</div>
                    </div>
                    <div class="bars-row">${bars}</div>
                    ${advHtml}
                </div>`;
            }
            html += '</div>';
        }
        container.innerHTML = html;
    }

    async function poll() {
        try {
            const res = await fetch(API);
            const data = await res.json();
            lastData = data;
            if (data.theme) applyTheme(data.theme);
            renderLogo(data);
            renderBanner(data);
            renderCategories(data.categories);
            document.title = data.site_name + ' — Status';
        } catch (e) {
            console.error('Poll failed:', e);
        }
    }

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    initAdvToggle();
    poll();
    setInterval(poll, POLL_INTERVAL);
})();
