/* ── Server Detail Page JS ────────────────────────────────────────────────── */
(function () {
    let currentHours = 24;

    function applyTheme(theme) {
        const root = document.documentElement;
        const map = {
            bg_outer: '--bg-outer', bg_panel: '--bg-panel', bg_card: '--bg-card',
            bg_bar: '--bg-bar', text_primary: '--text-primary', text_secondary: '--text-secondary',
            accent: '--accent', bar_cpu: '--bar-cpu', bar_ram: '--bar-ram',
            bar_disk: '--bar-disk', bar_net_in: '--bar-net-in', bar_net_out: '--bar-net-out',
            dot_up: '--dot-up', dot_down: '--dot-down', dot_partial: '--dot-partial',
            dot_grey: '--dot-grey', border_online: '--border-online', border_offline: '--border-offline',
        };
        for (const [key, prop] of Object.entries(map)) {
            if (theme[key]) root.style.setProperty(prop, theme[key]);
        }
    }

    async function loadData(hours) {
        currentHours = hours || currentHours;
        try {
            const res = await fetch(`/api/server/${SERVER_ID}?hours=${currentHours}`);
            const data = await res.json();
            if (data.theme) applyTheme(data.theme);
            render(data);
            // Delegate chart rendering to React (loaded via Babel)
            if (window.renderRechartsCharts) {
                window.renderRechartsCharts(data.history, currentHours);
            }
        } catch (e) { console.error('Load failed:', e); }
    }

    function render(data) {
        // Status dot
        const dotEl = document.getElementById('d-status');
        const col = data.online ? 'var(--border-online)' : 'var(--border-offline)';
        dotEl.style.background = col;
        dotEl.style.boxShadow = `0 0 10px ${data.online ? '#83FF7840' : '#FF5D5D40'}`;

        // Name & meta
        document.getElementById('d-name').textContent = data.name;
        document.title = data.name + ' — Server Details';
        const lastSeen = data.last_seen ? new Date(data.last_seen).toLocaleString() : 'Never';
        document.getElementById('d-meta').textContent = `Last seen: ${lastSeen} · Created: ${new Date(data.created_at).toLocaleDateString()}`;

        // Stat cards (CPU, RAM, Swap, Disk)
        const stats = [
            { label: 'CPU', value: data.cpu + '%', pct: data.cpu, color: 'var(--bar-cpu)' },
            { label: 'RAM', value: data.ram + '%', pct: data.ram, color: 'var(--bar-ram)' },
            { label: 'Swap', value: (data.swap || 0) + '%', pct: data.swap || 0, color: '#B78FFF' },
            { label: 'Disk', value: data.disk + '%', pct: data.disk, color: 'var(--bar-disk)' },
        ];
        document.getElementById('d-stats').innerHTML = stats.map(s => `
            <div class="stat-card">
                <div class="stat-label">${s.label}</div>
                <div class="stat-value">${s.value}</div>
                <div class="stat-bar-wrap">
                    <div class="stat-bar-fill" style="width:${Math.min(100, s.pct)}%;background:${s.color}"></div>
                </div>
            </div>`).join('');

        // Network card (combined IN + OUT)
        const inPct = Math.min(100, (data.net_in / data.net_max) * 100);
        const outPct = Math.min(100, (data.net_out / data.net_max) * 100);
        document.getElementById('d-net-card').innerHTML = `
            <div class="net-half">
                <div class="stat-label">Net In</div>
                <div class="stat-value">${data.net_in} <span style="font-size:14px;font-weight:500;color:var(--text-secondary)">Mbps</span></div>
            </div>
            <div class="net-half">
                <div class="stat-label">Net Out</div>
                <div class="stat-value">${data.net_out} <span style="font-size:14px;font-weight:500;color:var(--text-secondary)">Mbps</span></div>
            </div>
            <div class="net-bar-combined">
                <div class="net-bar-row">
                    <span class="nb-label">In</span>
                    <div class="nb-track"><div class="nb-fill" style="width:${inPct}%;background:var(--bar-net-in)"></div></div>
                </div>
                <div class="net-bar-row">
                    <span class="nb-label">Out</span>
                    <div class="nb-track"><div class="nb-fill" style="width:${outPct}%;background:var(--bar-net-out)"></div></div>
                </div>
            </div>`;

        // Uptime percentage
        document.getElementById('d-uptime-pct').textContent = data.uptime_pct + '%';
        const pctVal = data.uptime_pct;
        document.getElementById('d-uptime-pct').style.color =
            pctVal >= 99 ? 'var(--dot-up)' : pctVal >= 95 ? 'var(--dot-partial)' : 'var(--dot-down)';

        // Uptime dots
        const dotsHtml = data.uptime_dots.map((d, i) => {
            const dayOffset = data.uptime_dots.length - 1 - i;
            const date = new Date();
            date.setDate(date.getDate() - dayOffset);
            const statusLabel = d === 'up' ? 'Online' : d === 'down' ? 'Down' : d === 'partial' ? 'Partial' : 'No data';
            const tip = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' \u2014 ' + statusLabel;
            return `<div class="dot ${d}" data-tip="${tip}"></div>`;
        }).join('');
        document.getElementById('d-uptime-dots').innerHTML = dotsHtml;
    }

    // Range buttons
    document.getElementById('chart-range').addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        document.querySelectorAll('#chart-range button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        loadData(parseInt(e.target.dataset.hours));
    });

    // Initial load + polling
    loadData(24);
    setInterval(() => loadData(), 30000);
})();
