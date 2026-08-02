// Apply updates to Instagram tabs immediately after the extension is reloaded.
// This avoids leaving a page with an older content script in memory.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['https://www.instagram.com/*'] });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch {
      // A tab can be navigating while Chrome reloads the extension. The normal
      // content-script declaration will apply the extension once it settles.
    }
  }
});
