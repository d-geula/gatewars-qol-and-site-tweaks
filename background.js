const DEFAULT_CONFIG = {
  enableRefererOverride: true,
  refererOverrideUrl: 'https://main.gatewa.rs/base.php?game=gatewars',
  scannerSoundEnabled: true,
  scannerSoundVolume: 60
};

let config = { ...DEFAULT_CONFIG };
const SCANNER_ALERT_SOUND_URL = browser.runtime.getURL('sounds/pop-alert.ogg');
const SCANNER_COMPLETE_SOUND_URL = browser.runtime.getURL('sounds/long-pop.ogg');

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

function playScannerAlert(soundUrl) {
  if (!config.scannerSoundEnabled) {
    return;
  }
  const volume = Math.min(
    1,
    Math.max(0, (Number.isFinite(config.scannerSoundVolume) ? config.scannerSoundVolume : 60) / 100)
  );
  if (volume === 0) {
    return;
  }
  try {
    const audio = new Audio(soundUrl);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {
    // Ignore audio errors in background context.
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'getTabId') {
    return Promise.resolve({ tabId: sender?.tab?.id ?? null });
  }
  if (message?.type !== 'scannerStatus') {
    return;
  }
  if (message.status === 'found') {
    playScannerAlert(SCANNER_ALERT_SOUND_URL);
  } else if (message.status === 'complete') {
    playScannerAlert(SCANNER_COMPLETE_SOUND_URL);
  }
});
