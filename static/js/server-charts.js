/* ── Server Detail Charts (React + Recharts) ─────────────────────────────── */
const { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
        ResponsiveContainer, Legend } = Recharts;

/* ── Custom Tooltip ──────────────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label, unit }) {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{
            background: 'rgba(14,17,19,.92)', border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 8, padding: '10px 14px', fontSize: 11, lineHeight: '18px',
            fontFamily: 'Inter, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        }}>
            <div style={{ color: '#999', marginBottom: 4 }}>{label}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
                    <span style={{ color: '#ccc' }}>{p.name}</span>
                    <span style={{ color: '#F2FAFF', fontWeight: 600, marginLeft: 'auto', paddingLeft: 12 }}>
                        {typeof p.value === 'number' ? p.value.toFixed(1) : p.value} {unit}
                    </span>
                </div>
            ))}
        </div>
    );
}

/* ── Chart Card Wrapper ──────────────────────────────────────────────────── */
function ChartCard({ icon, title, children }) {
    return (
        <div className="chart-section">
            <h3><span className="chart-icon">{icon}</span> {title}</h3>
            <div className="chart-canvas-wrap">
                {children}
            </div>
        </div>
    );
}

/* ── Format time label from ISO ──────────────────────────────────────────── */
function fmtTime(iso, hours) {
    const d = new Date(iso);
    if (hours <= 6)
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ── Shared axis / grid props ────────────────────────────────────────────── */
const gridProps  = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.04)', vertical: false };
const xAxisBase  = { tick: { fill: 'rgba(139,148,158,.5)', fontSize: 9, fontFamily: 'Inter' }, axisLine: false, tickLine: false };
const yAxisBase  = { tick: { fill: 'rgba(139,148,158,.6)', fontSize: 10, fontFamily: 'Inter' }, axisLine: false, tickLine: false, width: 44 };

/* ── Main Charts Component ───────────────────────────────────────────────── */
function ServerCharts({ history, hours }) {
    if (!history || !history.length) {
        return <div style={{ color: '#8B949E', textAlign: 'center', padding: 40 }}>No chart data available.</div>;
    }

    const data = history.map(h => ({
        ...h,
        time: fmtTime(h.ts, hours),
    }));

    /* ── Tick filter to avoid overcrowding ─────────────────────────────── */
    const step = Math.max(1, Math.floor(data.length / 6));
    const filteredTicks = data.filter((_, i) => i % step === 0).map(d => d.time);

    return (
        <div className="charts-grid">
            {/* ── CPU ──────────────────────────────────────────────────── */}
            <ChartCard icon="⚙" title="CPU">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                        <defs>
                            <linearGradient id="gc1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#7B8DA4" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#7B8DA4" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gc2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#FF9F43" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#FF9F43" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gc3" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#FF6B6B" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#FF6B6B" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="time" ticks={filteredTicks} {...xAxisBase} />
                        <YAxis domain={[0, 100]} tickFormatter={v => v + '%'} {...yAxisBase} />
                        <Tooltip content={<ChartTooltip unit="%" />} />
                        <Legend iconType="rect" iconSize={8}
                            wrapperStyle={{ fontSize: 10, color: '#8B949E', paddingTop: 4 }} />
                        <Area type="monotone" dataKey="cpu"    name="CPU"    stroke="#7B8DA4" fill="url(#gc1)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                        <Area type="monotone" dataKey="iowait" name="IOWait" stroke="#FF9F43" fill="url(#gc2)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                        <Area type="monotone" dataKey="steal"  name="Steal"  stroke="#FF6B6B" fill="url(#gc3)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                    </AreaChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* ── RAM ──────────────────────────────────────────────────── */}
            <ChartCard icon="💻" title="RAM">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                        <defs>
                            <linearGradient id="gr1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#C9A84C" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#C9A84C" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gr2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#B78FFF" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#B78FFF" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gr3" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#5BC0EB" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#5BC0EB" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gr4" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#9BC53D" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#9BC53D" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="time" ticks={filteredTicks} {...xAxisBase} />
                        <YAxis domain={[0, 100]} tickFormatter={v => v + '%'} {...yAxisBase} />
                        <Tooltip content={<ChartTooltip unit="%" />} />
                        <Legend iconType="rect" iconSize={8}
                            wrapperStyle={{ fontSize: 10, color: '#8B949E', paddingTop: 4 }} />
                        <Area type="monotone" dataKey="ram"      name="RAM"      stroke="#C9A84C" fill="url(#gr1)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                        <Area type="monotone" dataKey="swap"     name="Swap"     stroke="#B78FFF" fill="url(#gr2)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                        <Area type="monotone" dataKey="buffered" name="Buffered" stroke="#5BC0EB" fill="url(#gr3)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                        <Area type="monotone" dataKey="cached"   name="Cached"   stroke="#9BC53D" fill="url(#gr4)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                    </AreaChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* ── Network ─────────────────────────────────────────────── */}
            <ChartCard icon="⇅" title="Network">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                        <defs>
                            <linearGradient id="gn1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6BCB77" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#6BCB77" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gn2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#4DA8DA" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#4DA8DA" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="time" ticks={filteredTicks} {...xAxisBase} />
                        <YAxis tickFormatter={v => v + ' Mb'} {...yAxisBase} width={52} />
                        <Tooltip content={<ChartTooltip unit="Mbps" />} />
                        <Legend iconType="rect" iconSize={8}
                            wrapperStyle={{ fontSize: 10, color: '#8B949E', paddingTop: 4 }} />
                        <Area type="monotone" dataKey="net_in"  name="In"  stroke="#6BCB77" fill="url(#gn1)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                        <Area type="monotone" dataKey="net_out" name="Out" stroke="#4DA8DA" fill="url(#gn2)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                    </AreaChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* ── Disk ────────────────────────────────────────────────── */}
            <ChartCard icon="◎" title="Disk">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                        <defs>
                            <linearGradient id="gd1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#E85D75" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#E85D75" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="time" ticks={filteredTicks} {...xAxisBase} />
                        <YAxis domain={[0, 100]} tickFormatter={v => v + '%'} {...yAxisBase} />
                        <Tooltip content={<ChartTooltip unit="%" />} />
                        <Area type="monotone" dataKey="disk" name="Disk" stroke="#E85D75" fill="url(#gd1)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }} />
                    </AreaChart>
                </ResponsiveContainer>
            </ChartCard>
        </div>
    );
}

/* ── Mount / update from vanilla JS ──────────────────────────────────────── */
const chartsRoot = ReactDOM.createRoot(document.getElementById('charts-root'));

window.renderRechartsCharts = function (history, hours) {
    chartsRoot.render(<ServerCharts history={history} hours={hours} />);
};
