// postMessage / MessagePort protocol for gallery integration.
//
// Handshake:
//   1. App → parent:  { type: "ready" }            (on init)
//   2. Parent → app:  { type: "connect", port }     (transfers a MessagePort)
//   3. All subsequent traffic flows on the port:
//        Parent → app:  { type: "loadState",    state: SerializedState }
//        Parent → app:  { type: "requestState" }
//        App → parent:  { type: "state", state: SerializedState, thumbnail: string }

import type { AppState } from './state.ts';
import { serializeState, deserializeState, captureThumb } from './serialization.ts';
import { stopFallTimer, buildCavPiece, getCavAreaString } from './cavalieri.ts';

type RedrawFn = (canv: HTMLCanvasElement, tools: HTMLCanvasElement, state: AppState) => void;

export function initMessaging(
  state: AppState,
  canv: HTMLCanvasElement,
  tools: HTMLCanvasElement,
  redraw: RedrawFn,
): void {
  // Signal readiness to the parent frame
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'ready' }, '*');
  }

  // Wait for the parent to hand us a MessagePort
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'connect' && e.ports.length > 0) {
      const port = e.ports[0];
      port.onmessage = (ev: MessageEvent) => {
        handlePortMessage(ev.data, port, state, canv, tools, redraw);
      };
      port.start();
    }
  });
}

function handlePortMessage(
  msg: { type: string; state?: unknown },
  port: MessagePort,
  state: AppState,
  canv: HTMLCanvasElement,
  tools: HTMLCanvasElement,
  redraw: RedrawFn,
): void {
  if (msg.type === 'requestState') {
    commitIfNeeded(state, canv, tools, redraw);
    const serialized = serializeState(state);
    const thumbnail  = captureThumb(canv);
    port.postMessage({ type: 'state', state: serialized, thumbnail });

  } else if (msg.type === 'loadState' && msg.state) {
    deserializeState(msg.state as import('./serialization.ts').SerializedState, state, canv);
    redraw(canv, tools, state);
  }
}

// If the app is mid-Cavalieri when requestState arrives, commit the fall
// to cut mode before serializing so the saved state is always clean.
function commitIfNeeded(
  state: AppState,
  canv: HTMLCanvasElement,
  tools: HTMLCanvasElement,
  redraw: RedrawFn,
): void {
  if (state.mode !== 4) return;

  stopFallTimer();

  if (state.cavalieri.t1s.length > 1) {
    const piece = buildCavPiece(state);
    piece.color = { r: 136, g: 136, b: 255, a: 0.5 };
    state.cut.pieces         = [piece];
    state.cut.originalPieces = [piece.copy()];
    state.cut.subMode        = 'choose';
    state.cut.draggingPiece  = null;
    state.cut.cameFromCustom = false;
    state.cut.cameFromGeoboard = false;
    state.cut.showArea       = false;
    state.cut.areaString     = `${getCavAreaString(state)} ${state.grid.hunits}²`;
    const g = state.grid;
    state.cut.handleX = g.hticks * g.hSubTicks - 1;
    state.cut.handleY = g.vticks * g.vSubTicks - 1;
    state.cut.mirrorX = g.hticks * g.hSubTicks - 1;
    state.cut.mirrorY = g.vticks * g.vSubTicks - 1;
  }

  state.mode = 3;
  redraw(canv, tools, state);
}
