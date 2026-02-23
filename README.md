# Market Insights

A fully-static website that fetches live markets from [Polymarket](https://polymarket.com),
filters them by **Finance** and **Politics**, and surfaces events with a high probability of
resolving "Yes". No backend required.

---

## Running locally

Opening `index.html` directly as a `file://` URL triggers a CORS block because browsers
reject requests from a null origin. The app automatically detects this and routes all API
calls through **[corsproxy.io](https://corsproxy.io)** — a free public relay that adds the
required `Access-Control-Allow-Origin` header.

> No configuration needed. Just open `index.html` in any modern browser.

If corsproxy.io is unavailable, deploy to Netlify or Vercel (see below) where the API is
proxied at the edge instead.

---

## Deploying (recommended)

When served over HTTP/HTTPS the app uses the relative path `/api/*`, which is rewritten by
the hosting platform directly to `gamma-api.polymarket.com` — no third-party proxy involved.

### Netlify (easiest)

1. Push this repo to GitHub.
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
3. Select the repo. Build command: *(leave blank)*. Publish directory: `.` (root).
4. Deploy — the `_redirects` file handles the proxy automatically.

### Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Framework preset: **Other**. Root directory: `.`.
4. Deploy — `vercel.json` configures the rewrite.

### GitHub Pages

GitHub Pages does not support server-side rewrites, so the app will fall back to
corsproxy.io when deployed there. This works fine for demos; for production prefer
Netlify or Vercel.

---

## Project structure

```
/
├── index.html        Main page
├── css/
│   └── styles.css    Dark-theme stylesheet
├── js/
│   └── app.js        Data fetching, filtering, rendering
├── _redirects        Netlify proxy rule
└── vercel.json       Vercel rewrite rule
```

---

## Data source

All market data is provided by [Polymarket](https://polymarket.com) via the public
Gamma API (`gamma-api.polymarket.com`). This site is not affiliated with Polymarket.
