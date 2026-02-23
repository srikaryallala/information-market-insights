/* ============================================================
   Market Insights — app.js
   Fetches Polymarket data and renders high-probability
   finance & politics markets.
   ============================================================ */

'use strict';

// ── Configuration ─────────────────────────────────────────────

// Polymarket's Gamma API blocks all cross-origin requests.
// corsproxy.io is a public CORS relay that adds the missing header.
// It works from file://, GitHub Pages, Netlify, Vercel — everywhere.
const CONFIG = {
  API_BASE:          'https://corsproxy.io/?https://gamma-api.polymarket.com',
  MARKET_LIMIT:      100,
  REFRESH_INTERVAL:  2 * 60 * 1000,
  DEFAULT_THRESHOLD: 70,
};

// ── Category keywords ─────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  finance: [
    'finance', 'financial', 'economics', 'economy', 'economic',
    'stock', 'stocks', 'equities', 'market', 'markets',
    'crypto', 'bitcoin', 'ethereum', 'defi', 'blockchain',
    'fed', 'federal reserve', 'interest rate', 'inflation', 'cpi', 'gdp',
    'recession', 'currency', 'dollar', 'euro', 'yen', 'pound',
    'oil', 'gold', 'silver', 'commodity', 'commodities',
    'trading', 'investment', 'nasdaq', 's&p', 'dow jones',
    'bonds', 'treasury', 'yield', 'etf', 'ipo', 'earnings',
    'bank', 'banking', 'hedge fund', 'private equity',
  ],
  politics: [
    'politics', 'political', 'geopolitics',
    'election', 'elections', 'vote', 'voting', 'ballot',
    'president', 'presidential', 'prime minister',
    'congress', 'senate', 'house', 'parliament', 'legislation',
    'government', 'policy', 'democrat', 'republican', 'party',
    'primary', 'campaign', 'candidate', 'inauguration',
    'war', 'military', 'sanctions', 'treaty',
    'nato', 'un ', 'united nations', 'eu ', 'european union',
    'supreme court', 'administration', 'cabinet',
    'referendum', 'constitution', 'impeach',
  ],
};

// ── Application State ─────────────────────────────────────────

const state = {
  markets:          [],
  activeCategories: new Set(['finance', 'politics']),
  threshold:        CONFIG.DEFAULT_THRESHOLD,
  sortBy:           'probability',
  loading:          false,
  lastUpdated:      null,
};

// ── DOM References ────────────────────────────────────────────

const dom = {
  grid:             document.getElementById('markets-grid'),
  loadingEl:        document.getElementById('loading'),
  errorEl:          document.getElementById('error'),
  emptyEl:          document.getElementById('empty'),
  countEl:          document.getElementById('market-count'),
  lastUpdatedEl:    document.getElementById('last-updated'),
  thresholdSlider:  document.getElementById('threshold'),
  thresholdDisplay: document.getElementById('threshold-display'),
  sortSelect:       document.getElementById('sort-select'),
  filterBtns:       document.querySelectorAll('.filter-btn[data-category]'),
  progressBar:      document.getElementById('progress-bar'),
  countdown:        document.getElementById('countdown'),
};

// ── API Layer ─────────────────────────────────────────────────

