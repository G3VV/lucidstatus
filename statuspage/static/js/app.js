(function () {
    const POLL_INTERVAL = 10000;

    function renderDot(status) {
        if (status === 'none') return null;
        const d = document.createElement('div');
        d.className = 'uptime-dot ' + status;
        const titles = { up: 'Online', down: 'Down', partial: 'Partial outage', grey: 'No data' };
        d.title = titles[status] || 'No data';
        return d;
    }

    function renderBar(cls, pct) {
        const wrap = document.createElement('div');
        wrap.className = 'bar-wrap';
        const bg = document.createElement('div');
        bg.className = 'bar-bg ' + cls;
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        const h = Math.min(28, Math.max(2, (pct / 100) * 28));
        fill.style.height = h + 'px';
        bg.appendChild(fill);
        wrap.appendChild(bg);
        return wrap;
    }

    function renderNetBar(inPct, outPct) {
        const wrap = document.createElement('div');
        wrap.className = 'bar-wrap';
        const bg = document.createElement('div');
        bg.className = 'bar-bg bar-net';

        // In fill (total combined, green)
        const fillIn = document.createElement('div');
        fillIn.className = 'bar-fill-in';
        const hIn = Math.min(28, Math.max(0, (inPct / 100) * 28));
        fillIn.style.height = hIn + 'px';

        // Out fill (orange overlay, usually smaller)
        const fillOut = document.createElement('div');
        fillOut.className = 'bar-fill-out';
        const hOut = Math.min(28, Math.max(0, (outPct / 100) * 28));
        fillOut.style.height = hOut + 'px';

        bg.appendChild(fillIn);
        bg.appendChild(fillOut);
        wrap.appendChild(bg);
        return wrap;
    }

    function renderServer(srv) {
        const card = document.createElement('div');
        card.className = 'server-card' + (srv.online ? '' : ' offline');

        // Header: name + dots
        const header = document.createElement('div');
        header.className = 'server-header';

        const name = document.createElement('div');
        name.className = 'server-name';
        name.textContent = srv.name;

        const dots = document.createElement('div');
        dots.className = 'uptime-dots';
        (srv.uptime || []).forEach(function (s) {
            const dot = renderDot(s);
            if (dot) dots.appendChild(dot);
        });

        header.appendChild(name);
        header.appendChild(dots);
        card.appendChild(header);

        // Bars: CPU, RAM, Disk, Network
        const bars = document.createElement('div');
        bars.className = 'bars';

        bars.appendChild(renderBar('bar-cpu', srv.cpu));
        bars.appendChild(renderBar('bar-ram', srv.ram));
        bars.appendChild(renderBar('bar-disk', srv.disk));

        // Network: in and out as separate percentages of max
        const netInPct = srv.net_max > 0 ? (srv.net_in / srv.net_max) * 100 : 0;
        const netOutPct = srv.net_max > 0 ? (srv.net_out / srv.net_max) * 100 : 0;
        // Use combined for the green fill, out only for the orange overlay
        const netCombinedPct = srv.net_max > 0 ? ((srv.net_in + srv.net_out) / srv.net_max) * 100 : 0;
        bars.appendChild(renderNetBar(netCombinedPct, netOutPct));

        card.appendChild(bars);
        return card;
    }

    function render(data) {
        // Header
        document.title = (data.site_name || 'Status') + ' — Status Page';
        var nameEl = document.getElementById('site-name');
        const logo = document.getElementById('logo-img');
        if (data.logo) {
            logo.src = data.logo;
            logo.style.display = 'block';
            nameEl.style.display = 'none';
        } else {
            logo.style.display = 'none';
            nameEl.textContent = data.site_name || 'Status';
            nameEl.style.display = '';
        }

        // Status banner
        var banner = document.getElementById('status-banner');
        var dot = document.getElementById('status-dot');
        var label = document.getElementById('status-label');
        banner.style.setProperty('--status-color', data.status_color);
        dot.style.background = data.status_color;
        dot.style.boxShadow = '0 0 6px ' + data.status_color;
        label.textContent = data.status_label;

        // Categories
        var container = document.getElementById('categories-container');
        container.innerHTML = '';
        (data.categories || []).forEach(function (cat) {
            if (!cat.servers || cat.servers.length === 0) return;

            var sec = document.createElement('div');
            sec.className = 'category';

            // Category header: pill label + line
            var hdr = document.createElement('div');
            hdr.className = 'category-header';
            var lbl = document.createElement('div');
            lbl.className = 'category-label';
            lbl.textContent = cat.name;
            var line = document.createElement('div');
            line.className = 'category-line';
            hdr.appendChild(lbl);
            hdr.appendChild(line);
            sec.appendChild(hdr);

            // Server grid
            var grid = document.createElement('div');
            grid.className = 'server-grid';
            (cat.servers || []).forEach(function (srv) {
                grid.appendChild(renderServer(srv));
            });
            sec.appendChild(grid);
            container.appendChild(sec);
        });
    }

    async function poll() {
        try {
            var r = await fetch('/api/status');
            if (r.ok) render(await r.json());
        } catch (e) {
            console.error('Poll failed', e);
        }
    }

    poll();
    setInterval(poll, POLL_INTERVAL);
})();
