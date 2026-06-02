// Cut mode (Mode 3) — translate + custom-cut + rotation.
//
// Sub-modes (CutSubMode):
//   'choose'    — forked arrow.  Top = cut on grid, bottom = cut your own.
//   'cutAll'    — brief preview: click canvas to execute grid cut.
//   'custom'    — draggable handle lines + scissors for selective cuts.
//   'rearrange' — pieces draggable; rotate button in toolbar.
//
// Rotation (within 'rearrange'):
//   Click rotate button in toolbar → doingRotation = true
//   Click a piece → rotationPieceIndex set, ghost preview appears on hover
//   Click rotation center (half-sub-tick snap) → animate 180° rotation
//   Animation uses requestAnimationFrame, 30 steps

import type { AppState, Point } from './state.ts';
import { Piece, copyPieces } from './piece.ts';
import { drawGridAndRulers } from './grid.ts';
import {
  getXForHSubTick, getYForVSubTick,
  getGridCoordForPixelH, getGridCoordForPixelV,
  getSubTickCoordForPixelH, getSubTickCoordForPixelV,
} from './coords.ts';

// ----------------------------------------------------------------
// Images
// ----------------------------------------------------------------

const scissorsImg       = new Image();  scissorsImg.src       = 'images/cutSelected.png';
const scissorsClosedImg = new Image();  scissorsClosedImg.src = 'images/cutSelectedClosed.png';

const PIECE_COLOR = { r: 136, g: 136, b: 255, a: 0.5 };
const ANIM_STEPS  = 30;

// ----------------------------------------------------------------
// Mode entry
// ----------------------------------------------------------------

export function enterCutMode(state: AppState): void {
  const { sweeper, sweep, grid: g } = state;

  const vertices: Point[] = [
    { ...sweeper.olds1 },
    { ...sweeper.s1end },
    { ...sweeper.s2end },
    { ...sweeper.olds2 },
  ];

  const whole = new Piece(vertices);
  whole.color = { ...PIECE_COLOR };
  state.cut.pieces = [whole];
  state.cut.originalPieces = copyPieces([whole]);
  state.cut.subMode = 'choose';
  state.cut.draggingPiece = null;
  state.cut.cutGrabbed = 'none';
  state.cut.cameFromCustom = false;
  state.cut.showArea = false;
  // Store the area string from sweep mode for display in rearrange
  state.cut.areaString = sweep.areaToDisplay || '';
  cancelRotation(state);
  sweep.hasCut = false;

  setCutHandles(state.cut, g.hticks * g.hSubTicks, g.vticks * g.vSubTicks);
  setMirrorHandles(state.cut, g.hticks * g.hSubTicks, g.vticks * g.vSubTicks);
}

function setCutHandles(cut: AppState['cut'], maxX: number, maxY: number): void {
  cut.handleX = Math.max(0, maxX - 1);
  cut.handleY = Math.max(0, maxY - 1);
}

// Mirror handles start at the edges so the student must drag them into the work area.
function setMirrorHandles(cut: AppState['cut'], maxX: number, maxY: number): void {
  cut.mirrorX = Math.max(0, maxX - 1);
  cut.mirrorY = Math.max(0, maxY - 1);
}

// ----------------------------------------------------------------
// Sub-mode transitions (called from modes.ts)
// ----------------------------------------------------------------

export function enterCutAllPreview(state: AppState): void {
  state.cut.subMode = 'cutAll';
}

export function enterCustomCut(state: AppState): void {
  state.cut.subMode = 'custom';
  state.cut.cutGrabbed = 'none';
  state.cut.cameFromCustom = true;
}

export function enterRearrangeFromCustom(state: AppState): void {
  state.cut.subMode = 'rearrange';
  state.cut.cutGrabbed = 'none';
}

export function backFromRearrange(state: AppState): void {
  cancelRotation(state);
  if (state.cut.cameFromCustom) {
    state.cut.subMode = 'custom';
    state.cut.draggingPiece = null;
    state.cut.cutGrabbed = 'none';
    const g = state.grid;
    setCutHandles(state.cut, g.hticks * g.hSubTicks, g.vticks * g.vSubTicks);
  } else {
    resetCut(state);
  }
}

