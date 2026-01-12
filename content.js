(async function () {
  const DEFAULT_CONFIG = {
    threshold: 500000,
    armySizeThreshold: 0,
    hideInactive: true,
    enableTreasuryFilter: true,
    enableArmySizeFilter: false
  };

  async function getConfig() {
    try {
      const result = await browser.storage.local.get('config');
      return { ...DEFAULT_CONFIG, ...result.config };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  function parseReversedValue(text) {
    const cleaned = text.replace(/,/g, '');
    const reversed = cleaned.split('').reverse().join('');
    return parseInt(reversed, 10);
  }

  function filterRows(config) {
    const rows = document.querySelectorAll(
      'div > div > main > div:first-child > div > table:first-of-type > tbody > tr'
    );

    let hiddenCount = 0;
    let shownCount = 0;

    rows.forEach((row) => {
      row.style.display = '';

      let shouldHide = false;

      // Check for inactive player (empty #actions)
      if (config.hideInactive) {
        const actions = row.querySelector('#actions');
        if (actions && actions.children.length === 0) {
          shouldHide = true;
        }
      }

      // Check treasury value - it's inside td button x
      if (!shouldHide && config.enableTreasuryFilter) {
        const treasuryElement = row.querySelector('td:nth-child(6) button x');
        
        if (treasuryElement) {
          const text = treasuryElement.textContent.trim();
          
          // Hide rows with question marks (unknown values)
          if (/^\?+$/.test(text)) {
            shouldHide = true;
          } else {
            const actualValue = parseReversedValue(text);

            if (!isNaN(actualValue) && actualValue < config.threshold) {
              shouldHide = true;
            }
          }
        }
      }

      // Check army size - it's inside td[4] button x (also reversed)
      if (!shouldHide && config.enableArmySizeFilter) {
        const armySizeElement = row.querySelector('td:nth-child(4) button x');
        
        if (armySizeElement) {
          const text = armySizeElement.textContent.trim();
          
          // Hide rows with question marks (unknown values)
          if (/^\?+$/.test(text)) {
            shouldHide = true;
          } else {
            const actualValue = parseReversedValue(text);

            if (!isNaN(actualValue) && actualValue < config.armySizeThreshold) {
              shouldHide = true;
            }
          }
        }
      }

      if (shouldHide) {
        row.style.display = 'none';
        hiddenCount++;
      } else {
        shownCount++;
      }
    });

    const activeFilters = [];
    if (config.hideInactive) activeFilters.push('inactive');
    if (config.enableTreasuryFilter) activeFilters.push(`treasury<${config.threshold.toLocaleString()}`);
    if (config.enableArmySizeFilter) activeFilters.push(`army<${config.armySizeThreshold.toLocaleString()}`);
    
    console.log(
      `[Battlefield Filter] Showing ${shownCount}, hidden ${hiddenCount} ` +
      `(filters: ${activeFilters.join(', ') || 'none'})`
    );
  }

  // Listen for config changes from popup
  browser.storage.onChanged.addListener((changes) => {
    if (changes.config) {
      filterRows(changes.config.newValue);
    }
  });

  // Initial run
  const config = await getConfig();
  setTimeout(() => filterRows(config), 500);

  // Re-run on DOM changes
  const observer = new MutationObserver(async () => {
    const config = await getConfig();
    filterRows(config);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();