/* ── Server Detail Charts — EvilCharts style (React + Recharts, no JSX) ──── */
(function () {
    'use strict';

    var h = React.createElement;
    var RC = Recharts;

    /* ── Palette ─────────────────────────────────────────────────────────── */
    var COLORS = {
        cpu:      '#7B8DA4',
        iowait:   '#FF9F43',
        steal:    '#FF6B6B',
        ram:      '#C9A84C',
        swap:     '#B78FFF',
        buffered: '#5BC0EB',
        cached:   '#9BC53D',
        netIn:    '#6BCB77',
        netOut:   '#4DA8DA',
        disk:     '#E85D75',
    };

    /* ── Custom Tooltip ──────────────────────────────────────────────────── */
    function Tip(props) {
        var active = props.active, payload = props.payload, label = props.label, unit = props.unit;
        if (!active || !payload || !payload.length) return null;
        var rows = payload.map(function (p, i) {
            return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 } },
                h('span', { style: { width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block', flexShrink: 0 } }),
                h('span', { style: { color: '#aaa', fontSize: 11 } }, p.name),
                h('span', { style: { color: '#F2FAFF', fontWeight: 600, marginLeft: 'auto', paddingLeft: 16, fontSize: 11 } },
                    (typeof p.value === 'number' ? p.value.toFixed(1) : p.value) + ' ' + (unit || ''))
            );
        });
        return h('div', {
            style: {
                background: 'rgba(10,12,14,.92)', border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 10, padding: '10px 14px', fontFamily: 'Inter, sans-serif',
                boxShadow: '0 8px 32px rgba(0,0,0,.5)', minWidth: 140,
            }
        }, h('div', { style: { color: '#666', fontSize: 10, marginBottom: 4, fontWeight: 500 } }, label), rows);
    }

    /* ── Gradient def helper ─────────────────────────────────────────────── */
    function grad(id, color) {
        return h('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '5%', stopColor: color, stopOpacity: 0.4 }),
            h('stop', { offset: '95%', stopColor: color, stopOpacity: 0.05 })
        );
    }

    /* ── Area helper (EvilCharts style) ──────────────────────────────────── */
    function area(key, name, color, gradId) {
        return h(RC.Area, {
            key: key,
            type: 'natural',
            dataKey: key,
            name: name,
            stroke: color,
            fill: 'url(#' + gradId + ')',
            fillOpacity: 0.4,
            strokeWidth: 1.5,
            dot: false,
            activeDot: { r: 3, strokeWidth: 2, fill: '#fff', stroke: color },
        });
    }

    /* ── Format time labels ──────────────────────────────────────────────── */
    function fmtTime(iso, hours) {
        var d = new Date(iso);
        if (hours <= 48) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    /* ── Shared axis props ───────────────────────────────────────────────── */
    var xProps = { tickLine: false, axisLine: false, tick: { fill: 'rgba(139,148,158,.45)', fontSize: 9, fontFamily: 'Inter' }, tickMargin: 8 };
    var yProps = { tickLine: false, axisLine: false, tick: { fill: 'rgba(139,148,158,.5)', fontSize: 10, fontFamily: 'Inter' }, width: 44 };

    /* ── Single Chart Card ───────────────────────────────────────────────── */
    function ChartCard(props) {
        return h('div', { className: 'chart-section' },
            h('h3', null,
                h('span', { className: 'chart-icon' }, props.icon),
                ' ', props.title
            ),
            h('div', { className: 'chart-canvas-wrap' }, props.children)
        );
    }

    /* ── Main Charts Component ───────────────────────────────────────────── */
    function ServerCharts(props) {
        var history = props.history, hours = props.hours;
        if (!history || !history.length) {
            return h('div', { style: { color: '#8B949E', textAlign: 'center', padding: 40 } }, 'No chart data available.');
        }

        var step = Math.max(1, Math.floor(history.length / 6));
        var data = history.map(function (pt, i) {
            return Object.assign({}, pt, { _time: fmtTime(pt.ts, hours), _show: i % step === 0 });
        });
        var ticks = data.filter(function (d) { return d._show; }).map(function (d) { return d._time; });

        var gridEl = h(RC.CartesianGrid, { vertical: false, strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.04)' });
        var makeXAxis = function () { return h(RC.XAxis, Object.assign({ dataKey: '_time', ticks: ticks }, xProps)); };
        var makeTip = function (unit) { return h(RC.Tooltip, { cursor: false, content: h(Tip, { unit: unit }) }); };
        var legendEl = h(RC.Legend, { iconType: 'rect', iconSize: 8, wrapperStyle: { fontSize: 10, color: '#8B949E', paddingTop: 6 } });
        var margin = { top: 6, right: 10, bottom: 0, left: -10 };

        return h('div', { className: 'charts-grid' },
            /* ── CPU ────────────────────────────────────────────────── */
            h(ChartCard, { icon: '\u2699', title: 'CPU' },
                h(RC.ResponsiveContainer, { width: '100%', height: '100%' },
                    h(RC.AreaChart, { data: data, margin: margin },
                        h('defs', null, grad('g-cpu', COLORS.cpu), grad('g-iow', COLORS.iowait), grad('g-stl', COLORS.steal)),
                        gridEl, makeXAxis(),
                        h(RC.YAxis, Object.assign({ domain: [0, 100], tickFormatter: function (v) { return v + '%'; } }, yProps)),
                        makeTip('%'), legendEl,
                        area('cpu', 'CPU', COLORS.cpu, 'g-cpu'),
                        area('iowait', 'IOWait', COLORS.iowait, 'g-iow'),
                        area('steal', 'Steal', COLORS.steal, 'g-stl')
                    )
                )
            ),
            /* ── RAM ────────────────────────────────────────────────── */
            h(ChartCard, { icon: '\ud83d\udcbb', title: 'RAM' },
                h(RC.ResponsiveContainer, { width: '100%', height: '100%' },
                    h(RC.AreaChart, { data: data, margin: margin },
                        h('defs', null, grad('g-ram', COLORS.ram), grad('g-swp', COLORS.swap), grad('g-buf', COLORS.buffered), grad('g-cch', COLORS.cached)),
                        gridEl, makeXAxis(),
                        h(RC.YAxis, Object.assign({ domain: [0, 100], tickFormatter: function (v) { return v + '%'; } }, yProps)),
                        makeTip('%'), legendEl,
                        area('ram', 'RAM', COLORS.ram, 'g-ram'),
                        area('swap', 'Swap', COLORS.swap, 'g-swp'),
                        area('buffered', 'Buffered', COLORS.buffered, 'g-buf'),
                        area('cached', 'Cached', COLORS.cached, 'g-cch')
                    )
                )
            ),
            /* ── Network ────────────────────────────────────────────── */
            h(ChartCard, { icon: '\u21c5', title: 'Network' },
                h(RC.ResponsiveContainer, { width: '100%', height: '100%' },
                    h(RC.AreaChart, { data: data, margin: margin },
                        h('defs', null, grad('g-nin', COLORS.netIn), grad('g-nout', COLORS.netOut)),
                        gridEl, makeXAxis(),
                        h(RC.YAxis, Object.assign({ tickFormatter: function (v) { return v + ' Mb'; } }, yProps, { width: 52 })),
                        makeTip('Mbps'), legendEl,
                        area('net_in', 'In', COLORS.netIn, 'g-nin'),
                        area('net_out', 'Out', COLORS.netOut, 'g-nout')
                    )
                )
            ),
            /* ── Disk ───────────────────────────────────────────────── */
            h(ChartCard, { icon: '\u25ce', title: 'Disk' },
                h(RC.ResponsiveContainer, { width: '100%', height: '100%' },
                    h(RC.AreaChart, { data: data, margin: margin },
                        h('defs', null, grad('g-dsk', COLORS.disk)),
                        gridEl, makeXAxis(),
                        h(RC.YAxis, Object.assign({ domain: [0, 100], tickFormatter: function (v) { return v + '%'; } }, yProps)),
                        makeTip('%'),
                        area('disk', 'Disk', COLORS.disk, 'g-dsk')
                    )
                )
            )
        );
    }

    /* ── Mount point ─────────────────────────────────────────────────────── */
    var root = ReactDOM.createRoot(document.getElementById('charts-root'));

    window.renderRechartsCharts = function (history, hours) {
        root.render(h(ServerCharts, { history: history, hours: hours }));
    };
})();
