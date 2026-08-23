<script>
// --- NETLIFY TO ESP32 BRIDGE ---
let ESP_URL = 'https://fontana.fontanabyloriorl.it';
if (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')) {
  ESP_URL = 'http://192.168.1.164';
}

// Intercetta e metti in CODA tutte le chiamate fetch per non ingolfare l'ESP32
const originalFetch = window.fetch;
let fetchQueue = Promise.resolve();

window.fetch = function(...args) {
  if (typeof args[0] === 'string' && args[0].startsWith('/')) {
    const sep = args[0].includes('?') ? '&' : '?';
    args[0] = ESP_URL + args[0] + sep + '_t=' + Date.now();
  }
  const executeFetch = () => originalFetch.apply(window, args);
  const myPromise = fetchQueue.then(() => executeFetch(), () => executeFetch());
  fetchQueue = myPromise.catch(() => {});
  return myPromise;
};

// Intercetta EventSource se usato
const originalEventSource = window.EventSource;
if (originalEventSource) {
  window.EventSource = function(...args) {
