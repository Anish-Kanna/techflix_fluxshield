/**
 * Upstream Product Catalog API
 * ─────────────────────────────
 * This is the "real" backend API that FluxShield protects.
 * Deployed separately to demonstrate real cross-service proxying.
 *
 * Simulates a realistic product catalog with:
 *  - Database query latency (200–800ms)
 *  - Multiple endpoints (/products, /products/:id, /categories)
 *  - Request counting so judges can see exactly how many calls arrive
 */

const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

/* ── Request counter (proves how many calls actually reach this server) ── */
let totalHits = 0;
let hitLog = [];

/* ── Sample data (simulates a database) ── */
const products = [
  { id: 1, name: "Stranger Things S5", category: "Series", rating: 9.2, price: 14.99, streaming: true },
  { id: 2, name: "Wednesday S2", category: "Series", rating: 8.7, price: 12.99, streaming: true },
  { id: 3, name: "Squid Game S3", category: "Series", rating: 9.5, price: 15.99, streaming: false },
  { id: 4, name: "The Witcher S4", category: "Series", rating: 8.1, price: 13.99, streaming: true },
  { id: 5, name: "Glass Onion 2", category: "Movie", rating: 8.8, price: 19.99, streaming: false },
  { id: 6, name: "Extraction 3", category: "Movie", rating: 7.9, price: 16.99, streaming: true },
  { id: 7, name: "Don't Look Up 2", category: "Movie", rating: 7.5, price: 14.99, streaming: false },
  { id: 8, name: "Red Notice 2", category: "Movie", rating: 7.2, price: 15.99, streaming: true },
  { id: 9, name: "Arcane S3", category: "Animation", rating: 9.4, price: 11.99, streaming: true },
  { id: 10, name: "Love Death Robots S4", category: "Animation", rating: 8.9, price: 10.99, streaming: true },
  { id: 11, name: "One Piece Live Action S2", category: "Series", rating: 8.6, price: 14.99, streaming: false },
  { id: 12, name: "Black Mirror S7", category: "Series", rating: 8.3, price: 13.99, streaming: true },
];

const categories = ["Series", "Movie", "Animation"];

/* ── Simulate real database query latency ── */
function simulateDbLatency() {
  const delay = 200 + Math.floor(Math.random() * 600); // 200–800ms
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/* ── Endpoints ── */

// GET /products — full catalog
app.get("/products", async (req, res) => {
  const start = Date.now();
  await simulateDbLatency();
  totalHits++;
  const elapsed = Date.now() - start;

  hitLog.push({ endpoint: "/products", time: new Date().toISOString(), latency: elapsed });
  if (hitLog.length > 100) hitLog = hitLog.slice(-100);

  res.json({
    data: products,
    meta: {
      total: products.length,
      serverLatency: elapsed,
      servedAt: new Date().toISOString(),
      totalHitsToThisServer: totalHits,
    },
  });
});

// GET /products/:id — single product
app.get("/products/:id", async (req, res) => {
  const start = Date.now();
  await simulateDbLatency();
  totalHits++;
  const elapsed = Date.now() - start;

  const product = products.find((p) => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: "Product not found" });

  hitLog.push({ endpoint: `/products/${req.params.id}`, time: new Date().toISOString(), latency: elapsed });
  if (hitLog.length > 100) hitLog = hitLog.slice(-100);

  res.json({
    data: product,
    meta: { serverLatency: elapsed, servedAt: new Date().toISOString(), totalHitsToThisServer: totalHits },
  });
});

// GET /categories — list categories
app.get("/categories", async (req, res) => {
  const start = Date.now();
  await simulateDbLatency();
  totalHits++;
  const elapsed = Date.now() - start;

  hitLog.push({ endpoint: "/categories", time: new Date().toISOString(), latency: elapsed });
  if (hitLog.length > 100) hitLog = hitLog.slice(-100);

  res.json({
    data: categories,
    meta: { serverLatency: elapsed, servedAt: new Date().toISOString(), totalHitsToThisServer: totalHits },
  });
});

// GET /stats — shows how many requests actually hit this server (for judges!)
app.get("/stats", (req, res) => {
  res.json({
    totalHits,
    recentLog: hitLog.slice(-20),
    message: "These are the ACTUAL calls that reached the upstream API. Compare with FluxShield's totalRequests to see savings.",
  });
});

// GET /health
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "upstream-product-api", uptime: process.uptime(), totalHits });
});

// POST /reset
app.post("/reset", (req, res) => {
  totalHits = 0;
  hitLog = [];
  res.json({ message: "Stats reset" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`📦 Upstream Product API running on port ${PORT}`);
  console.log(`   Endpoints: /products, /products/:id, /categories, /stats, /health`);
});
