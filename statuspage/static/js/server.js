/* ── Server Detail Page JS ────────────────────────────────────────────────── */
(function () {
    let cpuChart = null, ramChart = null, diskChart = null, netChart = null;
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

    function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

    async function loadData(hours) {
        currentHours = hours || currentHours;
        try {
            const res = await fetch(`/api/server/${SERVER_ID}?hours=${currentHours}`);
            const data = await res.json();
            if (data.theme) applyTheme(data.theme);
            render(data);
            renderCharts(data);
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

        // Stat cards
        const stats = [
            { label: 'CPU', value: data.cpu + '%', pct: data.cpu, color: 'var(--bar-cpu)' },
            { label: 'RAM', value: data.ram + '%', pct: data.ram, color: 'var(--bar-ram)' },
            { label: 'Swap', value: (data.swap || 0) + '%', pct: data.swap || 0, color: '#B78FFF' },
            { label: 'Disk', value: data.disk + '%', pct: data.disk, color: 'var(--bar-disk)' },
            { label: 'Net In', value: data.net_in + ' Mbps', pct: (data.net_in / data.net_max) * 100, color: 'var(--bar-net-in)' },
            { label: 'Net Out', value: data.net_out + ' Mbps', pct: (data.net_out / data.net_max) * 100, color: 'var(--bar-net-out)' },
        ];
        document.getElementById('d-stats').innerHTML = stats.map(s => `
            <div class="stat-card">
                <div class="stat-label">${s.label}</div>
                <div class="stat-value">${s.value}</div>
                <div class="stat-bar-wrap">
                    <div class="stat-bar-fill" style="width:${Math.min(100, s.pct)}%;background:${s.color}"></div>
                </div>
            </div>`).join('');

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

    function makeLabels(history) {
        return history.map(h => {
            const d = new Date(h.ts);
            return currentHours <= 6
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        });
    }

    function chartOpts(maxY) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { color: '#8B949E', font: { size: 11 }, boxWidth: 10, padding: 14 } },
                tooltip: { backgroundColor: '#111517', titleColor: '#F2FAFF', bodyColor: '#ccc', borderColor: '#32434D', borderWidth: 1 },
            },
            scales: {
                x: { ticks: { color: '#8B949E', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,.04)' } },
                y: { ticks: { color: '#8B949E', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' }, min: 0, max: maxY },
            },
        };
    }

    function ds(label, data, color, fill) {
        return {
            label, data,
            borderColor: color,
            backgroundColor: fill ? color.replace(')', ',.08)').replace('rgb', 'rgba') : 'transparent',
            fill: !!fill,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 2,
        };
    }

    function renderCharts(data) {
        const history = data.history;
        if (!history.length) return;
        const labels = makeLabels(history);

        // CPU Chart
        const ctx1 = document.getElementById('chart-cpu').getContext('2d');
        if (cpuChart) cpuChart.destroy();
        cpuChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    ds('CPU', history.map(h => h.cpu), css('--bar-cpu')),
                    ds('IOWait', history.map(h => h.iowait), '#FF9F43'),
                    ds('Steal', history.map(h => h.steal), '#FF6B6B'),
                ],
            },
            options: chartOpts(100),
        });

        // RAM Chart
        const ctx2 = document.getElementById('chart-ram').getContext('2d');
        if (ramChart) ramChart.destroy();
        ramChart = new Chart(ctx2, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    ds('RAM', history.map(h => h.ram), css('--bar-ram')),
                    ds('Swap', history.map(h => h.swap), '#B78FFF'),
                    ds('Buffered', history.map(h => h.buffered), '#5BC0EB'),
                    ds('Cached', history.map(h => h.cached), '#9BC53D'),
                ],
            },
            options: chartOpts(100),
        });

        // Disk Chart
        const ctx3 = document.getElementById('chart-disk').getContext('2d');
        if (diskChart) diskChart.destroy();
        diskChart = new Chart(ctx3, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    ds('Disk', history.map(h => h.disk), css('--bar-disk'), true),
                ],
            },
            options: chartOpts(100),
        });

        // Network Chart
        const ctx4 = document.getElementById('chart-network').getContext('2d');
        if (netChart) netChart.destroy();
        netChart = new Chart(ctx4, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    ds('In', history.map(h => h.net_in), css('--bar-net-in'), true),
                    ds('Out', history.map(h => h.net_out), '#FFB778', true),
                ],
            },
            options: chartOpts(undefined),
        });
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
