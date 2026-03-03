/* ── Server Detail Page JS ────────────────────────────────────────────────── */
(function () {
    // Crosshair plugin — draws vertical hover line
    const crosshairPlugin = {
        id: 'crosshair',
        afterDraw(chart) {
            if (chart.tooltip?._active?.length) {
                const x = chart.tooltip._active[0].element.x;
                const yAxis = chart.scales.y;
                const ctx = chart.ctx;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, yAxis.top);
                ctx.lineTo(x, yAxis.bottom);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255,255,255,.12)';
                ctx.stroke();
                ctx.restore();
            }
        }
    };
    Chart.register(crosshairPlugin);

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

    function makeLabels(history) {
        return history.map(h => {
            const d = new Date(h.ts);
            return currentHours <= 6
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        });
    }

    function chartOpts(maxY, unit) {
        unit = unit || '%';
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            hover: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true, position: 'top', align: 'end',
                    labels: {
                        color: 'rgba(139,148,158,.8)', font: { size: 11, family: 'Inter', weight: '500' },
                        boxWidth: 10, boxHeight: 10, padding: 16,
                        usePointStyle: true, pointStyle: 'rectRounded',
                    },
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(12,14,16,.94)',
                    titleColor: '#F2FAFF', bodyColor: 'rgba(200,210,220,.85)',
                    borderColor: 'rgba(255,255,255,.06)', borderWidth: 1, cornerRadius: 10,
                    padding: { top: 10, bottom: 10, left: 14, right: 14 },
                    titleFont: { size: 12, weight: '600', family: 'Inter' },
                    bodyFont: { size: 12, family: 'Inter' },
                    bodySpacing: 6,
                    boxWidth: 10, boxHeight: 10, boxPadding: 6,
                    usePointStyle: true,
                    callbacks: {
                        title: function (items) {
                            return items[0]?.label || '';
                        },
                        label: function (ctx) {
                            return ' ' + ctx.dataset.label + '   ' + ctx.parsed.y.toFixed(1) + ' ' + unit;
                        }
                    }
                },
            },
            scales: {
                x: {
                    display: true,
                    ticks: {
                        color: 'rgba(139,148,158,.4)', font: { size: 10, family: 'Inter' },
                        maxTicksLimit: 6, maxRotation: 0, padding: 6,
                    },
                    grid: { display: false },
                    border: { display: false },
                },
                y: {
                    ticks: {
                        color: 'rgba(139,148,158,.5)', font: { size: 10, family: 'Inter' }, padding: 12,
                        maxTicksLimit: 5,
                        callback: function (v) { return v + (unit === 'Mbps' ? ' Mb' : '%'); },
                    },
                    grid: { color: 'rgba(255,255,255,.035)', drawTicks: false },
                    border: { display: false },
                    min: 0, max: maxY,
                },
            },
        };
    }

    function makeGradient(ctx, color, alpha) {
        alpha = alpha || 0.4;
        const h = ctx.canvas.parentElement?.offsetHeight || ctx.canvas.height || 280;
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, colorWithAlpha(color, alpha));
        grad.addColorStop(0.6, colorWithAlpha(color, alpha * 0.3));
        grad.addColorStop(1, colorWithAlpha(color, 0));
        return grad;
    }

    function colorWithAlpha(color, a) {
        // Handle hex
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r},${g},${b},${a})`;
        }
        // Handle rgb()
        if (color.startsWith('rgb(')) {
            return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
        }
        // Handle rgba() — replace existing alpha
        if (color.startsWith('rgba(')) {
            return color.replace(/,[^,]*\)$/, `,${a})`);
        }
        return color;
    }

    function ds(label, data, color, fill, ctx) {
        return {
            label, data,
            borderColor: color,
            backgroundColor: fill && ctx ? makeGradient(ctx, color) : 'transparent',
            fill: !!fill,
            tension: 0.35,
            pointRadius: 0,
            pointHitRadius: 8,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: color,
            pointHoverBorderColor: '#1C2327',
            pointHoverBorderWidth: 3,
            borderWidth: 2,
        };
    }

    function peakOf(...arrays) {
        let max = 0;
        for (const arr of arrays) {
            for (const v of arr) { if (v > max) max = v; }
        }
        return Math.ceil(max * 1.1) || 10; // 10% headroom, minimum 10
    }

    function renderCharts(data) {
        const history = data.history;
        if (!history.length) return;
        const labels = makeLabels(history);

        const cpuVals = history.map(h => h.cpu);
        const ioVals = history.map(h => h.iowait);
        const stealVals = history.map(h => h.steal);

        // CPU Chart
        const ctx1 = document.getElementById('chart-cpu').getContext('2d');
        if (cpuChart) cpuChart.destroy();
        cpuChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    ds('CPU', cpuVals, '#7B8DA4', true, ctx1),
                    ds('IOWait', ioVals, '#FF9F43', true, ctx1),
                    ds('Steal', stealVals, '#FF6B6B', true, ctx1),
                ],
            },
            options: chartOpts(peakOf(cpuVals, ioVals, stealVals), '%'),
        });

        const ramVals = history.map(h => h.ram);
        const swapVals = history.map(h => h.swap);
        const bufVals = history.map(h => h.buffered);
        const cacVals = history.map(h => h.cached);

        // RAM Chart
        const ctx2 = document.getElementById('chart-ram').getContext('2d');
        if (ramChart) ramChart.destroy();
        ramChart = new Chart(ctx2, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    ds('RAM', ramVals, '#C9A84C', true, ctx2),
                    ds('Swap', swapVals, '#B78FFF', true, ctx2),
                    ds('Buffered', bufVals, '#5BC0EB', true, ctx2),
                    ds('Cached', cacVals, '#9BC53D', true, ctx2),
                ],
            },
            options: chartOpts(peakOf(ramVals, swapVals, bufVals, cacVals), '%'),
        });

        const diskVals = history.map(h => h.disk);

        // Disk Chart
        const ctx3 = document.getElementById('chart-disk').getContext('2d');
        if (diskChart) diskChart.destroy();
        diskChart = new Chart(ctx3, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    ds('Disk', diskVals, '#E85D75', true, ctx3),
                ],
            },
            options: chartOpts(peakOf(diskVals), '%'),
        });

        const netInVals = history.map(h => h.net_in);
        const netOutVals = history.map(h => h.net_out);

        // Network Chart
        const ctx4 = document.getElementById('chart-network').getContext('2d');
        if (netChart) netChart.destroy();
        netChart = new Chart(ctx4, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    ds('In', netInVals, '#6BCB77', true, ctx4),
                    ds('Out', netOutVals, '#4DA8DA', true, ctx4),
                ],
            },
            options: chartOpts(peakOf(netInVals, netOutVals), 'Mbps'),
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
