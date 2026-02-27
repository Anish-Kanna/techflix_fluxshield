const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { createClient } = require("redis");


const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN },
  transports: ["websocket", "polling"],
});

const redis = createClient({ url: REDIS_URL });
let redisConnected = false;

redis.on("error", (err) => {
  if (redisConnected) console.log("Redis Error:", err.message);
  redisConnected = false;
});
redis.on("ready", () => { redisConnected = true; });

async function connectRedis() {
  try {
    await redis.connect();
    redisConnected = true;
    console.log("✅ Connected to Redis at", REDIS_URL);
  } catch (err) {
    console.warn("⚠️  Redis unavailable, running without cache:", err.message);
    redisConnected = false;
  }
}

async function safeRedisGet(key) {
  if (!redisConnected) return null;
  try { return await redis.get(key); }
  catch { return null; }
}

async function safeRedisSetEx(key, ttl, value) {
  if (!redisConnected) return;
  try { await redis.setEx(key, ttl, value); }
  catch {}
}


let bypassMode = false; 

let totalRequests = 0;
let backendHits = 0;
let cacheHits = 0;
let deduplicated = 0;
let totalResponseTime = 0;
let cachedResponseTime = 0;
let cachedResponseCount = 0;
let backendResponseTime = 0;
let backendResponseCount = 0;
let errorCount = 0;

// P95 / P99 latency tracking
let allLatencies = [];

function getPercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

let requestTimestamps = [];
setInterval(() => {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((ts) => now - ts <= 10000);
}, 5000);

function getRequestsLast10Seconds() {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((ts) => now - ts <= 10000);
  return requestTimestamps.length;
}

function getAdaptiveTTL() {
  const recent = getRequestsLast10Seconds();
  if (recent > 200) return 30;
  if (recent > 100) return 20;
  if (recent > 50) return 10;
  return 5;
}

let requestLog = [];
function addRequestLog(type, responseTime) {
  requestLog.push({
    id: Date.now() + Math.random(),
    type,
    responseTime,
    timestamp: new Date().toLocaleTimeString(),
  });
  if (requestLog.length > 50) requestLog = requestLog.slice(-50);
}

let throughputHistory = [];
let lastSecondRequests = 0;
setInterval(() => {
  const rps = totalRequests - lastSecondRequests;
  lastSecondRequests = totalRequests;
  throughputHistory.push({ time: new Date().toLocaleTimeString(), rps });
  if (throughputHistory.length > 60) throughputHistory = throughputHistory.slice(-60);
}, 1000);

let lastEmit = 0;

function emitMetricsThrottled() {
  const now = Date.now();
  if (now - lastEmit < 400) return;
  lastEmit = now;

  const loadSaved = totalRequests > 0
    ? ((1 - backendHits / totalRequests) * 100).toFixed(2) : "0.00";

  const dedupEfficiency = totalRequests > 0
    ? ((deduplicated / totalRequests) * 100).toFixed(2) : "0.00";

  const avgResponseTime = totalRequests > 0
    ? (totalResponseTime / totalRequests).toFixed(2) : "0.00";

  const avgCachedLatency = cachedResponseCount > 0
    ? (cachedResponseTime / cachedResponseCount).toFixed(2) : "0.00";

  const avgBackendLatency = backendResponseCount > 0
    ? (backendResponseTime / backendResponseCount).toFixed(2) : "0.00";

  const costPerBackendCall = 0.0005;
  const costSaved = ((totalRequests - backendHits) * costPerBackendCall).toFixed(4);

  io.emit("metrics", {
    totalRequests,
    backendHits,
    cacheHits,
    deduplicated,
    errorCount,
    loadSaved,
    dedupEfficiency,
    avgResponseTime,
    avgCachedLatency,
    avgBackendLatency,
    p95Latency: getPercentile(allLatencies, 95).toFixed(2),
    p99Latency: getPercentile(allLatencies, 99).toFixed(2),
    requestsLast10Sec: getRequestsLast10Seconds(),
    adaptiveTTL: getAdaptiveTTL(),
    costSaved,
    redisConnected,
    bypassMode,
    requestLog: requestLog.slice(-15),
    throughputHistory: throughputHistory.slice(-30),
  });
}

// ── Upstream API target (the real API that FluxShield protects) ──
const UPSTREAM_API = process.env.UPSTREAM_API || "http://localhost:4000";

