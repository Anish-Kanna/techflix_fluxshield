# 🛡️ FluxShield

### Real-Time Adaptive API Traffic Intelligence Layer

> A smart caching + request deduplication proxy that dynamically shields backend APIs from traffic spikes — with a real-time monitoring dashboard.

---

## 🎯 Problem

During flash sales, viral events, or DDoS-like traffic spikes, backend APIs get overwhelmed with thousands of identical requests per second. Each redundant request wastes compute, increases latency, and costs money.

## 💡 Solution

**FluxShield** sits between clients and the backend as an intelligent proxy layer that:

1. **🗄️ Redis Caching** — Caches responses with adaptive TTL (auto-increases during spikes)
2. **🔁 Request Deduplication** — Collapses concurrent identical requests into one backend call
3. **📊 Adaptive TTL** — Cache duration dynamically scales based on real-time traffic volume
4. **📈 Live Dashboard** — Real-time metrics, latency comparisons, and traffic visualization
5. **🔀 Before/After Toggle** — Disable the shield live to demonstrate raw vs protected performance

---

## 🏗️ Architecture

```
                    ┌──────────────┐
                    │   Dashboard  │  (React + Recharts)
                    │  Socket.IO   │
                    └──────┬───────┘
                           │ WebSocket
                    ┌──────▼───────┐
 Clients ──────►   │  FluxShield  │  (Express Proxy)
                    │  Smart Proxy │
                    └──┬───────┬───┘
                       │       │
              ┌────────▼──┐  ┌─▼─────────────┐
              │   Redis    │  │  Backend API   │
              │  (Cache)   │  │  (Simulated)   │
              └────────────┘  └────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+
- **Redis** (optional — FluxShield runs gracefully without it)

### Install & Run

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd Techflix-hackathon

# 2. Backend
cd backend
npm install
node update_server.js
# → Server runs on http://localhost:3000

# 3. Dashboard (new terminal)
cd dashboard
npm install
npm start
# → Dashboard opens on http://localhost:3001
```

### With Redis (recommended)
```bash
# Windows (via WSL or Docker)
docker run -d -p 6379:6379 redis

# macOS
brew services start redis
```

---

## 📊 Dashboard Features

| Feature | Description |
|---------|-------------|
| **12 Live Metric Cards** | Total requests, cache hits, dedup count, load saved %, cost saved, P95/P99 latency, adaptive TTL |
| **Architecture Diagram** | Visual flow showing request path through the system |
| **Traffic Area Chart** | Total requests vs backend executions over time |
| **Request Distribution Pie** | Cache hits vs deduplicated vs backend |
| **Latency Bar Chart** | Cached vs P95 vs P99 vs backend latency comparison |
| **Throughput Chart** | Requests per second over time |
| **Live Request Log** | Scrolling feed of each request with type badge and latency |
| **Spike Simulator** | Configurable slider (10–2000) to trigger concurrent requests |
| **Before/After Toggle** | Disable caching+dedup live to show un-shielded performance |
| **Reset Button** | Clear all metrics for a fresh demo |
| **Animated Counters** | Smooth cubic-eased number transitions |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express, Socket.IO |
| **Cache** | Redis (Upstash for cloud) |
| **Frontend** | React 19, Recharts |
| **Real-time** | Socket.IO WebSocket |
| **Hosting** | Render (backend) + Vercel (dashboard) |

---

## ☁️ Hosting

### Backend → Render.com
1. Push repo to GitHub
2. Create a **Web Service** on Render pointing to `/backend`
3. Set env vars: `REDIS_URL` (from Upstash), `CORS_ORIGIN` (your Vercel URL)
4. Build: `npm install`, Start: `node update_server.js`

### Dashboard → Vercel
1. Import repo on Vercel, set root to `dashboard/`
2. Set env var: `REACT_APP_API_URL` = your Render backend URL
3. Deploy

### Redis → Upstash
1. Create a free Redis database at [upstash.com](https://upstash.com)
2. Copy the `REDIS_URL` (starts with `redis://...`)
3. Set it as env var on Render

---

## 📈 Key Metrics Explained

- **Load Saved %** — `(1 - backendHits / totalRequests) × 100` — how much backend load FluxShield absorbed
- **Dedup Efficiency %** — `(deduplicated / totalRequests) × 100` — requests collapsed into shared promises
- **Adaptive TTL** — 5s (normal) → 10s (>50 req/10s) → 20s (>100) → 30s (>200)
- **Cost Saved** — `$0.0005 per avoided backend call` — simulated cloud function pricing
- **P95/P99 Latency** — Tail latency percentiles across all requests

---

## 🏆 Hackathon Highlights

1. **Real problem, real solution** — API traffic spikes are a billion-dollar infrastructure problem
2. **Live demo-friendly** — Click "Simulate Spike" and watch the dashboard light up in real-time
3. **Before/After** — Toggle the shield off to show judges the raw difference
4. **Production-grade patterns** — Request dedup, adaptive TTL, graceful degradation, P95/P99 tracking
5. **Beautiful dashboard** — Dark theme, animated counters, 4 chart types, architecture diagram

---

## 📄 License

MIT
