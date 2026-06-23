// State serialization and deserialization for postMessage / URL-param / gallery use.
//
// SerializedState is a plain JSON-safe object. The app accepts it via loadState
// and emits it via requestState. Config is passed through as-is (the shell/parent
// is responsible for overriding config when activity constraints must be enforced).

import type { AppState, CutSubMode } from './state.ts';
import { Piece, copyPieces } from './piece.ts';
import type { Color } from './piece.ts';

// ----------------------------------------------------------------
// Serialized shape
// ----------------------------------------------------------------

export interface SerializedPiece {
  vertices: { x: number; y: number }[];
  color: { r: number; g: number; b: number; a: number };
}

export interface SerializedState {
  version: 1;
  config?: {
    rotationsAllowed?: boolean;
    reflectionsAllowed?: boolean;
    galleryUrl?: string;
  };
  grid: {
    hTicks: number;
    vTicks: number;
    hSubTicks: number;
    vSubTicks: number;
    hunits: string;
    vunits: string;
  };
  mode: number;
  // Modes 1–2: sweeper position
  sweeper?: { x1: number; y1: number; x2: number; y2: number };
  // Mode 2: how far swept (needed to restore the parallelogram outline)
  sweep?: { draggedUnits: number; dragIsVertical: boolean };
  // Modes 3, 5: pieces
  pieces?: SerializedPiece[];
  cutSubMode?: CutSubMode;
}

// ----------------------------------------------------------------
// Serialize
// ----------------------------------------------------------------

export function serializeState(state: AppState): SerializedState {
  const { grid: g, mode, sweeper, sweep, cut } = state;

  const out: SerializedState = {
    version: 1,
    grid: {
      hTicks:    g.hticks,
      vTicks:    g.vticks,
      hSubTicks: g.hSubTicks,
      vSubTicks: g.vSubTicks,
      hunits:    g.hunits,
      vunits:    g.vunits,
    },
    mode,
  };

  if (mode === 1 || mode === 2) {
    out.sweeper = {
      x1: sweeper.s1end.x,
      y1: sweeper.s1end.y,
      x2: sweeper.s2end.x,
      y2: sweeper.s2end.y,
    };
  }

  if (mode === 2) {
    out.sweep = {
      draggedUnits:  sweep.draggedUnits,
      dragIsVertical: sweep.dragIsVertical,
    };
  }

  if (mode === 3 || mode === 5) {
    out.pieces = cut.pieces.map(p => ({
      vertices: p.vertices.map(v => ({ x: v.x, y: v.y })),
      color: { ...p.color },
    }));
    if (mode === 3) out.cutSubMode = cut.subMode;
  }

  return out;
}

// ----------------------------------------------------------------
// Deserialize
// ----------------------------------------------------------------

export function deserializeState(
  blob: SerializedState,
  state: AppState,
  canv: HTMLCanvasElement,
): void {
  const { grid: g } = state;

  // Grid
  g.hticks    = blob.grid.hTicks;
  g.vticks    = blob.grid.vTicks;
  g.hSubTicks = blob.grid.hSubTicks;
  g.vSubTicks = blob.grid.vSubTicks;
  g.hunits    = blob.grid.hunits;
  g.vunits    = blob.grid.vunits;

  // Recompute derived grid fields
  g.hrulerwidth  = canv.width  - g.hoff;
  g.vrulerheight = canv.height - g.voff;
  g.ticwid = g.hrulerwidth  / g.hticks;
  g.ticht  = g.vrulerheight / g.vticks;

  // Mode
  state.mode = blob.mode;

  // Sweeper
  if (blob.sweeper) {
    state.sweeper.s1end = { x: blob.sweeper.x1, y: blob.sweeper.y1 };
    state.sweeper.s2end = { x: blob.sweeper.x2, y: blob.sweeper.y2 };
    state.sweeper.olds1 = { ...state.sweeper.s1end };
    state.sweeper.olds2 = { ...state.sweeper.s2end };
    state.sweeper.readyToGoOn = true;
    state.sweeper.grabbed = 'none';
  }

  // Sweep progress
  if (blob.sweep) {
    state.sweep.draggedUnits   = blob.sweep.draggedUnits;
    state.sweep.dragIsVertical = blob.sweep.dragIsVertical;
    state.sweep.showArea       = false;
    state.sweep.hasCut         = false;
  } else {
    state.sweep.draggedUnits = 0;
  }

  // Pieces
  if (blob.pieces) {
    state.cut.pieces = blob.pieces.map(sp => {
      const p = new Piece(sp.vertices.map(v => ({ ...v })));
      p.color = { ...sp.color } as Color;
      return p;
    });
    state.cut.originalPieces = copyPieces(state.cut.pieces);
  } else {
    state.cut.pieces = [];
    state.cut.originalPieces = [];
  }

  // Cut submode
  state.cut.subMode        = blob.cutSubMode ?? 'choose';
  state.cut.draggingPiece  = null;
  state.cut.cutGrabbed     = 'none';
  state.cut.cameFromCustom = false;
  state.cut.cameFromGeoboard = blob.mode === 5;
  state.cut.showArea       = false;
  state.cut.doingRotation  = false;
  state.cut.rotationPieceIndex = -1;
  state.cut.hoverCenter    = null;
  state.cut.animating      = false;
  state.cut.doingReflection = false;
  state.cut.reflectGrabbed = 'none';
  state.cut.mirrorActive   = 'none';

  const maxX = g.hticks * g.hSubTicks;
  const maxY = g.vticks * g.vSubTicks;
  state.cut.handleX = Math.max(0, maxX - 1);
  state.cut.handleY = Math.max(0, maxY - 1);
  state.cut.mirrorX = Math.max(0, maxX - 1);
  state.cut.mirrorY = Math.max(0, maxY - 1);

  // Cavalieri — always reset (mid-fall states are not serialized)
  state.cavalieri.t1s      = [];
  state.cavalieri.t2s      = [];
  state.cavalieri.height   = 0;
  state.cavalieri.area     = 0;
  state.cavalieri.fallDir  = 'none';
  state.cavalieri.isDragging = false;

  // Geo
  state.geo.dragging      = false;
  state.geo.originalPiece = null;
}

// ----------------------------------------------------------------
// Thumbnail
// ----------------------------------------------------------------

export function captureThumb(canv: HTMLCanvasElement): string {
  // Capture at 800px on the long side, preserving the canvas aspect ratio.
  const maxSize = 800;
  const aspect = canv.width / canv.height;
  const w = aspect >= 1 ? maxSize : Math.round(maxSize * aspect);
  const h = aspect >= 1 ? Math.round(maxSize / aspect) : maxSize;
  const thumb = document.createElement('canvas');
  thumb.width  = w;
  thumb.height = h;
  const ctx = thumb.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canv, 0, 0, w, h);
  return thumb.toDataURL('image/jpeg', 0.85);
}
