// Authoring tool — save and load app states as JSON files.
// Uses the same MessagePort protocol as the gallery harness.

import type { SerializedState } from './serialization.ts';

const frame      = document.getElementById('app-frame')   as HTMLIFrameElement;
const saveBtn    = document.getElementById('save-btn')    as HTMLButtonElement;
const loadBtn    = document.getElementById('load-btn')    as HTMLButtonElement;
const copyBtn    = document.getElementById('copy-btn')    as HTMLButtonElement;
const offlineBtn = document.getElementById('offline-btn') as HTMLButtonElement;
const statusEl   = document.getElementById('status')      as HTMLSpanElement;
const fileInput  = document.getElementById('file-input')  as HTMLInputElement;

let port: MessagePort | null = null;

// ----------------------------------------------------------------
// Connect
// ----------------------------------------------------------------

window.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'ready' && e.source === frame.contentWindow) {
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = handleAppMessage;
    port.start();
    frame.contentWindow!.postMessage({ type: 'connect' }, '*', [channel.port2]);
    setStatus('Ready');
    saveBtn.disabled    = false;
    loadBtn.disabled    = false;
    copyBtn.disabled    = false;
    offlineBtn.disabled = false;
  }
});

// ----------------------------------------------------------------
// Save state — download as .json file
// ----------------------------------------------------------------

saveBtn.addEventListener('click', () => {
  if (!port) return;
  setStatus('Saving…');
  port.postMessage({ type: 'requestState' });
});

async function handleAppMessage(e: MessageEvent): Promise<void> {
  const msg = e.data;
  if (msg?.type !== 'state') return;

  const state: SerializedState = msg.state;
  const json = JSON.stringify(state, null, 2);

  if (pendingCopy) {
    pendingCopy = false;
    navigator.clipboard.writeText(json).then(() => setStatus('Copied!'), () => setStatus('Copy failed'));
    return;
  }

  if (pendingOffline) {
    pendingOffline = false;
    await createOfflineActivity(state);
    return;
  }

  // Download as JSON file
  const filename = makeFilename(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`Saved: ${filename}`);
}

function makeFilename(state: SerializedState): string {
  const modeNames: Record<number, string> = {
    1: 'setup', 2: 'sweep', 3: 'cut', 5: 'geoboard',
  };
  const mode = modeNames[state.mode] ?? `mode${state.mode}`;
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `sweeping-area-${mode}-${ts}.json`;
}

// ----------------------------------------------------------------
// Copy JSON to clipboard
// ----------------------------------------------------------------

let pendingCopy    = false;
let pendingOffline = false;

copyBtn.addEventListener('click', () => {
  if (!port) return;
  pendingCopy = true;
  setStatus('Copying…');
  port.postMessage({ type: 'requestState' });
});

// ----------------------------------------------------------------
// Create Offline Activity — fetch offline.html template, inject state, download
// ----------------------------------------------------------------

offlineBtn.addEventListener('click', () => {
  if (!port) return;
  pendingOffline = true;
  setStatus('Creating offline activity…');
  port.postMessage({ type: 'requestState' });
});

async function createOfflineActivity(state: SerializedState): Promise<void> {
  let template: string;
  try {
    const res = await fetch('/offline.html');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    template = await res.text();
  } catch {
    setStatus('Error: could not fetch offline.html — run npm run build:offline first, then npm run preview');
    return;
  }

  const name     = prompt('Activity name (used in filename):', 'activity') ?? 'activity';
  const safeName = name.trim().replace(/[^a-z0-9-_]/gi, '-') || 'activity';
  const filename = `offline-${safeName}.html`;

  const stateJson = JSON.stringify(state);
  const injected  = template
    .replace('window.__STARTER_STATE__ = null;', `window.__STARTER_STATE__ = ${stateJson};`);

  const blob = new Blob([injected], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`Created: ${filename}`);
}

// ----------------------------------------------------------------
// Load state — open file picker
// ----------------------------------------------------------------

loadBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file || !port) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const state = JSON.parse(reader.result as string) as SerializedState;
      port!.postMessage({ type: 'loadState', state });
      setStatus(`Loaded: ${file.name}`);
    } catch {
      setStatus('Error: invalid JSON');
    }
    fileInput.value = '';
  };
  reader.readAsText(file);
});

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}