function fingerprint(req) {
  const raw = req.method + req.originalUrl + JSON.stringify(req.body);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const activeRequests = new Map();

/**
 * Smart proxy route — proxies ANY /api/* path to the upstream API.
 * e.g. GET /api/products  →  GET {UPSTREAM_API}/products
 *      GET /api/products/3 →  GET {UPSTREAM_API}/products/3
 *      GET /api/categories →  GET {UPSTREAM_API}/categories
 */
app.get(/^\/api\/(.*)/, async (req, res) => {
  const startTime = Date.now();
  totalRequests++;
  requestTimestamps.push(Date.now());

  // Strip "/api" prefix to get the upstream path
  const upstreamPath = req.originalUrl.replace(/^\/api/, "");
  const upstreamUrl = `${UPSTREAM_API}${upstreamPath}`;
  const key = fingerprint(req);

  try {
    // ── Bypass mode: skip cache, hit upstream directly ──
    if (bypassMode) {
      backendHits++;
      const response = await axios.get(upstreamUrl);
      const elapsed = Date.now() - startTime;
      totalResponseTime += elapsed;
      backendResponseTime += elapsed;
      backendResponseCount++;
      allLatencies.push(elapsed);
      if (allLatencies.length > 5000) allLatencies = allLatencies.slice(-5000);
      addRequestLog("BACKEND", elapsed);
      emitMetricsThrottled();
      return res.json(response.data);
    }

    // ── Check Redis cache ──
    const cached = await safeRedisGet(key);
    if (cached) {
      cacheHits++;
      const elapsed = Date.now() - startTime;
      totalResponseTime += elapsed;
      cachedResponseTime += elapsed;
      cachedResponseCount++;
      allLatencies.push(elapsed);
      if (allLatencies.length > 5000) allLatencies = allLatencies.slice(-5000);
      addRequestLog("CACHE_HIT", elapsed);
      emitMetricsThrottled();
      return res.json(JSON.parse(cached));
    }

    // ── Check in-flight deduplication ──
    if (activeRequests.has(key)) {
      deduplicated++;
      const data = await activeRequests.get(key);
      const elapsed = Date.now() - startTime;
      totalResponseTime += elapsed;
      cachedResponseTime += elapsed;
      cachedResponseCount++;
      allLatencies.push(elapsed);
      if (allLatencies.length > 5000) allLatencies = allLatencies.slice(-5000);
      addRequestLog("DEDUP", elapsed);
      emitMetricsThrottled();
      return res.json(data);
    }

    // ── Cache miss: fetch from upstream ──
    backendHits++;
    const ttl = getAdaptiveTTL();

    const backendPromise = (async () => {
      try {
        const response = await axios.get(upstreamUrl);
        const data = response.data;
        await safeRedisSetEx(key, ttl, JSON.stringify(data));
        return data;
      } finally {
        activeRequests.delete(key);
      }
    })();

    activeRequests.set(key, backendPromise);
    const data = await backendPromise;
    const elapsed = Date.now() - startTime;
    totalResponseTime += elapsed;
    backendResponseTime += elapsed;
    backendResponseCount++;
    allLatencies.push(elapsed);
    if (allLatencies.length > 5000) allLatencies = allLatencies.slice(-5000);
    addRequestLog("BACKEND", elapsed);
    emitMetricsThrottled();
    return res.json(data);
  } catch (err) {
    errorCount++;
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: "Internal error" });
    emitMetricsThrottled();
  }
});

app.get("/metrics", (req, res) => {
  res.json({
    totalRequests, backendHits, cacheHits, deduplicated,
    errorCount, redisConnected, bypassMode,
  });
});

app.post("/toggle-bypass", (req, res) => {
  bypassMode = !bypassMode;
  console.log(`🔀 Bypass mode: ${bypassMode ? "ON (no cache)" : "OFF (protected)"}`);
  emitMetricsThrottled();
  res.json({ bypassMode });
});

app.post("/reset-metrics", (req, res) => {
  totalRequests = backendHits = cacheHits = deduplicated = 0;
  totalResponseTime = cachedResponseTime = cachedResponseCount = 0;
  backendResponseTime = backendResponseCount = errorCount = 0;
  allLatencies = [];
  requestLog = [];
  requestTimestamps = [];
  throughputHistory = [];
  lastSecondRequests = 0;
  console.log("🔄 Metrics reset");
  emitMetricsThrottled();
  res.json({ message: "Metrics reset" });
});

app.post("/simulate-spike", async (req, res) => {
  const rawCount = parseInt(req.body.count) || 500;
  const count = Math.min(Math.max(rawCount, 1), 2000);

  console.log(`⚡ Simulating ${count} concurrent requests (bypass=${bypassMode})`);

  // Hit multiple endpoints to show FluxShield works across routes
  const endpoints = [
    `http://localhost:${PORT}/api/products`,
    `http://localhost:${PORT}/api/products/1`,
    `http://localhost:${PORT}/api/categories`,
  ];

  const batchSize = 100;
  for (let i = 0; i < count; i += batchSize) {
    const batch = [];
    const size = Math.min(batchSize, count - i);
    for (let j = 0; j < size; j++) {
      const url = endpoints[j % endpoints.length]; // round-robin across endpoints
      batch.push(axios.get(url).catch(() => {}));
    }
    await Promise.all(batch);
  }

  res.json({ message: `Simulated ${count} requests across ${endpoints.length} endpoints` });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), redis: redisConnected });
});

async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => console.log("HTTP server closed"));
  if (redisConnected) {
    try { await redis.quit(); } catch {}
  }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function start() {
  await connectRedis();
  server.listen(PORT, () => {
    console.log(`🚀 FluxShield running on port ${PORT}`);
    console.log(`   Redis: ${redisConnected ? "✅ connected" : "⚠️  offline (cache disabled)"}`);
    console.log(`   Dashboard: http://localhost:${PORT}`);
  });
}

start();