const DEFAULT_CONFIG = {
  enableRefererOverride: true,
  refererOverrideUrl: 'https://main.gatewa.rs/base.php?game=gatewars'
};

let config = { ...DEFAULT_CONFIG };

async function loadConfig() {
  try {
    const result = await browser.storage.local.get('config');
    config = { ...DEFAULT_CONFIG, ...(result.config || {}) };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
}

function setRefererHeader(headers, value) {
  const existing = headers.find(
    (header) => header.name.toLowerCase() === 'referer'
  );

  if (existing) {
    existing.value = value;
  } else {
    headers.push({ name: 'Referer', value });
  }

  return headers;
}

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!config.enableRefererOverride) {
      return {};
    }

    const refererValue =
      (config.refererOverrideUrl || '').trim() || DEFAULT_CONFIG.refererOverrideUrl;
    if (!refererValue) {
      return {};
    }

    const headers = details.requestHeaders || [];
    return { requestHeaders: setRefererHeader(headers, refererValue) };
  },
  {
    urls: ['*://main.gatewa.rs/battlefield.php*', '*://main.gatewa.rs/battlefieldE.php*'],
    types: ['main_frame']
  },
  ['blocking', 'requestHeaders']
);

browser.storage.onChanged.addListener((changes) => {
  if (changes.config) {
    config = { ...DEFAULT_CONFIG, ...(changes.config.newValue || {}) };
  }
});

loadConfig();