// ----------------------------------------------------------------
// Rotation toggle (called from modes.ts toolbar handler)
// ----------------------------------------------------------------

export function toggleRotation(state: AppState): void {
  if (state.cut.doingRotation) {
    cancelRotation(state);
  } else {
    cancelReflection(state);
    state.cut.doingRotation = true;
    state.cut.rotationPieceIndex = -1;
    state.cut.hoverCenter = null;
  }
}

function cancelRotation(state: AppState): void {
  state.cut.doingRotation = false;
  state.cut.rotationPieceIndex = -1;
  state.cut.hoverCenter = null;
}

// ----------------------------------------------------------------
// Reflection toggle
// ----------------------------------------------------------------

export function toggleReflection(state: AppState): void {
  if (state.cut.doingReflection) {
    cancelReflection(state);
  } else {
    cancelRotation(state);
    state.cut.doingReflection = true;
    state.cut.reflectGrabbed = 'none';
    // mirrorActive is preserved so the last locked mirror is still active on return
    // handleX/handleY are preserved so mirror positions are remembered
  }
}

function cancelReflection(state: AppState): void {
  state.cut.doingReflection = false;
  state.cut.reflectGrabbed = 'none';
  state.cut.mirrorActive = 'none';
}

// ----------------------------------------------------------------
// Draw
// ----------------------------------------------------------------

export function drawCUT(canv: HTMLCanvasElement, state: AppState): void {
  const ctx = canv.getContext('2d')!;
  ctx.clearRect(0, 0, canv.width, canv.height);
  drawGridAndRulers(canv, state.grid);

  const { cut } = state;

  if (cut.subMode === 'choose' || cut.subMode === 'cutAll') {
    drawOriginalOutline(ctx, state, true);
  }

  if (cut.subMode === 'custom') {
    const filled = cut.pieces.length <= 1;
    drawOriginalOutline(ctx, state, filled);
    if (cut.pieces.length > 1) {
      for (const piece of cut.pieces) piece.draw(ctx, state.grid);
    }
    drawCutHandles(ctx, state);
    drawScissors(ctx, state);
  }

  if (cut.subMode === 'rearrange') {
    drawOriginalOutline(ctx, state, false);

    // Draw all non-selected, non-dragging pieces
    for (let i = 0; i < cut.pieces.length; i++) {
      const piece = cut.pieces[i];
      if (piece === cut.draggingPiece) continue;
      if (i === cut.rotationPieceIndex && cut.doingRotation) continue;
      piece.draw(ctx, state.grid);
    }

    if (cut.draggingPiece !== null) {
      cut.draggingPiece.drawAsDragging(ctx, state.grid);
    }

    // During animation: just draw the rotating piece; no ghosts.
    // During selection: full overlay with ghost preview.
    if (cut.animating) {
      if (cut.rotationPieceIndex >= 0) {
        cut.pieces[cut.rotationPieceIndex].draw(ctx, state.grid);
      }
    } else if (cut.doingRotation) {
      drawRotationOverlay(ctx, state);
    }

    // Reflection overlay
    if (cut.doingReflection && !cut.animating) {
      drawReflectionOverlay(ctx, state);
    }
  }
}

function drawOriginalOutline(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  fill: boolean,
): void {
  const { originalPieces } = state.cut;
  const g = state.grid;
  ctx.strokeStyle = '#555';
  ctx.fillStyle = 'rgba(136,136,255,0.5)';
  for (const piece of originalPieces) {
    const verts = piece.vertices;
    ctx.beginPath();
    ctx.moveTo(getXForHSubTick(verts[0].x, g), getYForVSubTick(verts[0].y, g));
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(getXForHSubTick(verts[i].x, g), getYForVSubTick(verts[i].y, g));
    }
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
  }
}

