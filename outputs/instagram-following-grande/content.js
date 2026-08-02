(() => {
  const REFRESH_KEY = '__followingGrandeRefreshV4';
  if (globalThis[REFRESH_KEY]) {
    globalThis[REFRESH_KEY]();
    return;
  }

  const ROOT_STYLE = document.documentElement.style;
  const DEFAULTS = { enabled: true, layout: 'two', size: 280, autoScroll: false, settingsVersion: 5 };
  const LAYOUTS = {
    two: { columns: 2, suggestedSize: 280 },
    three: { columns: 3, suggestedSize: 190 }
  };
  let settings = { ...DEFAULTS };
  let queued = false;
  let autoScrollTimer;
  let autoScrollIdleTicks = 0;

  const getDialogs = () => [...document.querySelectorAll('[role="dialog"]')];
  const PAGE_POSITION_KEY = `ig-following-grande:scroll:${location.pathname}`;

  // Instagram's class names are intentionally unstable.  The dialog text is a
  // more durable signal than an internal class name.
  const isFollowingDialog = (dialog) => {
    const text = (dialog.innerText || '').trim();
    return /(^|\n)(Following|Siguiendo|Followers|Seguidores)(\n|$)/i.test(text);
  };

  const findAvatarWrapper = (image, dialog) => {
    let node = image.parentElement;
    for (let depth = 0; node && node !== dialog && depth < 7; depth += 1, node = node.parentElement) {
      const box = node.getBoundingClientRect();
      // Profile avatars in the list are small, square containers.  Keeping the
      // range narrow prevents profile thumbnails or page artwork from matching.
      if (box.width >= 20 && box.width <= 400 && Math.abs(box.width - box.height) <= 8) return node;
    }
    return null;
  };

  const findRow = (wrapper, dialog) => {
    let node = wrapper.parentElement;
    for (let depth = 0; node && node !== dialog && depth < 10; depth += 1, node = node.parentElement) {
      const box = node.getBoundingClientRect();
      const profiles = node.querySelectorAll("img[alt*='profile picture']").length;
      // A list card has one profile picture and its three visible parts:
      // photo, identity and follow control. Unlike its size, that structure
      // stays stable when a previous layout has already enlarged the photo.
      if (box.width > 180 && profiles === 1 && node.children.length >= 2 && node.children.length <= 5) return node;
    }
    return null;
  };

  const findGridContainer = (rows, dialog) => {
    const rowSet = new Set(rows);
    for (const row of rows) {
      let node = row.parentElement;
      for (let depth = 0; node && node !== dialog && depth < 6; depth += 1, node = node.parentElement) {
        const matchingChildren = [...node.children].filter((child) =>
          child === row || [...rowSet].some((candidate) => child.contains(candidate))
        );
        if (matchingChildren.length >= 3) return node;
      }
    }
    return null;
  };

  const markModalPanel = (grid, dialog, enabled) => {
    if (!grid) return;
    let panel = grid.parentElement;
    for (let depth = 0; panel && panel !== dialog && depth < 8; depth += 1, panel = panel.parentElement) {
      if (getComputedStyle(panel).display === 'flex') break;
    }
    if (!panel || panel === dialog) return;
    panel.classList.toggle('ig-following-modal-panel', enabled);
    let node = grid.parentElement;
    for (let depth = 0; node && node !== panel; depth += 1, node = node.parentElement) {
      const overflow = getComputedStyle(node).overflow;
      if (overflow.includes('auto') || overflow.includes('scroll')) {
        node.classList.toggle('ig-following-scroll-area', enabled);
      }
    }
  };

  const captureScrollState = (dialog) => ({
    pageY: window.scrollY,
    areas: [...dialog.querySelectorAll('*')]
      .filter((node) => node.scrollHeight > node.clientHeight)
      .map((node) => ({ node, top: node.scrollTop, left: node.scrollLeft }))
  });

  const restoreScrollState = (state) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: state.pageY, left: 0, behavior: 'auto' });
      for (const area of state.areas) {
        if (area.node.isConnected) area.node.scrollTo({ top: area.top, left: area.left, behavior: 'auto' });
      }
    }));
  };

  const getScrollableList = (dialog) => {
    const isScrollable = (node) => node.scrollHeight > node.clientHeight + 8;
    const marked = [...dialog.querySelectorAll('.ig-following-scroll-area')].filter(isScrollable);
    if (marked.length) return marked[0];
    return [...dialog.querySelectorAll('*')].find(isScrollable) || null;
  };

  const stopAutoScroll = () => {
    clearInterval(autoScrollTimer);
    autoScrollTimer = undefined;
    autoScrollIdleTicks = 0;
  };

  const startAutoScroll = () => {
    stopAutoScroll();
    if (!settings.enabled || !settings.autoScroll) return;
    autoScrollTimer = setInterval(() => {
      const dialog = getDialogs().find(isFollowingDialog);
      const list = dialog && getScrollableList(dialog);
      if (!list) return;
      const remaining = list.scrollHeight - list.clientHeight - list.scrollTop;
      list.scrollBy({ top: Math.max(120, Math.round(list.clientHeight * 0.55)), behavior: 'smooth' });
      autoScrollIdleTicks = remaining < 8 ? autoScrollIdleTicks + 1 : 0;
      // Pause after a few end-of-list passes. A mutation caused by Instagram
      // loading another page automatically restarts the timer.
      if (autoScrollIdleTicks >= 4) stopAutoScroll();
    }, 900);
  };

  const enlarge = () => {
    queued = false;
    const layout = LAYOUTS[settings.layout] || LAYOUTS.two;
    ROOT_STYLE.setProperty('--ig-following-avatar-size', `${settings.size}px`);
    ROOT_STYLE.setProperty('--ig-following-columns', String(layout.columns));
    for (const dialog of getDialogs()) {
      if (!isFollowingDialog(dialog)) continue;
      const scrollState = captureScrollState(dialog);
      dialog.classList.toggle('ig-following-large-dialog', settings.enabled);
      const rows = [];
      for (const image of dialog.querySelectorAll('img')) {
        const wrapper = findAvatarWrapper(image, dialog);
        if (!wrapper) continue;
        image.classList.toggle('ig-following-large-avatar', settings.enabled);
        wrapper.classList.toggle('ig-following-large-avatar-wrapper', settings.enabled);
        const row = findRow(wrapper, dialog);
        row?.classList.toggle('ig-following-large-row', settings.enabled);
        if (row) rows.push(row);
      }
      const grid = findGridContainer([...new Set(rows)], dialog);
      grid?.classList.toggle('ig-following-grid', settings.enabled);
      markModalPanel(grid, dialog, settings.enabled);
      if (grid) {
        for (const child of grid.children) {
          const hasProfile = child.querySelector("img[alt*='profile picture']");
          child.classList.toggle('ig-following-grid-item', settings.enabled && Boolean(hasProfile));
        }
      }
      for (const row of new Set(rows)) row.classList.toggle('ig-following-card', settings.enabled);
      restoreScrollState(scrollState);
    }
    startAutoScroll();
  };

  const schedule = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(enlarge);
    }
  };

  globalThis[REFRESH_KEY] = schedule;

  window.addEventListener('pagehide', () => {
    sessionStorage.setItem(PAGE_POSITION_KEY, String(window.scrollY));
  });

  const savedPageY = Number(sessionStorage.getItem(PAGE_POSITION_KEY));
  if (Number.isFinite(savedPageY) && savedPageY > 0) {
    setTimeout(() => window.scrollTo({ top: savedPageY, left: 0, behavior: 'auto' }), 700);
  }

  // Apply the default immediately.  Settings are intentionally optional: a
  // temporary storage failure must never prevent the visual change itself.
  schedule();

  try {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      if (stored.settingsVersion !== 5) {
        stored.size = (LAYOUTS[stored.layout] || LAYOUTS.two).suggestedSize;
        stored.autoScroll = false;
        stored.settingsVersion = 5;
        chrome.storage.sync.set({ size: stored.size, autoScroll: false, settingsVersion: 5 });
      }
      settings = { ...DEFAULTS, ...stored };
      schedule();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      for (const [key, change] of Object.entries(changes)) settings[key] = change.newValue;
      schedule();
    });
  } catch {
    // The extension still works with its default 88 px size.
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
})();
