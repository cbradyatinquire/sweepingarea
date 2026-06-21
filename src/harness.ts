// Test harness for the gallery postMessage protocol.
// Manages the MessagePort connection to the app iframe, the thumbnail gallery,
// and the publish / load-state UI.

import type { SerializedState } from './serialization.ts';

interface GalleryEntry {
  thumbnail: string;
  state: SerializedState;
  label: string;
}

const frame      = document.getElementById('app-frame')    as HTMLIFrameElement;
const thumbsDiv  = document.getElementById('thumbs')       as HTMLDivElement;
const publishBtn = document.getElementById('publish-btn')  as HTMLButtonElement;
const statusEl   = document.getElementById('status')       as HTMLDivElement;
const overlay    = document.getElementById('modal-overlay')as HTMLDivElement;
const modalImg   = document.getElementById('modal-img')    as HTMLImageElement;
const loadBtn    = document.getElementById('modal-load-btn')  as HTMLButtonElement;
const closeBtn   = document.getElementById('modal-close-btn') as HTMLButtonElement;

let port: MessagePort | null = null;
let entries: GalleryEntry[] = [];
let selectedEntry: GalleryEntry | null = null;
let publishCount = 0;

// ----------------------------------------------------------------
// Connect to the app iframe via MessagePort
// ----------------------------------------------------------------

window.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'ready' && e.source === frame.contentWindow) {
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = handleAppMessage;
    port.start();
    frame.contentWindow!.postMessage({ type: 'connect' }, '*', [channel.port2]);
    setStatus('Connected');
    publishBtn.disabled = false;
  }
});

// ----------------------------------------------------------------
// Messages from the app
// ----------------------------------------------------------------

function handleAppMessage(e: MessageEvent): void {
  const msg = e.data;
  if (msg?.type === 'state') {
    publishCount++;
    const entry: GalleryEntry = {
      thumbnail: msg.thumbnail,
      state:     msg.state,
      label:     `#${publishCount}`,
    };
    entries.push(entry);
    addThumbToUI(entry);
    setStatus(`${entries.length} item${entries.length === 1 ? '' : 's'} published`);
  }
}

// ----------------------------------------------------------------
// Publish button
// ----------------------------------------------------------------

publishBtn.addEventListener('click', () => {
  if (!port) return;
  port.postMessage({ type: 'requestState' });
});

// ----------------------------------------------------------------
// Thumbnail list
// ----------------------------------------------------------------

function addThumbToUI(entry: GalleryEntry): void {
  const div = document.createElement('div');
  div.className = 'thumb-entry';

  const img = document.createElement('img');
  img.src = entry.thumbnail;
  img.alt = entry.label;

  const label = document.createElement('div');
  label.className = 'thumb-label';
  label.textContent = entry.label;

  div.appendChild(img);
  div.appendChild(label);
  div.addEventListener('click', () => openModal(entry));
  thumbsDiv.appendChild(div);

  // Scroll to the new entry
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// ----------------------------------------------------------------
// Modal
// ----------------------------------------------------------------

function openModal(entry: GalleryEntry): void {
  selectedEntry = entry;
  modalImg.src = entry.thumbnail;
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

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeModal();
});

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}
