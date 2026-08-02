const DEFAULTS = { enabled: true, layout: 'two', size: 280, settingsVersion: 4 };
const enabled = document.querySelector('#enabled');
const layouts = [...document.querySelectorAll('input[name="layout"]')];
const size = document.querySelector('#size');
const value = document.querySelector('#value');

const render = () => { value.textContent = `${size.value} px`; };

chrome.storage.sync.get(DEFAULTS, (settings) => {
  if (settings.settingsVersion !== 4) {
    settings.size = settings.layout === 'three' ? 190 : 280;
    chrome.storage.sync.set({ size: settings.size, settingsVersion: 4 });
  }
  enabled.checked = settings.enabled;
  const selected = layouts.find((radio) => radio.value === settings.layout) || layouts[0];
  selected.checked = true;
  size.value = settings.size;
  render();
});

enabled.addEventListener('change', () => chrome.storage.sync.set({ enabled: enabled.checked }));
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
