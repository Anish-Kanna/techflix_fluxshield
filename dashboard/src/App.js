import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import {
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import "./App.css";

const SOCKET_URL =
  process.env.REACT_APP_API_URL || "http://localhost:3000";

/* ===================== AnimatedNumber ===================== */
function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "" }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const target = parseFloat(value) || 0;
    const start = display;
    const diff = target - start;
    if (Math.abs(diff) < 0.01) { setDisplay(target); return; }
    const duration = 400;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(start + diff * eased);
      if (progress < 1) ref.current = requestAnimationFrame(step);
    }
    ref.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span>
      {prefix}
      {decimals > 0 ? display.toFixed(decimals) : Math.round(display)}
      {suffix}
    </span>
  );
}

/* ===================== Main App ===================== */
function App() {
  const [metrics, setMetrics] = useState({});
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const [spikeCount, setSpikeCount] = useState(500);
  const [requestLog, setRequestLog] = useState([]);
  const [throughput, setThroughput] = useState([]);
  const [spiking, setSpiking] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("metrics", (data) => {
      setMetrics(data);
      if (data.requestLog) setRequestLog(data.requestLog);
      if (data.throughputHistory) setThroughput(data.throughputHistory);

      setHistory((prev) => [
        ...prev.slice(-40),
        {
          time: new Date().toLocaleTimeString(),
          requests: data.totalRequests,
          backend: data.backendHits,
          cached: data.cacheHits,
        },
      ]);
    });

    return () => {
      socket.off("metrics");
      socket.off("connect");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [requestLog]);

  const simulateSpike = useCallback(async () => {
    setSpiking(true);
    try {
      await fetch(`${SOCKET_URL}/simulate-spike`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: spikeCount }),
      });
    } finally {
      setSpiking(false);
    }
  }, [spikeCount]);

  const toggleBypass = useCallback(async () => {
    await fetch(`${SOCKET_URL}/toggle-bypass`, { method: "POST" });
  }, []);

  const resetMetrics = useCallback(async () => {
    await fetch(`${SOCKET_URL}/reset-metrics`, { method: "POST" });
    setHistory([]);
  }, []);

  const pieData = [
    { name: "Cache Hits", value: metrics.cacheHits || 0 },
    { name: "Deduplicated", value: metrics.deduplicated || 0 },
    { name: "Backend", value: metrics.backendHits || 0 },
  ];
  const PIE_COLORS = ["#00f5d4", "#a78bfa", "#ef4444"];

  const latencyData = [
    { name: "Cached", latency: parseFloat(metrics.avgCachedLatency) || 0 },
    { name: "P95", latency: parseFloat(metrics.p95Latency) || 0 },
    { name: "P99", latency: parseFloat(metrics.p99Latency) || 0 },
    { name: "Backend", latency: parseFloat(metrics.avgBackendLatency) || 0 },
  ];

  if (!connected) {
    return (
      <div className="container loading-screen">
        <h1>🛡️ FluxShield</h1>
        <p className="subtitle">Connecting to server...</p>
        <div className="spinner" />
        <p className="hint">Make sure the backend is running on port 3000</p>
      </div>
    );
  }

  const bypassMode = metrics.bypassMode || false;

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <h1>🛡️ FluxShield</h1>
        <p className="subtitle">
          Real-Time Adaptive API Traffic Intelligence Layer
        </p>
        <div className="status-bar">
          <div className="status-badge">
            {metrics.requestsLast10Sec > 50 ? (
              <span className="status-spike">🔴 SPIKE DETECTED</span>
            ) : (
              <span className="status-normal">🟢 NORMAL</span>
            )}
          </div>
          {metrics.redisConnected === false && (
            <span className="status-redis-off">⚠️ REDIS OFFLINE</span>
          )}
          <div className={`bypass-indicator ${bypassMode ? "bypass-on" : "bypass-off"}`}>
            {bypassMode ? "🚫 SHIELD OFF" : "🛡️ SHIELD ON"}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="cards">
        <Card title="Total Requests" value={metrics.totalRequests} />
        <Card title="Backend Hits" value={metrics.backendHits} color="#ef4444" />
        <Card title="Cache Hits" value={metrics.cacheHits} color="#00f5d4" />
        <Card title="Deduplicated" value={metrics.deduplicated} color="#a78bfa" />
        <Card title="Load Saved" value={metrics.loadSaved} suffix="%" />
        <Card title="Dedup Efficiency" value={metrics.dedupEfficiency} suffix="%" />
        <Card title="Avg Latency" value={metrics.avgResponseTime} suffix="ms" decimals={1} />
        <Card title="P95 Latency" value={metrics.p95Latency} suffix="ms" decimals={1} />
        <Card title="P99 Latency" value={metrics.p99Latency} suffix="ms" decimals={1} />
        <Card title="Requests /10s" value={metrics.requestsLast10Sec} />
        <Card title="Adaptive TTL" value={metrics.adaptiveTTL} suffix="s" />
        <Card title="Cost Saved" value={metrics.costSaved} prefix="$" highlight decimals={4} />
      </div>

      {/* Controls row */}
      <div className="controls-row">
        <div className="spike-controls">
          <label className="spike-label">
            Requests: <strong>{spikeCount}</strong>
          </label>
          <input
            type="range"
            min="10"
            max="2000"
            step="10"
            value={spikeCount}
            onChange={(e) => setSpikeCount(Number(e.target.value))}
            className="spike-slider"
          />
          <button
            className={`spike-button ${spiking ? "spike-button-loading" : ""}`}
            onClick={simulateSpike}
            disabled={spiking}
          >
            {spiking ? "Sending..." : "🔥 Simulate Spike"}
          </button>
        </div>
        <div className="control-buttons">
          <button
            className={`toggle-button ${bypassMode ? "toggle-on" : ""}`}
            onClick={toggleBypass}
          >
            {bypassMode ? "🟢 Enable Shield" : "🔴 Disable Shield"}
          </button>
          <button className="reset-button" onClick={resetMetrics}>
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Charts row 1: traffic + pie */}
      <div className="charts-row">
        <div className="chart-container chart-wide">
          <h2 className="chart-title">Traffic vs Backend Executions</h2>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="gradReq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f5d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00f5d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradBk" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f2937" />
              <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 11 }} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
              <Area type="monotone" dataKey="requests" stroke="#00f5d4" strokeWidth={2} fill="url(#gradReq)" name="Total" />
              <Area type="monotone" dataKey="backend" stroke="#ef4444" strokeWidth={2} fill="url(#gradBk)" name="Backend" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container chart-narrow">
          <h2 className="chart-title">Request Distribution</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value" label={false}>
                {pieData.map((e, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
              <Legend verticalAlign="bottom" iconType="circle"
                formatter={(value) => {
                  const item = pieData.find((d) => d.name === value);
                  const total = pieData.reduce((s, d) => s + d.value, 0);
                  const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
                  return <span style={{ color: "#e5e7eb", fontSize: "12px" }}>{value}: {item.value} ({pct}%)</span>;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2: latency + throughput */}
      <div className="charts-row">
        <div className="chart-container chart-narrow">
          <h2 className="chart-title">Latency Breakdown (ms)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={latencyData} layout="vertical">
              <CartesianGrid stroke="#1f2937" horizontal={false} />
              <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" stroke="#6b7280" tick={{ fontSize: 12 }} width={70} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
              <Bar dataKey="latency" name="ms" radius={[0, 6, 6, 0]} barSize={24}>
                <Cell fill="#00f5d4" />
                <Cell fill="#facc15" />
                <Cell fill="#f97316" />
                <Cell fill="#ef4444" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container chart-wide">
          <h2 className="chart-title">Throughput (req/sec)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={throughput}>
              <defs>
                <linearGradient id="gradRps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f2937" />
              <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 11 }} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
              <Area type="monotone" dataKey="rps" stroke="#a78bfa" strokeWidth={2} fill="url(#gradRps)" name="RPS" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Live log */}
      <div className="chart-container" style={{ marginTop: "20px" }}>
        <h2 className="chart-title">Live Request Log</h2>
        <div className="request-log">
          {requestLog.length === 0 ? (
            <p className="log-empty">No requests yet — simulate a spike!</p>
          ) : (
            requestLog.map((entry, idx) => (
              <div key={idx} className={`log-entry log-${entry.type.toLowerCase().replace("_", "-")}`}>
                <span className="log-badge">{entry.type.replace("_", " ")}</span>
                <span className="log-time">{entry.timestamp}</span>
                <span className="log-latency">{entry.responseTime}ms</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Footer */}
      <footer className="footer">
        Built for Techflix Hackathon &middot; FluxShield &middot; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

/* ===================== Card ===================== */
function Card({ title, value, highlight, color, prefix = "", suffix = "", decimals = 0 }) {
  return (
    <div className={`card ${highlight ? "card-highlight" : ""}`}>
      <h3>{title}</h3>
      <p style={color ? { color, textShadow: `0 0 12px ${color}55` } : undefined}>
        <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
      </p>
    </div>
  );
}

export default App;