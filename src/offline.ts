// Offline / field deployment shell.
// - Loads a starter state baked in at authoring time (window.__STARTER_STATE__)
// - Gallery column shows published work this session
// - "Start Session" picks a save folder once (File System Access API)
// - Every publish silently writes a JSON file to that folder

import type { SerializedState } from './serialization.ts';

declare const __APP_HTML__: string | null | undefined;
declare const __STARTER_STATE__: SerializedState | null | undefined;

const frame      = document.getElementById('app-frame')    as HTMLIFrameElement;
const thumbsDiv  = document.getElementById('thumbs')       as HTMLDivElement;
const publishBtn = document.getElementById('publish-btn')  as HTMLButtonElement;
const statusEl   = document.getElementById('status')       as HTMLDivElement;
const overlay    = document.getElementById('modal-overlay') as HTMLDivElement;
const modalImg   = document.getElementById('modal-img')    as HTMLImageElement;
const loadBtn    = document.getElementById('modal-load-btn')   as HTMLButtonElement;
const closeBtn   = document.getElementById('modal-close-btn')  as HTMLButtonElement;

let port: MessagePort | null = null;
let sessionFolder: FileSystemDirectoryHandle | null = null;
let publishCount = 0;
let selectedEntry: { thumbnail: string; state: SerializedState } | null = null;

const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DD-HH-MM-SS
const filenameMatch = window.location.pathname.match(/offline-([^/]+)\.html$/i);
const activityName = filenameMatch ? filenameMatch[1] : 'activity';

// In standalone mode the full app HTML is baked in; in dev mode fall back to src="/".
const appHtml = (typeof __APP_HTML__ !== 'undefined') ? __APP_HTML__ : null;
if (appHtml) {
  frame.srcdoc = appHtml;
} else {
  frame.src = '/';
}

async function ensureFolder(): Promise<boolean> {
  if (sessionFolder) return true;
  if (!('showDirectoryPicker' in window)) {
    setStatus('File saving not supported — use Chrome');
    return false;
  }
  try {
    const rootDir = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    sessionFolder = await rootDir.getDirectoryHandle(
      `${activityName}-${sessionTimestamp}`, { create: true }
    );
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------
// Connect to the app iframe
// ----------------------------------------------------------------

window.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'ready' && e.source === frame.contentWindow) {
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = handleAppMessage;
    port.start();
    frame.contentWindow!.postMessage({ type: 'connect' }, '*', [channel.port2]);

    // Load starter state if one was baked in
    const starter = (typeof __STARTER_STATE__ !== 'undefined') ? __STARTER_STATE__ : null;
    if (starter) {
      port.postMessage({ type: 'loadState', state: starter });
    }

    setStatus('Ready');
    publishBtn.disabled = false;
  }
});


// ----------------------------------------------------------------
// Publish
// ----------------------------------------------------------------

publishBtn.addEventListener('click', () => {
  if (!port) return;
  port.postMessage({ type: 'requestState' });
});

async function handleAppMessage(e: MessageEvent): Promise<void> {
  const msg = e.data;
  if (msg?.type !== 'state') return;

  publishCount++;
  const state: SerializedState = msg.state;
  const thumbnail: string = msg.thumbnail;

  addThumbToUI(thumbnail, state);

  if (await ensureFolder()) {
    await saveToFolder(state, publishCount);
    setStatus(`Saved #${publishCount}`);
  } else {
    setStatus(`#${publishCount} — not saved (no folder selected)`);
  }
}

async function saveToFolder(state: SerializedState, n: number): Promise<void> {
  const filename = `state-${String(n).padStart(3, '0')}-${sessionTimestamp}.json`;
  const fileHandle = await sessionFolder!.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(state, null, 2));
  await writable.close();
}

// ----------------------------------------------------------------
// Thumbnail gallery
// ----------------------------------------------------------------

function addThumbToUI(thumbnail: string, state: SerializedState): void {
  const div = document.createElement('div');
  div.className = 'thumb-entry';

  const img = document.createElement('img');
  img.src = thumbnail;
  img.alt = `#${publishCount}`;

  const label = document.createElement('div');
  label.className = 'thumb-label';
  label.textContent = `#${publishCount}`;

  div.appendChild(img);
  div.appendChild(label);
  div.addEventListener('click', () => openModal(thumbnail, state));
  thumbsDiv.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// ----------------------------------------------------------------
// Modal — load a saved state back into the app
// ----------------------------------------------------------------

function openModal(thumbnail: string, state: SerializedState): void {
  selectedEntry = { thumbnail, state };
  modalImg.src = thumbnail;
  overlay.classList.add('visible');
}

function closeModal(): void {
  overlay.classList.remove('visible');
  selectedEntry = null;
}

loadBtn.addEventListener('click', () => {
  if (!port || !selectedEntry) return;
  port.postMessage({ type: 'loadState', state: selectedEntry.state });
  closeModal();
});

closeBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}
