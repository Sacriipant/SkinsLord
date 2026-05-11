// background.js — Service Worker
// Handles API requests and caching to avoid rate-limiting

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const priceCache = new Map(); // { marketHashName: { csfloat, buff, timestamp } }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_PRICES') {
    fetchPrices(message.marketHashName, message.currency)
      .then(prices => sendResponse({ success: true, prices }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(['currency', 'showCsfloat', 'showBuff', 'pricempireKey'], data => {
      sendResponse({
        currency:     data.currency     ?? 'EUR',
        showCsfloat:  data.showCsfloat  ?? true,
        showBuff:     data.showBuff     ?? true,
        pricempireKey: data.pricempireKey ?? ''
      });
    });
    return true;
  }
});

async function fetchPrices(marketHashName, currency = 'EUR') {
  console.log(`[SBPC] Fetching prices for: "${marketHashName}"`);
  
  const cacheKey = `${marketHashName}__${currency}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    console.log('[SBPC] Cache hit');
    return cached.data;
  }

  const [csfloat, buff] = await Promise.allSettled([
    fetchCSFloat(marketHashName),
    fetchBuff(marketHashName)
  ]);

  const data = {
    csfloat: csfloat.status === 'fulfilled' ? csfloat.value : null,
    buff:    buff.status    === 'fulfilled' ? buff.value    : null,
  };

  if (csfloat.status === 'rejected') {
    console.warn('[SBPC] CSFloat fetch failed:', csfloat.reason?.message);
  }
  if (buff.status === 'rejected') {
    console.warn('[SBPC] Buff fetch failed:', buff.reason?.message);
  }

  console.log('[SBPC] Fetched prices:', data);

  priceCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

// ── CSFloat ────────────────────────────────────────────────────────────────
async function fetchCSFloat(marketHashName) {
  const encoded = encodeURIComponent(marketHashName);
  // Get the 5 lowest listings and use the cheapest one
  const url = `https://csfloat.com/api/v1/listings?market_hash_name=${encoded}&limit=5&sort_by=lowest_price&type=buy_now`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) throw new Error(`CSFloat API error: ${res.status}`);
  const json = await res.json();

  if (!json.data || json.data.length === 0) return null;

  // Price is in cents (USD)
  const lowestCents = json.data[0].price;
  const priceUSD = lowestCents / 100;

  return {
    price:      priceUSD,
    currency:   'USD',
    count:      json.data.length,
    url:        `https://csfloat.com/search?market_hash_name=${encoded}`
  };
}

// ── Buff163 (via community price list) ────────────────────────────────────
// Buff's API requires Chinese account cookies, so we use a maintained
// community price dataset as fallback. For live Buff data, users can
// add a Pricempire API key in settings.
async function fetchBuff(marketHashName) {
  // Try Pricempire API (user-provided key) first — most accurate
  const settings = await getStorageSettings();
  if (settings.pricempireKey) {
    return fetchPricempire(marketHashName, settings.pricempireKey);
  }

  // Fallback: CSGOTrader community price dump (updated hourly, free)
  const res = await fetch('https://prices.csgotrader.app/latest/buff163.json');
  if (!res.ok) throw new Error('Buff price source unavailable');

  const json = await res.json();
  const entry = json[marketHashName];
  if (!entry) return null;

  const priceRMB = entry.starting_at?.price ?? entry.highest_buy_order;
  if (!priceRMB) return null;

  return {
    price:    parseFloat(priceRMB),
    currency: 'CNY',
    url:      `https://buff.163.com/market/goods?search=${encodeURIComponent(marketHashName)}&game=csgo`
  };
}

async function fetchPricempire(marketHashName, apiKey) {
  const encoded = encodeURIComponent(marketHashName);
  // Pricempire v3 API: sources can be buff163, steam, csfloat, etc.
  const url = `https://api.pricempire.com/v3/items/prices?api_key=${apiKey}&market_hash_name=${encoded}&sources=buff163`;

  console.log('[SBPC] Pricempire request:', url.replace(apiKey, 'KEY'));
  
  const res = await fetch(url);
  if (!res.ok) {
    console.error('[SBPC] Pricempire HTTP error:', res.status);
    throw new Error(`Pricempire HTTP ${res.status}`);
  }
  
  const json = await res.json();
  console.log('[SBPC] Pricempire response:', json);

  // Response format: { "AK-47 | Redline (Field-Tested)": { buff163: 1234, ... } }
  const item = json[marketHashName];
  
  // Try both 'buff163' and 'buff' keys (API versions differ)
  const priceData = item?.buff163 ?? item?.buff;
  if (!priceData) {
    console.warn('[SBPC] Pricempire: no buff163 data for', marketHashName);
    return null;
  }

  // Pricempire returns prices in cents (USD)
  const priceCents = typeof priceData === 'number' ? priceData : priceData.price;
  if (!priceCents) return null;

  return {
    price:    priceCents / 100,
    currency: 'USD',
    url:      `https://buff.163.com/market/goods?search=${encoded}&game=csgo`
  };
}

function getStorageSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['pricempireKey'], data => resolve(data));
  });
}
