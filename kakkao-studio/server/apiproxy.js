// Local counterpart of api/proxy.js + api/config.js — a Vite middleware so /api/proxy and
// /api/config work under `npm run dev` / `npm run preview` exactly as the Vercel functions
// do in prod. Keys come from the server environment (.env, loaded below) and are injected
// per host; the browser never sends a key.
import fs from "node:fs";
import path from "node:path";

// Load .env into process.env for dev (Vercel provides env natively in prod).
try {
  const p = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const ALLOW = [
  /(^|\.)ai33\.pro$/,
  /(^|\.)anthropic\.com$/,
  /(^|\.)googleapis\.com$/,
  /(^|\.)groq\.com$/,
  /\.r2\.dev$/,
  /\.r2\.cloudflarestorage\.com$/,
  /(^|\.)suno\.ai$/,
  /(^|\.)pexels\.com$/,
  /(^|\.)pixabay\.com$/,
  /(^|\.)coverr\.co$/,
  /(^|\.)vimeocdn\.com$/,
  /(^|\.)wikimedia\.org$/,
  /(^|\.)wikipedia\.org$/,
  /(^|\.)archive\.org$/,
  /(^|\.)archives\.gov$/,
  /(^|\.)s3\.amazonaws\.com$/,
];

const env = (k) => process.env[k] || "";

function injectKey(url, headers) {
  const host = url.hostname;
  const setQ = (p, v) => { if (v) url.searchParams.set(p, v); };
  if (/(^|\.)ai33\.pro$/.test(host)) { if (env("AI33_API_KEY")) headers["xi-api-key"] = env("AI33_API_KEY"); }
  else if (/(^|\.)anthropic\.com$/.test(host)) { if (env("ANTHROPIC_API_KEY")) headers["x-api-key"] = env("ANTHROPIC_API_KEY"); if (!headers["anthropic-version"]) headers["anthropic-version"] = "2023-06-01"; headers["anthropic-dangerous-direct-browser-access"] = "true"; }
  else if (/(^|\.)groq\.com$/.test(host)) { if (env("GROQ_API_KEY")) headers["authorization"] = `Bearer ${env("GROQ_API_KEY")}`; }
  else if (/(^|\.)pexels\.com$/.test(host)) { if (env("PEXELS_API_KEY")) headers["authorization"] = env("PEXELS_API_KEY"); }
  else if (/(^|\.)coverr\.co$/.test(host)) { if (env("COVERR_API_KEY")) headers["authorization"] = `Bearer ${env("COVERR_API_KEY")}`; }
  else if (/(^|\.)pixabay\.com$/.test(host)) { setQ("key", env("PIXABAY_API_KEY")); }
  else if (/(^|\.)archives\.gov$/.test(host)) { if (env("NARA_API_KEY")) headers["x-api-key"] = env("NARA_API_KEY"); }
  else if (/(^|\.)generativelanguage\.googleapis\.com$/.test(host)) { setQ("key", env("GEMINI_API_KEY")); }
  else if (/(^|\.)googleapis\.com$/.test(host)) { if (!headers["authorization"]) setQ("key", env("YOUTUBE_API_KEY")); }
  return url.href;
}

function configBody() {
  const has = (k) => Boolean(process.env[k]);
  return {
    anthropic: has("ANTHROPIC_API_KEY"), youtube: has("YOUTUBE_API_KEY"), gemini: has("GEMINI_API_KEY"),
    groq: has("GROQ_API_KEY"), ai33: has("AI33_API_KEY"), pexels: has("PEXELS_API_KEY"),
    pixabay: has("PIXABAY_API_KEY"), coverr: has("COVERR_API_KEY"), nara: has("NARA_API_KEY"),
    images: has("AI33_API_KEY"), ai33Base: process.env.AI33_BASE_URL || "https://api.ai33.pro",
    googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "",
  };
}

async function handle(req, res, next) {
  let u;
  try { u = new URL(req.url, "http://localhost"); } catch { return next(); }
  if (u.pathname === "/api/config") {
    res.statusCode = 200; res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify(configBody())); return;
  }
  if (u.pathname !== "/api/proxy") return next();

  const target = req.headers["x-proxy-url"];
  if (!target) { res.statusCode = 400; res.end("missing x-proxy-url"); return; }
  let url;
  try { url = new URL(target); } catch { res.statusCode = 400; res.end("bad url"); return; }
  if (url.protocol !== "https:" || !ALLOW.some((re) => re.test(url.hostname))) {
    res.statusCode = 403; res.end("host not allowed"); return;
  }
  const headers = {};
  for (const h of ["authorization", "content-type", "accept", "anthropic-version"]) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  const finalTarget = injectKey(url, headers);
  headers["user-agent"] = "Kakkao/1.0 (+https://kakkao.vercel.app)";
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks);
  try {
    const upstream = await fetch(finalTarget, { method: req.method, headers, body });
    res.statusCode = upstream.status;
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    res.statusCode = 502; res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "upstream fetch failed: " + e.message }));
  }
}

export default function apiProxy() {
  return {
    name: "api-proxy",
    configureServer(server) { server.middlewares.use(handle); },
    configurePreview(server) { server.middlewares.use(handle); },
  };
}
