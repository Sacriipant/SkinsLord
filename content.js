// content.js — SkinBaron Price Compare
// Confirmed from live DOM: May 2025
//
// Cards:  a.offer-card  (href has productName, typeName, sometimes skinName)
// Modal:  .modal-inner-content  (has direct link with productName + skinName + typeName)
//         wear from CSS class on .product-exterior  (factory-new / minimal-wear / etc.)

(function () {
  'use strict';

  let settings = {
    currency:      'EUR',
    showCsfloat:   true,
    showBuff:      true,
    pricempireKey: ''
  };
 
  // Live exchange rates (fetched from background, updated every 24h)
  let exchangeRates = { USD: 1, EUR: 0.92, GBP: 0.79, CNY: 7.24 }; // fallback
  const PRICE_BADGE_CLASS = 'sbpc-price-badge';
  const processed = new WeakSet();

  const HYPHENATED_WEAPONS = [
    'AK-47', 'M4A1-S', 'MP5-SD', 'MAC-10', 'UMP-45', 'PP-Bizon', 'CZ75-Auto',
    'Five-SeveN', 'Glock-18', 'USP-S', 'P2000'
  ];

  // typeNames that need a ★ prefix in Steam market hash name
  const STAR_TYPES = new Set(['Knife', 'Gloves', 'Glove']);

  // CSS class on .product-exterior → English wear name (modal, most reliable)
  const WEAR_CLASS_MAP = {
    'factory-new':   'Factory New',
    'minimal-wear':  'Minimal Wear',
    'field-tested':  'Field-Tested',
    'well-worn':     'Well-Worn',
    'battle-scarred':'Battle-Scarred'
  };

  // French/English text on cards (.exteriorName)
  const WEAR_TEXT_MAP = {
    'neuve':                  'Factory New',
    'très peu usée':          'Minimal Wear',
    'testée sur le terrain':  'Field-Tested',
    'usée':                   'Well-Worn',
    'traces de combat':       'Battle-Scarred',
    'légèrement usé':         'Minimal Wear',
    'usé':                    'Field-Tested',
    'très usé':               'Well-Worn',
    'usé au combat':          'Battle-Scarred',
    'factory new':            'Factory New',
    'minimal wear':           'Minimal Wear',
    'field-tested':           'Field-Tested',
    'well-worn':              'Well-Worn',
    'battle-scarred':         'Battle-Scarred',
  };

  // ── Settings ─────────────────────────────────────────────────────────────
  function loadSettings() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resp => {
        if (resp) Object.assign(settings, resp);
        resolve();
      });
    });
  }

  function convertPrice(amount, fromCurrency) {
    if (fromCurrency === settings.currency) return amount;
    return (amount / (exchangeRates[fromCurrency] || 1)) * (exchangeRates[settings.currency] || 1);
  }

  function formatPrice(amount, currency) {
    const sym = { USD: '$', EUR: '€', GBP: '£', CNY: '¥' };
    return `${sym[currency] || currency + ' '}${amount.toFixed(2)}`;
  }

  // ── Name reconstruction ───────────────────────────────────────────────────
  function decodePart(raw) {
    let s = decodeURIComponent(raw).replace(/-/g, ' ');
    for (const w of HYPHENATED_WEAPONS) {
      const spaced = w.replace(/-/g, ' ');
      const re = new RegExp('\\b' + spaced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      s = s.replace(re, w);
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  function buildMarketHashName({ productName, skinName, typeName, wearEN }) {
    const needsStar = STAR_TYPES.has(typeName);
    let name;

    if (skinName) {
      // productName = weapon + skin combined; skinName = just the skin
      const full   = decodePart(productName);
      const skin   = decodePart(skinName);
      let weapon   = full;
      if (full.toLowerCase().endsWith(' ' + skin.toLowerCase())) {
        weapon = full.slice(0, full.length - skin.length - 1);
      }
      name = `${needsStar ? '★ ' : ''}${weapon} | ${skin}`;
    } else {
      name = decodePart(productName);
    }

    if (wearEN && !name.includes('(')) {
      name = `${name} (${wearEN})`;
    }

    return name;
  }

  function wearFromClass(el) {
    if (!el) return null;
    for (const [cls, wear] of Object.entries(WEAR_CLASS_MAP)) {
      if (el.classList.contains(cls)) return wear;
    }
    return null;
  }

  function wearFromText(text) {
    return WEAR_TEXT_MAP[(text || '').toLowerCase().trim()] || null;
  }

  function paramsFromHref(href) {
    const q = href.indexOf('?');
    return q === -1 ? null : new URLSearchParams(href.slice(q + 1));
  }

  // ── Badge DOM ─────────────────────────────────────────────────────────────
  function buildBadge(compact = false) {
    const el = document.createElement('div');
    el.className = PRICE_BADGE_CLASS + (compact ? ' sbpc-compact' : '');
    el.innerHTML = `<span class="sbpc-loading">
      <span class="sbpc-dot"></span><span class="sbpc-dot"></span><span class="sbpc-dot"></span>
    </span>`;
    return el;
  }

  function fillBadge(badge, prices, marketHashName) {
    const cur = settings.currency;
    let html = '';

    if (settings.showCsfloat) {
      if (prices?.csfloat) {
        const p = convertPrice(prices.csfloat.price, prices.csfloat.currency);
        html += `<a class="sbpc-source sbpc-csfloat" href="${prices.csfloat.url}" target="_blank" rel="noopener" title="CSFloat — lowest buy-now">
                   <span class="sbpc-label">CSFloat</span>
                   <span class="sbpc-price">${formatPrice(p, cur)}</span>
                 </a>`;
      } else {
        html += `<span class="sbpc-source sbpc-csfloat sbpc-na">CSFloat <em>N/A</em></span>`;
      }
    }

    if (settings.showBuff) {
      const buffSearch = `https://buff.163.com/market/goods?search=${encodeURIComponent(marketHashName)}&game=csgo`;
      if (prices?.buff) {
        const p = convertPrice(prices.buff.price, prices.buff.currency);
        html += `<a class="sbpc-source sbpc-buff" href="${prices.buff.url || buffSearch}" target="_blank" rel="noopener" title="Buff163 — lowest listing">
                   <span class="sbpc-label">Buff</span>
                   <span class="sbpc-price">${formatPrice(p, cur)}</span>
                 </a>`;
      } else {
        html += `<a class="sbpc-source sbpc-buff sbpc-na" href="${buffSearch}" target="_blank" rel="noopener">Buff <em>N/A</em></a>`;
      }
    }

    badge.innerHTML = `<div class="sbpc-row">${html || '<span class="sbpc-error">No prices</span>'}</div>`;
  }

  function markError(badge, msg) {
    badge.innerHTML = `<span class="sbpc-error" title="${msg}">⚠ error</span>`;
  }

  function fetchAndFill(badge, marketHashName) {
    console.debug('[SBPC] Fetching:', marketHashName);
    chrome.runtime.sendMessage(
      { type: 'FETCH_PRICES', marketHashName, currency: settings.currency },
      resp => {
        if (chrome.runtime.lastError) { markError(badge, chrome.runtime.lastError.message); return; }
        if (!resp?.success)           { markError(badge, resp?.error || 'fetch failed'); return; }
        
        // Update exchange rates from background
        if (resp.rates) {
          exchangeRates = resp.rates;
        }
        
        fillBadge(badge, resp.prices, marketHashName);
      }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARD INJECTION — a.offer-card
  // ═══════════════════════════════════════════════════════════════════════════

  function processCard(card) {
    if (processed.has(card)) return;
    processed.add(card);
    if (!card.classList.contains('offer-card')) return;
    if (card.querySelector(`.${PRICE_BADGE_CLASS}`)) return;

    const params = paramsFromHref(card.getAttribute('href') || '');
    if (!params) return;

    const productName = params.get('productName');
    if (!productName) return;

    const skinName = params.get('skinName') || '';
    const typeName = params.get('typeName') || '';
    const wearEN   = wearFromText(card.querySelector('.exteriorName')?.textContent?.trim());

    const marketHashName = buildMarketHashName({ productName, skinName, typeName, wearEN });
    if (!marketHashName || marketHashName.length < 3) return;

    const badge = buildBadge(true);

    const priceWrapper = card.querySelector('.price-wrapper');
    if (priceWrapper) {
      priceWrapper.insertAdjacentElement('afterend', badge);
    } else {
      (card.querySelector('.price-info') || card).appendChild(badge);
    }

    fetchAndFill(badge, marketHashName);
  }

  function scanCards() {
    document.querySelectorAll('a.offer-card').forEach(processCard);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL INJECTION — .modal-inner-content
  //
  // Confirmed modal structure:
  //   .modal-inner-content
  //     .modal-header
  //       h1.modal-title                          ← French name (don't use)
  //       div.product-exterior.factory-new        ← wear via CSS class ✓
  //     .modal-body
  //       .modal-info-box.buy-box
  //         .product-price
  //           span.product-price-heading          ← "464,82 €" ← inject AFTER here
  //       a[href*="productName"][href*="skinName"] ← "Lien direct" with English params ✓
  // ═══════════════════════════════════════════════════════════════════════════

  const processedModals = new WeakSet();

  function processModal(modal) {
    if (processedModals.has(modal)) return;
    processedModals.add(modal);
    if (modal.querySelector(`.${PRICE_BADGE_CLASS}`)) return;

    // Find the "Lien direct" anchor which has all params in English
    const directLink = modal.querySelector('a[href*="productName"][href*="typeName"]');
    if (!directLink) {
      console.debug('[SBPC] Modal: direct link not found yet, retrying...');
      // Angular might still be rendering — retry once
      setTimeout(() => {
        const link = modal.querySelector('a[href*="productName"][href*="typeName"]');
        if (link && !modal.querySelector(`.${PRICE_BADGE_CLASS}`)) {
          processedModals.delete(modal);
          processModal(modal);
        }
      }, 500);
      return;
    }

    const params      = paramsFromHref(directLink.getAttribute('href') || '');
    const productName = params?.get('productName');
    if (!productName) return;

    const skinName = params.get('skinName') || '';
    const typeName = params.get('typeName') || '';

    // Wear from CSS class on .product-exterior — most reliable
    const exteriorEl = modal.querySelector('.product-exterior');
    const wearEN     = wearFromClass(exteriorEl);

    const marketHashName = buildMarketHashName({ productName, skinName, typeName, wearEN });
    console.debug('[SBPC] Modal:', marketHashName);

    const badge = buildBadge(false);

    // Inject after the price heading ("464,82 €")
    const priceHeading = modal.querySelector('.product-price-heading');
    if (priceHeading) {
      priceHeading.insertAdjacentElement('afterend', badge);
    } else {
      modal.querySelector('.product-price')?.appendChild(badge);
    }

    fetchAndFill(badge, marketHashName);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MUTATION OBSERVER
  // ═══════════════════════════════════════════════════════════════════════════

  let scanTimer = null;

  const observer = new MutationObserver(mutations => {
    let shouldScanCards = false;

    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;

        // Modal detection
        if (node.classList?.contains('modal-inner-content')) {
          setTimeout(() => processModal(node), 150);
        } else {
          const inner = node.querySelector?.('.modal-inner-content');
          if (inner) setTimeout(() => processModal(inner), 150);
        }

        shouldScanCards = true;
      }
    }

    if (shouldScanCards) {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scanCards, 350);
    }
  });

  async function init() {
    await loadSettings();
    scanCards();
    observer.observe(document.body, { childList: true, subtree: true });

    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(scanCards, 800);
      }
    }, 500);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SETTINGS_UPDATED') {
      Object.assign(settings, msg.settings);
      document.querySelectorAll(`.${PRICE_BADGE_CLASS}`).forEach(el => el.remove());
      scanCards();
      document.querySelectorAll('.modal-inner-content').forEach(m => {
        processedModals.delete(m);
        processModal(m);
      });
    }
  });

  init();
})();
