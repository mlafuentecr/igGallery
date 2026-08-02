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
      const controls = node.querySelectorAll('button').length;
      // A complete list card contains one profile picture plus identity and a
      // Follow/Following control. The small avatar button also meets many size
      // tests, so require the actual action control before selecting the card.
      if (box.width > 180 && profiles === 1 && controls >= 1 && node.children.length >= 3 && node.children.length <= 5) return node;
    }
    return null;
  };

  const findGridContainer = (rows, dialog) => {
    const rowSet = new Set(rows);
    for (const row of rows) {
      let node = row.parentElement;
      // Recent Instagram builds add several wrapper nodes between each profile
      // entry and the list itself. Search far enough to reach the element whose
      // direct children are the individual profile entries, without relying on
      // Instagram's unstable class names.
      for (let depth = 0; node && node !== dialog && depth < 14; depth += 1, node = node.parentElement) {
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
      // Small, single-child flex wrappers sit inside the current Instagram
      // modal. The actual panel contains the header, search and profile list.
      if (getComputedStyle(panel).display === 'flex' && panel.children.length >= 3) break;
    }
    if (!panel || panel === dialog) return;
    panel.classList.toggle('ig-following-modal-panel', enabled);
    // Instagram caps several unnamed ancestors of the visible panel at a
    // short height. Mark that shell too so the list can use the tall layout.
    for (let shell = panel; shell && shell !== dialog; shell = shell.parentElement) {
      shell.classList.toggle('ig-following-modal-shell', enabled);
    }
    let node = grid.parentElement;
    for (let depth = 0; node && node !== panel; depth += 1, node = node.parentElement) {
      const overflow = getComputedStyle(node).overflow;
      if (overflow.includes('auto') || overflow.includes('scroll')) {
        node.classList.toggle('ig-following-scroll-area', enabled);
      }
    }
  };

  // Restore only the list the user can actually see. Saving every nested
  // scroll position fights Instagram's virtualized loader at the bottom.
  const captureScrollState = (dialog) => {
    const list = getScrollableList(dialog);
    return {
      pageY: window.scrollY,
      list,
      top: list?.scrollTop || 0,
      left: list?.scrollLeft || 0
    };
  };

  const restoreScrollState = (state) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top: state.pageY, left: 0, behavior: 'auto' });
      if (state.list?.isConnected) state.list.scrollTo({ top: state.top, left: state.left, behavior: 'auto' });
    }));
  };

  const getScrollableList = (dialog) => {
    const isScrollable = (node) => node.scrollHeight > node.clientHeight + 8;
    const isVisibleList = (node) => {
      const box = node.getBoundingClientRect();
      return box.width > 200 && box.height > 100 && box.bottom > 0 && box.top < window.innerHeight;
    };
    // The content script marks Instagram's actual profile-list scroller while
    // styling the dialog. Prefer that explicit marker: Following currently
    // exposes additional scrollable wrappers whose movement is not visible.
    const marked = [...dialog.querySelectorAll('.ig-following-scroll-area')]
      .filter(isScrollable)
      .filter(isVisibleList);
    if (marked.length) {
      return marked.sort((a, b) => b.clientHeight - a.clientHeight)[0];
    }
    // In the current Instagram layout the visible scrollbar belongs to the
    // modal panel. A nested scroll area exists too, but moving it has no
    // visible effect, so prefer the panel explicitly.
    const panel = dialog.querySelector('.ig-following-modal-panel');
    if (panel && isScrollable(panel)) return panel;
    const visible = [...dialog.querySelectorAll('*')]
      .filter(isScrollable)
      .filter(isVisibleList);
    return visible.sort((a, b) => b.clientHeight - a.clientHeight)[0] || null;
  };

  const stopAutoScroll = () => {
    clearInterval(autoScrollTimer);
    autoScrollTimer = undefined;
  };

  const startAutoScroll = () => {
    // Settings changes reuse this function. Explicitly cancel an existing
    // interval when Auto-scroll is turned off instead of leaving it running.
    if (!settings.enabled || !settings.autoScroll) {
      stopAutoScroll();
      return;
    }
    if (autoScrollTimer) return;
    autoScrollTimer = setInterval(() => {
      const dialog = getDialogs().find(isFollowingDialog);
      const list = dialog && getScrollableList(dialog);
      // A closed list should not leave a background timer behind. Opening a
      // new Following/Followers dialog adds DOM nodes and starts it again.
      if (!list) {
        stopAutoScroll();
        return;
      }
      const remaining = list.scrollHeight - list.clientHeight - list.scrollTop;
      if (remaining < 8) {
        // Instagram can take several seconds to append the next virtualized
        // page. Keep the timer alive at the edge so a delayed response is
        // picked up instead of leaving auto-scroll permanently paused.
        list.scrollBy({ top: 1, behavior: 'auto' });
        return;
      }
      list.scrollBy({ top: Math.max(120, Math.round(list.clientHeight * 0.55)), behavior: 'smooth' });
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
      // During auto-scroll, Instagram owns the current position while it
      // appends a new virtualized page. Restoring it here causes flashing.
      if (!autoScrollTimer) restoreScrollState(scrollState);
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
      // Stop synchronously on a toggle. Waiting for the next animation frame
      // allowed the previous interval to keep moving an already-disabled view.
      if (changes.enabled?.newValue === false || changes.autoScroll?.newValue === false) {
        stopAutoScroll();
      }
      schedule();
    });
  } catch {
    // The extension still works with its default 88 px size.
  }

  new MutationObserver((mutations) => {
    // Ignore removals produced by Instagram's virtual list. New profile nodes
    // are the only mutations that require applying the card styling again.
    if (mutations.some((mutation) => mutation.addedNodes.length > 0)) schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
})();