async function fetchMarketPage(extraParams = {}) {
  const params = new URLSearchParams({
    active:    'true',
    closed:    'false',
    archived:  'false',
    limit:     String(CONFIG.MARKET_LIMIT),
    order:     'volume',
    ascending: 'false',
    ...extraParams,
  });

  const res = await fetch(`${CONFIG.API_BASE}/markets?${params}`);
  if (!res.ok) throw new Error(`Polymarket API responded with HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function loadAllMarkets() {
  const results = await Promise.allSettled([
    fetchMarketPage(),
    fetchMarketPage({ tag_slug: 'politics' }),
    fetchMarketPage({ tag_slug: 'finance' }),
    fetchMarketPage({ tag_slug: 'economics' }),
    fetchMarketPage({ tag_slug: 'crypto' }),
  ]);

  const seen = new Set();
  const out  = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const m of r.value) {
        if (m.id && !seen.has(m.id)) { seen.add(m.id); out.push(m); }
      }
    } else {
      console.warn('One market batch failed:', r.reason);
    }
  }
  return out;
}

// ── Data Processing ───────────────────────────────────────────

function getProbability(market) {
  try {
    const prices =
      typeof market.outcomePrices === 'string'
        ? JSON.parse(market.outcomePrices)
        : market.outcomePrices;
    const p = parseFloat(Array.isArray(prices) ? prices[0] : 0);
    return Number.isNaN(p) ? 0 : Math.round(p * 1000) / 10;
  } catch {
    return 0;
  }
}

function detectCategory(market) {
  const event   = market.events?.[0];
  const rawCat  = (event?.category ?? '').toLowerCase();
  const tagText = (event?.tags ?? [])
    .map(t => `${t.label ?? ''} ${t.slug ?? ''}`.toLowerCase())
    .join(' ');
  const question = (market.question ?? '').toLowerCase();
  const haystack = `${rawCat} ${tagText} ${question}`;

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => haystack.includes(k))) return cat;
  }
  return null;
}

function processMarkets(raw) {
  return raw
    .map(m => ({
      ...m,
      _probability: getProbability(m),
      _category:    detectCategory(m),
    }))
    .filter(m =>
      m._category !== null &&
      m._probability > 0   &&
      m._probability < 100 &&
      !m.closed             &&
      !m.archived
    );
}

function getFilteredMarkets() {
  return state.markets
    .filter(m =>
      state.activeCategories.has(m._category) &&
      m._probability >= state.threshold
    )
    .sort((a, b) => {
      switch (state.sortBy) {
        case 'volume':
          return (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0);
        case 'expiry': {
          const da = a.endDate ? new Date(a.endDate) : new Date('9999-12-31');
          const db = b.endDate ? new Date(b.endDate) : new Date('9999-12-31');
          return da - db;
        }
        default:
          return b._probability - a._probability;
      }
    });
}

// ── Formatting Helpers ────────────────────────────────────────

function fmtVolume(val) {
  if (val == null) return '–';
  const n = parseFloat(val);
  if (Number.isNaN(n) || n === 0) return '–';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(str) {
  if (!str) return 'Open-ended';
  try {
    return new Date(str).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

function probClass(p) {
  if (p >= 90) return 'very-high';
  if (p >= 75) return 'high';
  if (p >= 60) return 'medium';
  return 'low';
}

function marketUrl(market) {
  const slug = market.events?.[0]?.slug ?? market.slug;
  return slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com';
}

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Card Rendering ────────────────────────────────────────────

function buildCard(market) {
  const p  = market._probability;
  const cat = market._category;
  const ev  = market.events?.[0];
  const pc  = probClass(p);

  const card = document.createElement('article');
  card.className = `card cat-${cat}`;
  card.setAttribute('role', 'listitem');

  card.innerHTML = `
    <div class="card-top">
      <span class="tag tag-${cat}">${cat === 'finance' ? 'Finance' : 'Politics'}</span>
      <div class="prob-badge prob-${pc}" title="${p.toFixed(1)}% chance of Yes">
        <span class="prob-num">${p.toFixed(1)}</span>
        <span class="prob-pct">%</span>
        <span class="prob-lbl">YES</span>
      </div>
    </div>

    ${ev?.title
      ? `<p class="event-label" title="${escHtml(ev.title)}">${escHtml(ev.title)}</p>`
      : ''
    }

    <h2 class="question">${escHtml(market.question ?? 'Untitled market')}</h2>

    <div class="meta-row">
      <div class="meta">
        <span class="meta-k">Volume</span>
        <span class="meta-v">${fmtVolume(market.volume)}</span>
      </div>
      <div class="meta">
        <span class="meta-k">Liquidity</span>
        <span class="meta-v">${fmtVolume(market.liquidity)}</span>
      </div>
      <div class="meta">
        <span class="meta-k">Resolves</span>
        <span class="meta-v">${fmtDate(market.endDate)}</span>
      </div>
    </div>

    <a class="card-link"
       href="${marketUrl(market)}"
       target="_blank"
       rel="noopener noreferrer">
      Trade on Polymarket <span aria-hidden="true">→</span>
    </a>

    <div class="prob-bar" role="progressbar"
         aria-valuenow="${p.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"
         aria-label="${p.toFixed(1)}% probability">
      <div class="prob-fill prob-fill-${pc}" style="width:${p}%"></div>
    </div>
  `;

  return card;
}

// ── UI Render ─────────────────────────────────────────────────

function render() {
  const markets = getFilteredMarkets();

  dom.grid.innerHTML = '';

  if (markets.length === 0) {
    dom.emptyEl.classList.remove('hidden');
    dom.countEl.textContent = 'No markets match current filters';
  } else {
    dom.emptyEl.classList.add('hidden');

    const frag = document.createDocumentFragment();
    markets.forEach(m => frag.appendChild(buildCard(m)));
    dom.grid.appendChild(frag);

    const n = markets.length;
    dom.countEl.textContent = `${n} market${n !== 1 ? 's' : ''}`;
  }

  if (state.lastUpdated) {
    dom.lastUpdatedEl.textContent = `Updated ${state.lastUpdated.toLocaleTimeString()}`;
  }
}

// ── Countdown ─────────────────────────────────────────────────

let _countdownInterval = null;

function startCountdown() {
  if (_countdownInterval) clearInterval(_countdownInterval);
  let remaining = CONFIG.REFRESH_INTERVAL / 1000;

  function tick() {
    dom.progressBar.style.width = `${(remaining / (CONFIG.REFRESH_INTERVAL / 1000)) * 100}%`;
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    dom.countdown.textContent = `Next refresh in ${m}:${String(s).padStart(2, '0')}`;
    if (remaining > 0) remaining--;
  }

  tick();
  _countdownInterval = setInterval(tick, 1000);
}

// ── Main Data Cycle ───────────────────────────────────────────

async function main() {
  if (state.loading) return;
  state.loading = true;

  dom.loadingEl.classList.remove('hidden');
  dom.errorEl.classList.add('hidden');
  dom.grid.classList.add('faded');

  try {
    const raw = await loadAllMarkets();
    state.markets     = processMarkets(raw);
    state.lastUpdated = new Date();

    dom.loadingEl.classList.add('hidden');
    dom.grid.classList.remove('faded');

    render();
    startCountdown();

  } catch (err) {
    console.error('[Market Insights] Failed to load markets:', err);
    dom.loadingEl.classList.add('hidden');
    dom.grid.classList.remove('faded');
    dom.errorEl.classList.remove('hidden');
    if (state.markets.length > 0) render();

  } finally {
    state.loading = false;
  }
}

// ── Event Listeners ───────────────────────────────────────────

dom.thresholdSlider.addEventListener('input', () => {
  state.threshold = parseInt(dom.thresholdSlider.value, 10);
  dom.thresholdDisplay.textContent = `${state.threshold}%`;
  render();
});

dom.sortSelect.addEventListener('change', () => {
  state.sortBy = dom.sortSelect.value;
  render();
});

dom.filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.category;
    if (state.activeCategories.has(cat)) {
      if (state.activeCategories.size > 1) {
        state.activeCategories.delete(cat);
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    } else {
      state.activeCategories.add(cat);
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    }
    render();
  });
});

// ── Bootstrap ─────────────────────────────────────────────────

main();
setInterval(main, CONFIG.REFRESH_INTERVAL);
