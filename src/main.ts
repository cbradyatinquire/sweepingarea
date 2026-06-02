import './style.css';
import { makeDefaultState } from './state.ts';
import { adjustDimensions, makeVEqualToH } from './coords.ts';
import { Piece, copyPieces } from './piece.ts';
import { submitUnitDialog } from './setup.ts';
import {
  redraw,
  onCanvasMouseDown, onCanvasMouseMove, onCanvasMouseUp,
  onCanvasTouchStart, onCanvasTouchMove, onCanvasTouchEnd,
  onToolsMouseDown,
} from './modes.ts';

const canv  = document.getElementById('scanvas') as HTMLCanvasElement;
const tools = document.getElementById('tcanvas') as HTMLCanvasElement;
const constructionDiv = document.getElementById('construction')!;
const toolsDiv        = document.getElementById('tools')!;

const state = makeDefaultState();
let initialised = false;

// ----------------------------------------------------------------
// Dev test shape — add ?testShape=arrow to the URL to start
// directly in cut/rearrange mode with a non-convex arrowhead.
// Remove or ignore in production.
// ----------------------------------------------------------------
if (new URLSearchParams(window.location.search).get('testShape') === 'arrow') {
  // Sub-tick coords with hSubTicks=vSubTicks=2 (major × 2).
  // Major vertices: (1,2),(4,1),(3,3),(4,5),(1,4),(3,4)
  const arrowVerts = [
    { x: 2, y: 4  },   // major (1,2)
    { x: 8, y: 2  },   // major (4,1)
    { x: 6, y: 6  },   // major (3,3)
    { x: 8, y: 10 },   // major (4,5)
    { x: 2, y: 8  },   // major (1,4)
    { x: 6, y: 8  },   // major (3,4) — deep notch
  ];
  state.grid.hSubTicks = 2;
  state.grid.vSubTicks = 2;
  const arrow = new Piece(arrowVerts);
  arrow.color = { r: 136, g: 136, b: 255, a: 1.0 };
  state.cut.pieces = [arrow];
  state.cut.originalPieces = copyPieces([arrow]);
  state.cut.subMode = 'choose';
  state.mode = 3;
}

// ----------------------------------------------------------------
// Resize
// ----------------------------------------------------------------

function resize(): void {
  const cw = constructionDiv.offsetWidth, ch = constructionDiv.offsetHeight;
  const tw = toolsDiv.offsetWidth,        th = toolsDiv.offsetHeight;

  if (cw === 0 || ch === 0 || tw === 0 || th === 0) {
    requestAnimationFrame(resize);
    return;
  }

  canv.width  = cw;  canv.height  = ch;
  tools.width = tw;  tools.height = th;

  adjustDimensions(canv, state.grid);
  if (!initialised) {
    makeVEqualToH(state.grid);
    initialised = true;
  }

  redraw(canv, tools, state);
}

window.addEventListener('resize', resize);
resize();

// ----------------------------------------------------------------
// Canvas event listeners
// ----------------------------------------------------------------

canv.addEventListener('mousedown',  e => onCanvasMouseDown(e,  state, canv, tools));
canv.addEventListener('mousemove',  e => onCanvasMouseMove(e,  state, canv, tools));
canv.addEventListener('mouseup',    e => onCanvasMouseUp(e,    state, canv, tools));
canv.addEventListener('touchstart', e => onCanvasTouchStart(e, state, canv, tools), { passive: false });
canv.addEventListener('touchmove',  e => onCanvasTouchMove(e,  state, canv, tools), { passive: false });
canv.addEventListener('touchend',   e => onCanvasTouchEnd(e,   state, canv, tools), { passive: false });

tools.addEventListener('mousedown', e => onToolsMouseDown(e, state, canv, tools));

// ----------------------------------------------------------------
// Unit dialog submit button
// ----------------------------------------------------------------

document.getElementById('submitUnit')!.addEventListener('click', () => {
  submitUnitDialog(state, canv, tools);
  redraw(canv, tools, state);
});
