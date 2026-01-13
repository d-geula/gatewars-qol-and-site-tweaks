const DEFAULT_CONFIG = {
  threshold: 500000,
  armySizeThreshold: 0,
  hideInactive: true,
  enableTreasuryFilter: true,
  enableArmySizeFilter: false,
  enableAllianceFilter: false,
  allianceBlacklist: []
};

async function loadSettings() {
  const result = await browser.storage.local.get('config');
  const config = { ...DEFAULT_CONFIG, ...result.config };

  document.getElementById('threshold').value = config.threshold;
  document.getElementById('armySizeThreshold').value = config.armySizeThreshold;
  document.getElementById('hideInactive').checked = config.hideInactive;
  document.getElementById('enableTreasuryFilter').checked = config.enableTreasuryFilter;
  document.getElementById('enableArmySizeFilter').checked = config.enableArmySizeFilter;
  document.getElementById('enableAllianceFilter').checked = config.enableAllianceFilter;
  document.getElementById('allianceBlacklist').value = (config.allianceBlacklist || []).join('\n');
}

async function saveSettings() {
  const blacklistText = document.getElementById('allianceBlacklist').value.trim();
  const config = {
    threshold: parseInt(document.getElementById('threshold').value, 10) || 0,
    armySizeThreshold: parseInt(document.getElementById('armySizeThreshold').value, 10) || 0,
    hideInactive: document.getElementById('hideInactive').checked,
    enableTreasuryFilter: document.getElementById('enableTreasuryFilter').checked,
    enableArmySizeFilter: document.getElementById('enableArmySizeFilter').checked,
    enableAllianceFilter: document.getElementById('enableAllianceFilter').checked,
    allianceBlacklist: blacklistText ? blacklistText.split('\n').map(s => s.trim()).filter(Boolean) : []
  };

  await browser.storage.local.set({ config });

  const msg = document.getElementById('savedMsg');
  msg.style.display = 'block';
  setTimeout(() => msg.style.display = 'none', 1500);
}

document.getElementById('save').addEventListener('click', saveSettings);
loadSettings();

// ─── Scanner ───────────────────────────────────────────────────────────────

function showScannerMsg(text, isSuccess = true) {
  const msg = document.getElementById('scannerMsg');
  msg.textContent = text;
  msg.style.display = 'block';
  msg.style.color = isSuccess ? '#4caf50' : '#f44336';
}

function setScannerRunning(running) {
  document.getElementById('startScanner').style.display = running ? 'none' : 'block';
  document.getElementById('stopScanner').style.display = running ? 'block' : 'none';
}

async function startScanner() {
  const startPage = parseInt(document.getElementById('startPage').value, 10);
  const endPage = parseInt(document.getElementById('endPage').value, 10);

  if (!startPage || !endPage || startPage < 1 || endPage > 2000 || startPage > endPage) {
    showScannerMsg('Invalid page range!', false);
    return;
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0) {
    showScannerMsg('No active tab!', false);
    return;
  }

  const url = (tabs[0].url || '').toLowerCase();
  if (!url.includes('gatewa.rs') || !url.includes('battlefield')) {
    showScannerMsg(`Not on battlefield page! (${url.substring(0, 40)}...)`, false);
    return;
  }

  await browser.storage.local.set({
    scannerState: { active: true, startPage, endPage, currentPage: startPage }
  });

  setScannerRunning(true);
  showScannerMsg(`Starting scan: pages ${startPage}-${endPage}...`);

  try {
    await browser.tabs.sendMessage(tabs[0].id, { action: 'startScanner', startPage, endPage });
  } catch (error) {
    showScannerMsg(`Error: ${error.message}`, false);
  }
}

async function stopScanner() {
  await browser.storage.local.remove('scannerState');
  setScannerRunning(false);
  showScannerMsg('Scanner stopped.');

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    try {
      await browser.tabs.sendMessage(tabs[0].id, { action: 'stopScanner' });
    } catch { /* content script may not be loaded */ }
  }
}

async function checkScannerState() {
  const result = await browser.storage.local.get('scannerState');
  if (result.scannerState?.active) {
    setScannerRunning(true);
    document.getElementById('startPage').value = result.scannerState.startPage;
    document.getElementById('endPage').value = result.scannerState.endPage;
    showScannerMsg(`Scanning page ${result.scannerState.currentPage}...`);
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type !== 'scannerStatus') return;
  
  if (message.status === 'found') {
    showScannerMsg(`✓ Match found on page ${message.page}!`);
    setScannerRunning(false);
  } else if (message.status === 'complete') {
    showScannerMsg('Scan complete. No matches in range.');
    setScannerRunning(false);
  } else if (message.status === 'scanning') {
    showScannerMsg(`Scanning page ${message.page}...`);
  } else if (message.status === 'error') {
    showScannerMsg(`Error: ${message.message}`, false);
  }
});

document.getElementById('startScanner').addEventListener('click', startScanner);
document.getElementById('stopScanner').addEventListener('click', stopScanner);
checkScannerState();