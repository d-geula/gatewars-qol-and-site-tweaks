const DEFAULT_CONFIG = {
  threshold: 500000,
  armySizeThreshold: 0,
  hideInactive: true,
  enableTreasuryFilter: true,
  enableArmySizeFilter: false,
  enableAllianceFilter: false,
  allianceBlacklist: [],
  hideNoAttackAction: false,
  enableRefererOverride: true,
  refererOverrideUrl: 'https://main.gatewa.rs/base.php?game=gatewars'
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
  document.getElementById('hideNoAttackAction').checked = config.hideNoAttackAction ?? false;
  document.getElementById('enableRefererOverride').checked = config.enableRefererOverride ?? true;
  document.getElementById('refererOverrideUrl').value =
    config.refererOverrideUrl || DEFAULT_CONFIG.refererOverrideUrl;
}

async function saveSettings(showMessage = true) {
  const blacklistText = document.getElementById('allianceBlacklist').value.trim();
  const config = {
    threshold: parseInt(document.getElementById('threshold').value, 10) || 0,
    armySizeThreshold: parseInt(document.getElementById('armySizeThreshold').value, 10) || 0,
    hideInactive: document.getElementById('hideInactive').checked,
    enableTreasuryFilter: document.getElementById('enableTreasuryFilter').checked,
    enableArmySizeFilter: document.getElementById('enableArmySizeFilter').checked,
    enableAllianceFilter: document.getElementById('enableAllianceFilter').checked,
    allianceBlacklist: blacklistText ? blacklistText.split('\n').map(s => s.trim()).filter(Boolean) : [],
    hideNoAttackAction: document.getElementById('hideNoAttackAction').checked,
    enableRefererOverride: document.getElementById('enableRefererOverride').checked,
    refererOverrideUrl: document.getElementById('refererOverrideUrl').value.trim()
  };

  await browser.storage.local.set({ config });

  if (showMessage) {
    const msg = document.getElementById('savedMsg');
    msg.style.display = 'block';
    setTimeout(() => msg.style.display = 'none', 1500);
  }
}

// Auto-apply filters on checkbox changes
document.getElementById('enableTreasuryFilter').addEventListener('change', () => saveSettings(false));
document.getElementById('enableArmySizeFilter').addEventListener('change', () => saveSettings(false));
document.getElementById('hideNoAttackAction').addEventListener('change', () => saveSettings(false));
document.getElementById('enableAllianceFilter').addEventListener('change', () => saveSettings(false));
document.getElementById('hideInactive').addEventListener('change', () => saveSettings(false));
document.getElementById('enableRefererOverride').addEventListener('change', () => saveSettings(false));

// Auto-apply filters on number input changes (numeric stepper) and Enter key
function setupNumberInputAutoApply(inputId) {
  const input = document.getElementById(inputId);
  input.addEventListener('change', () => saveSettings(false));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveSettings(false);
    }
  });
}

setupNumberInputAutoApply('threshold');
setupNumberInputAutoApply('armySizeThreshold');

// Auto-apply referer URL on Enter key
document.getElementById('refererOverrideUrl').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveSettings(false);
  }
});

// Keep "Apply Filter" button as fallback
document.getElementById('save').addEventListener('click', () => saveSettings(true));
loadSettings();

function initTabs() {
  const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
  const panes = {
    filters: document.getElementById('tab-filters'),
    settings: document.getElementById('tab-settings')
  };

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      tabButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
      Object.entries(panes).forEach(([key, pane]) => {
        pane.classList.toggle('active', key === tab);
      });
    });
  });
}

initTabs();

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

  // Save page numbers for persistence
  await saveScannerPages();

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

async function loadScannerPages() {
  // Don't overwrite if scanner is running
  const scannerResult = await browser.storage.local.get('scannerState');
  if (scannerResult.scannerState?.active) {
    return;
  }

  const result = await browser.storage.local.get('scannerPages');
  if (result.scannerPages?.endPage) {
    document.getElementById('endPage').value = result.scannerPages.endPage;
  }
}

async function saveScannerPages() {
  const endPage = parseInt(document.getElementById('endPage').value, 10);
  await browser.storage.local.set({
    scannerPages: { endPage: endPage || null }
  });
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

async function populateCurrentPage() {
  // Don't overwrite if scanner is running
  const result = await browser.storage.local.get('scannerState');
  if (result.scannerState?.active) {
    return;
  }

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;

    const url = tabs[0].url || '';
    if (!url.includes('gatewa.rs') || !url.includes('battlefield')) {
      return;
    }

    // Extract page number from URL (same logic as content.js)
    const match = url.match(/[?&]page=(\d+)/);
    const currentPage = match ? parseInt(match[1], 10) : 1;
    
    // Set start page to next page (current + 1) since we're already on current page
    document.getElementById('startPage').value = currentPage + 1;
  } catch (error) {
    // Silently fail - not critical
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
document.getElementById('endPage').addEventListener('change', saveScannerPages);

// Start scanner on Enter key in page number inputs
document.getElementById('startPage').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    startScanner();
  }
});
document.getElementById('endPage').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    startScanner();
  }
});

checkScannerState();
loadScannerPages();
populateCurrentPage();