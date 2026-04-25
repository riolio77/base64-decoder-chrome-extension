// background.js — Service Worker (v2.0)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return false;

  if (msg.action === 'openUrl') {
    const proceed = () => {
      if (msg.target === 'new_tab') {
        chrome.tabs.create({ url: msg.url, active: true }, () => sendResponse({ ok: true }));
        return;
      }
      const tabId = sender.tab?.id;
      if (tabId) {
        chrome.tabs.update(tabId, { url: msg.url }, () => sendResponse({ ok: true }));
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]) chrome.tabs.update(tabs[0].id, { url: msg.url }, () => sendResponse({ ok: true }));
          else sendResponse({ ok: false });
        });
      }
    };
    if (msg.setPikpakToken) {
      chrome.storage.local.set({ _pikpakToken: { ts: Date.now() } }, proceed);
      return true;
    }
    proceed();
    return true;
  }

  if (msg.action === 'setPikpakToken') {
    chrome.storage.local.set({ _pikpakToken: { ts: Date.now() } }, () => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