function drawCutHandles(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { cut, grid: g } = state;
  const handleR = 10;

  const hx = getXForHSubTick(cut.handleX, g);
  const hGrabbed = cut.cutGrabbed === 'hline';
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = hGrabbed ? '#7F4' : '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx, g.voff);
  ctx.lineTo(hx, g.voff + g.vrulerheight);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.rect(hx - handleR, g.voff - handleR * 2, handleR * 2, handleR * 2);
  ctx.closePath();
  ctx.fillStyle = hGrabbed ? '#7F4' : '#999';
  ctx.strokeStyle = hGrabbed ? '#7F4' : '#000';
  ctx.fill(); ctx.stroke();

  const vy = getYForVSubTick(cut.handleY, g);
  const vGrabbed = cut.cutGrabbed === 'vline';
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = vGrabbed ? '#7F4' : '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.hoff, vy);
  ctx.lineTo(g.hoff + g.hrulerwidth, vy);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.rect(g.hoff - handleR * 2, vy - handleR, handleR * 2, handleR * 2);
  ctx.closePath();
  ctx.fillStyle = vGrabbed ? '#7F4' : '#999';
  ctx.strokeStyle = vGrabbed ? '#7F4' : '#000';
  ctx.fill(); ctx.stroke();
}

function drawScissors(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { grid: g, cut } = state;
  const size = Math.min(g.hoff, g.voff) - 4;
  const img = cut.cutGrabbed === 'scissors' ? scissorsClosedImg : scissorsImg;
  ctx.drawImage(img, 2, 2, size, size);
}

// ---- Rotation overlay ----

function drawRotationOverlay(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { cut, grid: g } = state;

  if (cut.rotationPieceIndex === -1) return; // waiting for piece click — nothing extra to draw

  const piece = cut.pieces[cut.rotationPieceIndex];

  // Draw the selected piece highlighted (as if dragging)
  piece.drawAsDragging(ctx, g);

  const center = cut.hoverCenter;
  if (center === null) return;

  const allowed = piece.possibleCenter(
    center,
    g.hticks * g.hSubTicks,   // worldX
    g.vticks * g.vSubTicks,   // worldY
  );

  // Ghost copies every 45° between current and 180°
  piece.drawRotatedCopiesEveryNDegrees(ctx, g, center, 45, allowed);

  // 180° ghost
  piece.rotate180Degrees(center).drawInsubstantialForRotate(ctx, g, allowed);

  // Center dot
  const cx = getXForHSubTick(center.x, g);
  const cy = getYForVSubTick(center.y, g);
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.fillStyle = allowed ? '#2C2' : '#999';
  ctx.strokeStyle = '#000';
  ctx.fill();
  ctx.stroke();
}

// ---- Reflection overlay ----

