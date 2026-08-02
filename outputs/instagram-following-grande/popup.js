const DEFAULTS = { enabled: true, layout: 'two', size: 280, autoScroll: false, settingsVersion: 5 };
const enabled = document.querySelector('#enabled');
const layouts = [...document.querySelectorAll('input[name="layout"]')];
const size = document.querySelector('#size');
const value = document.querySelector('#value');
const autoScroll = document.querySelector('#auto-scroll');
const statusText = document.querySelector('#status-text');

const render = () => { value.textContent = `${size.value} px`; };
const renderStatus = () => { statusText.textContent = enabled.checked ? 'Activo' : 'Desactivado'; };

chrome.storage.sync.get(DEFAULTS, (settings) => {
  if (settings.settingsVersion !== 5) {
    settings.size = settings.layout === 'three' ? 190 : 280;
    settings.autoScroll = false;
    chrome.storage.sync.set({ size: settings.size, autoScroll: false, settingsVersion: 5 });
  }
  enabled.checked = settings.enabled;
  renderStatus();
  const selected = layouts.find((radio) => radio.value === settings.layout) || layouts[0];
  selected.checked = true;
  size.value = settings.size;
  autoScroll.checked = settings.autoScroll;
  render();
});

enabled.addEventListener('change', () => {
  renderStatus();
  chrome.storage.sync.set({ enabled: enabled.checked });
});
autoScroll.addEventListener('change', () => chrome.storage.sync.set({ autoScroll: autoScroll.checked }));
layouts.forEach((radio) => radio.addEventListener('change', () => {
  if (!radio.checked) return;
  const suggestedSize = radio.value === 'three' ? 190 : 280;
  size.value = suggestedSize;
  render();
  chrome.storage.sync.set({ layout: radio.value, size: suggestedSize });
}));
size.addEventListener('input', () => {
  render();
  chrome.storage.sync.set({ size: Number(size.value) });
});
