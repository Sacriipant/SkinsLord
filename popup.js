// popup.js

const $ = id => document.getElementById(id);

// Load saved settings into UI
chrome.storage.sync.get(
  ['currency', 'showCsfloat', 'showBuff', 'pricempireKey'],
  data => {
    $('currency').value       = data.currency      ?? 'EUR';
    $('showCsfloat').checked  = data.showCsfloat   ?? true;
    $('showBuff').checked     = data.showBuff       ?? true;
    $('pricempireKey').value  = data.pricempireKey ?? '';
  }
);

$('saveBtn').addEventListener('click', () => {
  const newSettings = {
    currency:      $('currency').value,
    showCsfloat:   $('showCsfloat').checked,
    showBuff:      $('showBuff').checked,
    pricempireKey: $('pricempireKey').value.trim()
  };

  chrome.storage.sync.set(newSettings, () => {
    // Notify content scripts on all SkinBaron tabs
    chrome.tabs.query({ url: ['https://skinbaron.de/*', 'https://www.skinbaron.de/*'] }, tabs => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SETTINGS_UPDATED',
          settings: newSettings
        }).catch(() => {}); // tab might not have content script yet
      });
    });

    // Show confirmation
    const status = $('status');
    status.textContent = '✓ Saved!';
    status.style.opacity = '1';
    setTimeout(() => { status.style.opacity = '0'; }, 2000);
  });
});
