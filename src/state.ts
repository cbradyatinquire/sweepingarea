// Central app state, organised by concern.
// Each phase adds its own interface and extends AppState.

import type { Piece } from './piece.ts';

export interface GridState {
  hticks: number;        // major ticks on horizontal axis
  vticks: number;        // major ticks on vertical axis
  hSubTicks: number;     // sub-divisions within each H tick
  vSubTicks: number;     // sub-divisions within each V tick
  hoff: number;          // pixel margin reserved for the left ruler strip
  voff: number;          // pixel margin reserved for the top ruler strip
  ticwid: number;        // derived: pixel width of one major H tick
  ticht: number;         // derived: pixel height of one major V tick
  hrulerwidth: number;   // derived: pixel width of the drawable area
  vrulerheight: number;  // derived: pixel height of the drawable area
  hunits: string;        // horizontal unit label, e.g. "in"
  vunits: string;        // vertical unit label
  unitsLocked: boolean;  // true = H and V units are forced equal
}

export interface Point {
  x: number;
  y: number;
}

export type GrabTarget =
  | 'none' | 'body' | 'middle'
  | 'horizontal' | 'vertical'
  | 's1end' | 's2end' | 'done';

export interface SweeperState {
  s1end: Point;          // sweeper endpoint 1, grid coords
  s2end: Point;          // sweeper endpoint 2, grid coords
  olds1: Point;          // remembered s1end for drag calculations
  olds2: Point;          // remembered s2end for drag calculations
  oldpx1: Point;         // remembered pixel position of s1end
  oldpx2: Point;         // remembered pixel position of s2end
  oldhtix: number;       // remembered hticks at drag start
  oldvtix: number;       // remembered vticks at drag start
  grabbed: GrabTarget;
  dragOrigin: Point;
  dragThreshold: number; // squared pixel distance for grab detection
  readyToGoOn: boolean;  // whether the right-arrow is enabled
}

export interface SweepState {
  dragIsVertical: boolean;  // true = sweeping up/down, false = left/right
  draggedUnits: number;     // distance swept in sub-ticks (0 = not yet swept)
  areaToDisplay: string;    // formatted area string for display
  showArea: boolean;        // whether to show numeric area in toolbar
  hasCut: boolean;          // whether pieces have been cut (affects swept shape drawing)
}

export type CutSubMode = 'choose' | 'cutAll' | 'custom' | 'rearrange';

export interface CutState {
  pieces: Piece[];           // current (possibly rearranged) pieces
  originalPieces: Piece[];   // the uncut parallelogram — for undo / outline drawing
  subMode: CutSubMode;       // which sub-state of cut mode we're in
  draggingPiece: Piece | null;
  pieceDragOrigin: Point;    // pixel coord where drag started, for delta calculation
  // Custom-cut handles (sub-tick coords)
  handleX: number;           // sub-tick x of the draggable vertical cut line
  handleY: number;           // sub-tick y of the draggable horizontal cut line
  cutGrabbed: 'hline' | 'vline' | 'scissors' | 'none';
  cameFromCustom: boolean;   // true if rearrange was reached via 'custom' path
  showArea: boolean;         // toggle: show area in rearrange caption
  areaString: string;        // formatted area value set on entering cut mode
  // Rotation (Phase 6)
  doingRotation: boolean;
  rotationPieceIndex: number;    // index into pieces[]; -1 = no piece selected yet
  hoverCenter: Point | null;     // half-sub-tick snapped center under mouse cursor
  animating: boolean;            // true while rotation animation is running
  animTargetPiece: Piece | null; // pre-computed exact 180° result
  animCenter: Point | null;      // center of the running animation
  // Reflection (Phase 7)
  doingReflection: boolean;
  reflectGrabbed: 'hline' | 'vline' | 'none';  // handle being actively dragged
  mirrorActive: 'hline' | 'vline' | 'none';    // locked mirror line ready for flip
  mirrorX: number;   // sub-tick x of vertical mirror line (independent of cut handleX)
  mirrorY: number;   // sub-tick y of horizontal mirror line (independent of cut handleY)
}

export interface CavalieriState {
  t1s: Point[];          // trail of s1end positions during fall
  t2s: Point[];          // trail of s2end positions during fall
  length: number;        // |s1end.x - s2end.x| in sub-ticks (horizontal base)
  area: number;          // accumulated area (in sub-tick² units)
  height: number;        // accumulated vertical steps taken
  canGoLeft: boolean;
  canGoRight: boolean;
  leftAdd: number;       // area contributed per left step
  rightAdd: number;      // area contributed per right step
  // Bullseye widget
  isDragging: boolean;
  dragOrigin: Point;
  fallDir: 'left' | 'right' | 'straight' | 'none';
}

export interface AppState {
  grid: GridState;
  mode: number;
  sweeper: SweeperState;
  sweep: SweepState;
  cut: CutState;
  cavalieri: CavalieriState;
}

export function makeDefaultState(): AppState {
  return {
    mode: 1,             // start directly in Setup for now (splash handled later)
    grid: {
      hticks: 20,
      vticks: 10,
      hSubTicks: 1,
      vSubTicks: 1,
      hoff: 60,
      voff: 60,
      ticwid: 0,       // set by adjustDimensions()
      ticht: 0,        // set by adjustDimensions()
      hrulerwidth: 0,  // set by adjustDimensions()
      vrulerheight: 0, // set by adjustDimensions()
      hunits: 'in',
      vunits: 'in',
      unitsLocked: true,
    },
    sweeper: {
      s1end:    { x: 2, y: 3 },
      s2end:    { x: 5, y: 7 },
      olds1:    { x: 2, y: 3 },
      olds2:    { x: 5, y: 7 },
      oldpx1:   { x: 0, y: 0 },
      oldpx2:   { x: 0, y: 0 },
      oldhtix:  20,
      oldvtix:  10,
      grabbed:  'none',
      dragOrigin: { x: 0, y: 0 },
      dragThreshold: 600,        // squared pixels — matches Dart
      readyToGoOn: true,
    },
    sweep: {
      dragIsVertical: true,
      draggedUnits: 0,
      areaToDisplay: '',
      showArea: false,
      hasCut: false,
    },
    cavalieri: {
      t1s: [],
      t2s: [],
      length: 0,
      area: 0,
      height: 0,
      canGoLeft: true,
      canGoRight: true,
      leftAdd: 0,
      rightAdd: 0,
      isDragging: false,
      dragOrigin: { x: 0, y: 0 },
      fallDir: 'none',
    },
    cut: {
      pieces: [],
      originalPieces: [],
      subMode: 'choose',
      draggingPiece: null,
      pieceDragOrigin: { x: 0, y: 0 },
      handleX: 0,   // set properly by enterCutMode → setCutHandles
      handleY: 0,
      cutGrabbed: 'none',
      cameFromCustom: false,
      showArea: false,
      areaString: '',
      doingRotation: false,
      rotationPieceIndex: -1,
      hoverCenter: null,
      animating: false,
      animTargetPiece: null,
      animCenter: null,
      doingReflection: false,
      reflectGrabbed: 'none',
      mirrorActive: 'none',
      mirrorX: 0,   // set by enterCutMode → setMirrorHandles
      mirrorY: 0,
    },
  };
}
