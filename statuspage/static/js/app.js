(function () {
    const POLL_INTERVAL = 10000; // 10 seconds

    function barColor(cls, pct) {
        // already handled by CSS gradients
    }

    function renderDot(status) {
        if (status === 'none') return null; // skip days before server existed
        const d = document.createElement('div');
        d.className = `uptime-dot ${status}`;
        const titles = { up: 'Online', down: 'Down', partial: 'Partial outage', grey: 'No data' };
        d.title = titles[status] || 'No data';
        return d;
    }

    function renderBar(label, cls, pct) {
        const wrap = document.createElement('div');
        wrap.className = 'bar-wrap';
        wrap.innerHTML = `
            <div class="bar-label">${label}</div>
            <div class="bar-bg ${cls}">
                <div class="bar-fill" style="width:${Math.min(100, pct)}%"></div>
            </div>`;
        return wrap;
    }

    function renderServer(srv) {
        const card = document.createElement('div');
        card.className = `server-card${srv.online ? '' : ' offline'}`;

        // Header row: name + uptime dots
        const header = document.createElement('div');
        header.className = 'server-header';

        const name = document.createElement('div');
        name.className = 'server-name';
        name.textContent = srv.name;

        const dots = document.createElement('div');
        dots.className = 'uptime-dots';
        (srv.uptime || []).forEach(s => {
            const dot = renderDot(s);
            if (dot) dots.appendChild(dot);
        });

        header.appendChild(name);
        header.appendChild(dots);
        card.appendChild(header);

        // Bars
        const bars = document.createElement('div');
        bars.className = 'bars';
        bars.appendChild(renderBar('CPU', 'bar-cpu', srv.cpu));
        bars.appendChild(renderBar('RAM', 'bar-ram', srv.ram));
        bars.appendChild(renderBar('Disk', 'bar-disk', srv.disk));

        // Network: combine in + out as percentage of max
        const netPct = srv.net_max > 0
            ? ((srv.net_in + srv.net_out) / srv.net_max) * 100 : 0;
        bars.appendChild(renderBar('Net', 'bar-net', netPct));
        card.appendChild(bars);

        return card;
    }

    function render(data) {
        // Header
        document.getElementById('site-name').textContent = data.site_name || 'Status';
        document.title = `${data.site_name || 'Status'} — Status Page`;
        const logo = document.getElementById('logo-img');
        if (data.logo) {
            logo.src = data.logo;
            logo.style.display = 'block';
        } else {
            logo.style.display = 'none';
        }

        // Status banner
        const banner = document.getElementById('status-banner');
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('status-label');
        banner.style.setProperty('--status-color', data.status_color);
        dot.style.background = data.status_color;
        dot.style.boxShadow = `0 0 6px ${data.status_color}`;
        label.textContent = data.status_label;

        // Categories
        const container = document.getElementById('categories-container');
        container.innerHTML = '';
        (data.categories || []).forEach(cat => {
            const sec = document.createElement('div');
            sec.className = 'category';

            const title = document.createElement('div');
            title.className = 'category-title';
            title.textContent = cat.name;
            sec.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'server-grid';
            (cat.servers || []).forEach(srv => grid.appendChild(renderServer(srv)));
            sec.appendChild(grid);

            container.appendChild(sec);
        });
    }

    async function poll() {
        try {
            const r = await fetch('/api/status');
            if (r.ok) render(await r.json());
        } catch (e) {
            console.error('Poll failed', e);
        }
    }

    poll();
    setInterval(poll, POLL_INTERVAL);
})();