function drawReflectionOverlay(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { cut, grid: g } = state;
  const handleR = 10;

  // Ghost reflected pieces when mirror is locked
  // Show ghost during drag (reflectGrabbed) and when locked (mirrorActive)
  const ghostSource = cut.reflectGrabbed !== 'none' ? cut.reflectGrabbed : cut.mirrorActive;
  if (ghostSource !== 'none') {
    // hline = vertical line at mirrorX  → flip x-coords → axis 'horizontal'
    // vline = horizontal line at mirrorY → flip y-coords → axis 'vertical'
    const axis  = ghostSource === 'hline' ? 'horizontal' : 'vertical';
    const coord = ghostSource === 'hline' ? cut.mirrorX  : cut.mirrorY;
    for (const piece of cut.pieces) {
      piece.drawFlipped(ctx, g, axis, coord);
    }
  }

  // Vertical mirror line handle (hline) — circle on H ruler
  const hx = getXForHSubTick(cut.mirrorX, g);
  const hActive = cut.reflectGrabbed === 'hline' || cut.mirrorActive === 'hline';

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = hActive ? '#7F4' : '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx, g.voff);
  ctx.lineTo(hx, g.voff + g.vrulerheight);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(hx, g.voff - handleR, handleR, -Math.PI / 2, 3 * Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = hActive ? '#7F4' : '#999';
  ctx.strokeStyle = hActive ? '#7F4' : '#000';
  ctx.fill(); ctx.stroke();

  // Horizontal mirror line handle (vline) — circle on V ruler
  const vy = getYForVSubTick(cut.mirrorY, g);
  const vActive = cut.reflectGrabbed === 'vline' || cut.mirrorActive === 'vline';

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = vActive ? '#7F4' : '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(g.hoff, vy);
  ctx.lineTo(g.hoff + g.hrulerwidth, vy);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(g.hoff - handleR, vy, handleR, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.fillStyle = vActive ? '#7F4' : '#999';
  ctx.strokeStyle = vActive ? '#7F4' : '#000';
  ctx.fill(); ctx.stroke();
}

// ----------------------------------------------------------------
// Interaction — canvas events
// ----------------------------------------------------------------

type RedrawFn = (canv: HTMLCanvasElement, tools: HTMLCanvasElement, state: AppState) => void;

export function startDragCUT(
  pt: Point, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement, redrawFn: RedrawFn,
): void {
  const { cut, grid: g } = state;

  if (cut.animating) return;  // block interaction during animation

  if (cut.subMode === 'cutAll') {
    doCutAll(state);
    cut.subMode = 'rearrange';
    state.sweep.hasCut = true;
    return;
  }

  if (cut.subMode === 'rearrange') {
    if (cut.doingRotation) {
      onRotationClick(pt, state, canv, tools, redrawFn);
    } else if (cut.doingReflection) {
      onReflectionMouseDown(pt, state);
    } else {
      dragFirstPieceClickedOn(pt, state);
    }
    return;
  }

  if (cut.subMode === 'custom') {
    const handleR = 10;
    const cornerSize = Math.min(g.hoff, g.voff);
    if (pt.x < cornerSize && pt.y < cornerSize) {
      cut.cutGrabbed = 'scissors';
      return;
    }
    const hx = getXForHSubTick(cut.handleX, g);
    if (sqDist(pt, { x: hx, y: g.voff - handleR }) < state.sweeper.dragThreshold) {
      cut.cutGrabbed = 'hline'; return;
    }
    const vy = getYForVSubTick(cut.handleY, g);
    if (sqDist(pt, { x: g.hoff - handleR, y: vy }) < state.sweeper.dragThreshold) {
      cut.cutGrabbed = 'vline'; return;
    }
    cut.cutGrabbed = 'none';
  }
}

export function mouseDragCUT(pt: Point, state: AppState): void {
  const { cut, grid: g } = state;

  if (cut.animating) return;

  if (cut.subMode === 'rearrange') {
    if (cut.doingRotation && cut.rotationPieceIndex >= 0) {
      cut.hoverCenter = snapCenter(pt, g);
    } else if (cut.doingReflection) {
      if (cut.reflectGrabbed !== 'none') {
        // Drag the grabbed mirror handle
        if (cut.reflectGrabbed === 'hline') {
          cut.mirrorX = 0.5 * Math.round(2 * getGridCoordForPixelH(pt.x, g));
          cut.mirrorX = Math.max(0, Math.min(g.hticks * g.hSubTicks, cut.mirrorX));
        } else {
          cut.mirrorY = 0.5 * Math.round(2 * getGridCoordForPixelV(pt.y, g));
          cut.mirrorY = Math.max(0, Math.min(g.vticks * g.vSubTicks, cut.mirrorY));
        }
      } else if (cut.draggingPiece !== null) {
        draggingCUT(pt, state);
      }
    } else if (!cut.doingRotation && cut.draggingPiece !== null) {
      draggingCUT(pt, state);
    }
    return;
  }

  if (cut.subMode === 'custom') {
    if (cut.cutGrabbed === 'hline') {
      cut.handleX = Math.round(getSubTickCoordForPixelH(pt.x, g));
      cut.handleX = Math.max(0, Math.min(g.hticks * g.hSubTicks, cut.handleX));
    } else if (cut.cutGrabbed === 'vline') {
      cut.handleY = Math.round(getSubTickCoordForPixelV(pt.y, g));
      cut.handleY = Math.max(0, Math.min(g.vticks * g.vSubTicks, cut.handleY));
    }
  }
}

export function stopDragCUT(state: AppState): void {
  const { cut } = state;

  if (cut.animating) return;

  if (cut.subMode === 'rearrange') {
    if (cut.doingReflection) {
      handleEndDragForReflect(state);
    }
    cut.draggingPiece = null;
    return;
  }

  if (cut.subMode === 'custom' && cut.cutGrabbed === 'scissors') {
    doCutSelected(state);
  }
  cut.cutGrabbed = 'none';
}

// ----------------------------------------------------------------
// Rotation click logic
// ----------------------------------------------------------------

function onRotationClick(
  pt: Point, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement, redrawFn: RedrawFn,
): void {
  const { cut, grid: g } = state;

  if (cut.rotationPieceIndex === -1) {
    // Step 1: select a piece
    const idx = firstPieceIndexAt(pt, state);
    if (idx !== -1) {
      cut.rotationPieceIndex = idx;
      cut.hoverCenter = snapCenter(pt, g);
    } else {
      // Clicked on empty space — cancel rotation mode
      cancelRotation(state);
    }
  } else {
    // Step 2: confirm rotation center
    const center = snapCenter(pt, g);
    const piece = cut.pieces[cut.rotationPieceIndex];
    const allowed = piece.possibleCenter(
      center,
      g.hticks * g.hSubTicks,   // worldX
      g.vticks * g.vSubTicks,   // worldY
    );
    if (allowed) {
      // Pre-compute exact result, then animate
      cut.animTargetPiece = piece.rotate180Degrees(center);
      cut.animTargetPiece.color = { ...piece.color };
      cut.animCenter = center;
      cut.animating = true;
      startRotationAnimation(cut.rotationPieceIndex, center, state, canv, tools, redrawFn);
    }
    // If not allowed: do nothing; student can try a different center
  }
}

function startRotationAnimation(
  pieceIndex: number,
  center: Point,
  state: AppState,
  canv: HTMLCanvasElement,
  tools: HTMLCanvasElement,
  redrawFn: RedrawFn,
): void {
  const anglePerStep = Math.PI / ANIM_STEPS;
  let step = 0;

  function frame(): void {
    if (step >= ANIM_STEPS) {
      // Snap to exact result to avoid floating-point drift
      state.cut.pieces[pieceIndex] = state.cut.animTargetPiece!;
      state.cut.animating = false;
      state.cut.animTargetPiece = null;
      state.cut.animCenter = null;
      cancelRotation(state);
      redrawFn(canv, tools, state);
      return;
    }
    state.cut.pieces[pieceIndex].rotateCounterclockwiseBy(anglePerStep, center, state.grid);
    redrawFn(canv, tools, state);
    step++;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// ----------------------------------------------------------------
// Reflection interaction
// ----------------------------------------------------------------

function onReflectionMouseDown(pt: Point, state: AppState): void {
  const { cut, grid: g } = state;
  const handleR = 10;

  // Check hline handle (vertical mirror line, circle on H ruler)
  // Clear mirrorActive immediately so the old selection stops lighting up.
  const hx = getXForHSubTick(cut.mirrorX, g);
  if (sqDist(pt, { x: hx, y: g.voff - handleR }) < state.sweeper.dragThreshold) {
    cut.reflectGrabbed = 'hline';
    cut.mirrorActive = 'none';
    return;
  }

  // Check vline handle (horizontal mirror line, circle on V ruler)
  const vy = getYForVSubTick(cut.mirrorY, g);
  if (sqDist(pt, { x: g.hoff - handleR, y: vy }) < state.sweeper.dragThreshold) {
    cut.reflectGrabbed = 'vline';
    cut.mirrorActive = 'none';
    return;
  }

  // Click on a piece (when mirror is locked): prepare to flip it
  if (cut.mirrorActive !== 'none') {
    dragFirstPieceClickedOn(pt, state);
  }
}

function handleEndDragForReflect(state: AppState): void {
  const { cut } = state;
  if (cut.draggingPiece === null) {
    // No piece grabbed — lock the mirror
    if (cut.reflectGrabbed !== 'none') {
      cut.mirrorActive = cut.reflectGrabbed;
      cut.reflectGrabbed = 'none';
    }
  } else {
    // Piece was grabbed — try to flip it
    tryFlip(state);
  }
}

function tryFlip(state: AppState): void {
  const { cut, grid: g } = state;
  const piece = cut.draggingPiece;
  if (piece === null) return;

  const axis      = cut.mirrorActive === 'hline' ? 'horizontal' : 'vertical';
  const coord     = cut.mirrorActive === 'hline' ? cut.mirrorX  : cut.mirrorY;
  const worldX    = g.hticks * g.hSubTicks;
  const worldY    = g.vticks * g.vSubTicks;

  if (piece.flipInBounds(axis, coord, worldX, worldY)) {
    piece.actuallyFlip(axis, coord);
  }
}

// ----------------------------------------------------------------
// Cut logic
// ----------------------------------------------------------------

function doCutAll(state: AppState): void {
  const { grid: g } = state;
  for (let yc = 0; yc < g.vticks * g.vSubTicks; yc++) cutAlongY(yc, state);
  for (let xc = 0; xc < g.hticks * g.hSubTicks; xc++) cutAlongX(xc, state);
}

function doCutSelected(state: AppState): void {
  cutAlongX(state.cut.handleX, state);
  cutAlongY(state.cut.handleY, state);
  state.sweep.hasCut = true;
}

function cutAlongX(xc: number, state: AppState): void {
  const next: Piece[] = [];
  for (const p of state.cut.pieces) next.push(...p.cutVertical(xc));
  state.cut.pieces = next;
}

function cutAlongY(yc: number, state: AppState): void {
  const next: Piece[] = [];
  for (const p of state.cut.pieces) next.push(...p.cutHorizontal(yc));
  state.cut.pieces = next;
}

// ----------------------------------------------------------------
// Piece dragging
// ----------------------------------------------------------------

function dragFirstPieceClickedOn(pt: Point, state: AppState): void {
  const idx = firstPieceIndexAt(pt, state);
  if (idx !== -1) {
    state.cut.draggingPiece = state.cut.pieces[idx];
    state.cut.pieceDragOrigin = { ...pt };
  }
}

function firstPieceIndexAt(pt: Point, state: AppState): number {
  const { grid: g } = state;
  const gridX = getGridCoordForPixelH(pt.x, g);
  const gridY = getGridCoordForPixelV(pt.y, g);
  for (let i = 0; i < state.cut.pieces.length; i++) {
    if (state.cut.pieces[i].containsGridPoint(gridX, gridY)) return i;
  }
  return -1;
}

function draggingCUT(pt: Point, state: AppState): void {
  const piece = state.cut.draggingPiece;
  if (piece === null) return;
  const { grid: g, cut } = state;
  const dx = pt.x - cut.pieceDragOrigin.x;
  const dy = pt.y - cut.pieceDragOrigin.y;
  let delx = Math.round(g.hSubTicks * dx / g.ticwid);
  let dely = Math.round(g.vSubTicks * dy / g.ticht);
  if (piece.xmin + delx < 0)                        delx = 0;
  if (piece.xmax + delx > g.hticks * g.hSubTicks)   delx = 0;
  if (piece.ymin + dely < 0)                        dely = 0;
  if (piece.ymax + dely > g.vticks * g.vSubTicks)   dely = 0;
  if (Math.abs(delx) + Math.abs(dely) > 0) {
    cut.pieceDragOrigin = {
      x: cut.pieceDragOrigin.x + (delx * g.ticwid / g.hSubTicks),
      y: cut.pieceDragOrigin.y + (dely * g.ticht / g.vSubTicks),
    };
    piece.shiftBy(delx, dely);
  }
}

// ----------------------------------------------------------------
// Undo / reset
// ----------------------------------------------------------------

export function resetCut(state: AppState): void {
  const { grid: g } = state;
  state.cut.pieces = copyPieces(state.cut.originalPieces);
  for (const p of state.cut.pieces) p.color = { ...PIECE_COLOR };
  state.cut.subMode = 'choose';
  state.cut.draggingPiece = null;
  state.cut.cutGrabbed = 'none';
  state.cut.cameFromCustom = false;
  state.cut.showArea = false;
  state.sweep.hasCut = false;
  cancelRotation(state);
  cancelReflection(state);
  setCutHandles(state.cut, g.hticks * g.hSubTicks, g.vticks * g.vSubTicks);
  setMirrorHandles(state.cut, g.hticks * g.hSubTicks, g.vticks * g.vSubTicks);
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

// Snap a pixel position to the nearest half-sub-tick grid point.
// Uses the unrounded coord conversion so the ×2→round→÷2 actually
// snaps to 0, 0.5, 1, 1.5 … rather than always landing on integers.
function snapCenter(pt: Point, g: AppState['grid']): Point {
  const sx = getGridCoordForPixelH(pt.x, g);   // continuous float in sub-tick coords
  const sy = getGridCoordForPixelV(pt.y, g);
  return {
    x: 0.5 * Math.round(2 * sx),
    y: 0.5 * Math.round(2 * sy),
  };
}

function sqDist(a: Point, b: Point): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}
