# SkinsLord

Chrome extension by **Sacripant** that displays **CSFloat** and **Buff163** prices directly on SkinBaron listings and item modals.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)

## ✨ Features

- 🔥 **Real-time CSFloat prices** — fetches lowest buy-now listings from CSFloat API
- 💰 **Buff163 prices** — community price data (hourly updates) or live via Pricempire API
- 📊 **Dual injection** — prices appear on both:
  - Browse page item cards (compact badges)
  - Item detail modal popups (full-size badges)
- 🌍 **Multi-currency** — display in EUR, USD, GBP, or CNY
- ⚡ **Smart caching** — 5-minute cache prevents API rate limits
- 🎯 **Accurate name matching** — handles knives (★), gloves, French wear names, hyphenated weapons
- 🔧 **Settings popup** — toggle sources, pick currency, add Pricempire API key

## 📦 Installation

### Method 1: Load Unpacked (Development)

1. **Download** the extension:
   ```bash
   git clone <your-repo-url>
   cd skinslord
   ```

2. **Open Chrome Extensions**:
   - Go to `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle)

3. **Load the extension**:
   - Click **Load unpacked**
   - Select the `skinslord` folder

4. **Done!** The extension icon should appear in your toolbar.

### Method 2: From ZIP

1. Download `skinslord.zip`
2. Unzip it
3. Follow steps 2-4 above

## 🚀 Usage

1. **Browse SkinBaron** — prices appear automatically under each item card
2. **Click any item** — prices also show in the modal popup
3. **Click a price badge** — opens that marketplace (CSFloat or Buff163)

### Settings

Click the extension icon in your toolbar to configure:

- **Price Sources** — toggle CSFloat/Buff on or off
- **Display Currency** — EUR, USD, GBP, or CNY
- **Pricempire API Key** (optional) — for live Buff prices instead of hourly snapshots
  - Get a free key at [pricempire.com](https://pricempire.com)
  - Without a key, the extension uses community price data updated hourly

## 🏗️ How It Works

### Card Injection
- Detects `<a class="offer-card">` elements on browse pages
- Extracts item info from the `href` URL params:
  - `productName` — item name (e.g. `Talon-Knife-Tiger-Tooth`)
  - `skinName` — skin part (e.g. `Tiger-Tooth`)
  - `typeName` — category (`Knife`, `Rifle`, `Container`, etc.)
- Reconstructs the Steam market hash name:
  - Decodes URL encoding (`%7C` → `|`)
  - Restores hyphenated weapon names (`AK 47` → `AK-47`)
  - Adds `★` prefix for knives/gloves
  - Appends wear in English (mapped from French `.exteriorName` text)
- Injects price badge after `.price-wrapper`

### Modal Injection
- Watches for `.modal-inner-content` appearing in DOM
- Finds the "Lien direct" (direct link) which has complete English params
- Gets wear from CSS class on `.product-exterior` (most reliable):
  - `factory-new` → Factory New
  - `minimal-wear` → Minimal Wear
  - `field-tested` → Field-Tested
  - `well-worn` → Well-Worn
  - `battle-scarred` → Battle-Scarred
- Injects badge after `.product-price-heading`

### Price Fetching
1. **CSFloat API**:
   ```
   GET https://csfloat.com/api/v1/listings?market_hash_name=...&limit=5&sort_by=lowest_price&type=buy_now
   ```
   Returns lowest 5 listings; extension shows the cheapest.

2. **Buff163** (two methods):
   - **Community prices** (default): `https://prices.csgotrader.app/latest/buff163.json` — updated hourly
   - **Live prices** (with Pricempire key): `https://api.pricempire.com/v3/items/prices?api_key=...&market_hash_name=...&sources=buff163`

3. **Caching**: Results cached for 5 minutes in the service worker to avoid rate limits.

## 🔧 Project Structure

```
skinslord/
├── manifest.json       # Extension manifest (v3)
├── background.js       # Service worker (API calls, caching)
├── content.js          # DOM injection (cards + modal)
├── styles.css          # Badge styling
├── popup.html          # Settings UI
├── popup.js            # Settings logic
└── icons/              # Extension icons
    ├── icon16.png
    ├── icon48.png
    ├── icon128.png
    └── csfloat.png
```

## 🐛 Troubleshooting

### Prices show as N/A

**CSFloat N/A**:
- Item might not be listed on CSFloat currently
- Check browser console for errors (`F12` → Console)

**Buff N/A**:
- Without a Pricempire key, prices come from community data (might be missing for rare items)
- Add a free Pricempire API key in settings for live Buff prices
- Verify your API key is correct

### Prices not appearing at all

1. **Check selectors** — SkinBaron might have updated their DOM:
   - Open DevTools (`F12`)
   - Inspect an item card
   - Verify these selectors in `content.js`:
     - Card: `a.offer-card`
     - Price wrapper: `.price-wrapper`
     - Direct link in modal: `a[href*="productName"]`
   - Update selectors if needed

2. **Check console** — look for `[SBPC]` debug logs
3. **Reload extension** — go to `chrome://extensions/` and hit refresh

### Wrong prices / wrong item matched

The market hash name reconstruction might be incorrect:
- Check console: `[SBPC] Fetching: <market hash name>`
- For knives, name should start with `★`
- For weapons, should have ` | ` separator
- Wear should be in English with parentheses: `(Factory New)`

If the name is wrong, report the item URL as an issue!

## 🛠️ Development

### Testing Changes

```bash
# Edit code
vim content.js

# Reload extension in Chrome
# chrome://extensions/ → Click refresh icon on your extension

# Hard refresh SkinBaron
# Ctrl+Shift+R or Cmd+Shift+R
```

### Adding New Features

- **More price sources**: Add to `background.js` → `fetchPrices()`
- **Different injection points**: Edit `content.js` → `processCard()` / `processModal()`
- **Styling**: Edit `styles.css`

### Debug Mode

Open browser console on SkinBaron:
```javascript
// All debug logs prefixed with [SBPC]
// Look for name extraction and API responses
```

## 📝 Known Limitations

- **CORS**: Background service worker needs `host_permissions` for CSFloat/Buff APIs
- **Rate limits**: CSFloat API is rate-limited; caching mitigates this
- **Name matching**: Some obscure items might have incorrect market hash names — report them!
- **SPA navigation**: Uses `setInterval` to detect route changes (Angular doesn't fire navigation events)

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

MIT License - feel free to use, modify, and distribute.

## 🙏 Acknowledgments

- **Sacripant** — creator and developer
- **CSFloat** for their public API
- **CSGOTrader** for community Buff price data
- **Pricempire** for their price aggregation API

---

**SkinsLord** is not affiliated with or endorsed by SkinBaron, CSFloat, or Buff163.
