// Cavalieri mode (Mode 4).
//
// Available when the sweeper is horizontal (s1end.y === s2end.y).
// The sweeper "falls" in a chosen direction one sub-tick at a time,
// tracing a parallelogram whose area equals the original rectangle.
//
// Interaction: click anywhere on canvas to start the bullseye drag.
// Drag downward — direction determines fall: straight / left / right.
// While the mouse is held the sweeper steps at 500 ms intervals.
// Release to stop. Right arrow (when t1s.length > 1) → Cut mode.

import type { AppState, Point } from './state.ts';
import { Piece } from './piece.ts';
import { drawGridAndRulers } from './grid.ts';
import { getXForHSubTick, getYForVSubTick } from './coords.ts';
import { drawPoint } from './sweep.ts';

// ----------------------------------------------------------------
// Fall timer — module-level so it can be cancelled on mode exit
// ----------------------------------------------------------------

type RedrawFn = (canv: HTMLCanvasElement, tools: HTMLCanvasElement, s: AppState) => void;
let fallTimerId: ReturnType<typeof setTimeout> | null = null;

export function stopFallTimer(): void {
  if (fallTimerId !== null) {
    clearTimeout(fallTimerId);
    fallTimerId = null;
  }
}

// ----------------------------------------------------------------
// Mode entry
// ----------------------------------------------------------------

export function enterCavalieriMode(state: AppState): void {
  const { sweeper } = state;
  const cav = state.cavalieri;

  stopFallTimer();

  // Start the trail at the current sweeper position
  cav.t1s = [{ ...sweeper.s1end }];
  cav.t2s = [{ ...sweeper.s2end }];
  cav.area   = 0;
  cav.height = 0;
  cav.isDragging = false;
  cav.fallDir = 'none';

  initConstraints(state);

  state.mode = 4;
}

function initConstraints(state: AppState): void {
  const { sweeper } = state;
  const cav = state.cavalieri;

  const dx = sweeper.s1end.x - sweeper.s2end.x;
  const dy = sweeper.s1end.y - sweeper.s2end.y;
  const A  = Math.abs(dx);
  const B  = Math.abs(dy);

  cav.length = A;

  if (dx === 0) {
    // Degenerate — vertical sweeper; shouldn't reach Cavalieri, but guard anyway
    cav.canGoLeft = cav.canGoRight = true;
    cav.rightAdd = cav.leftAdd = 0;
    return;
  }

  const slope = dy / dx;   // (s1.y - s2.y) / (s1.x - s2.x)

  if (slope >= 0) {
    cav.rightAdd = A - B;
    cav.leftAdd  = A + B;
    cav.canGoRight = slope < 1;
    cav.canGoLeft  = true;
  } else {
    cav.rightAdd = A + B;
    cav.leftAdd  = A - B;
    cav.canGoRight = true;
    cav.canGoLeft  = slope > -1;
  }
}

// ----------------------------------------------------------------
// Draw
// ----------------------------------------------------------------

export function drawCAVALIERI(canv: HTMLCanvasElement, state: AppState): void {
  const ctx = canv.getContext('2d')!;
  ctx.clearRect(0, 0, canv.width, canv.height);
  drawGridAndRulers(canv, state.grid);
  drawCavShape(ctx, state);
  drawSweeperCav(ctx, state);
  drawBullseye(ctx, canv, state);
}

function drawCavShape(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { cavalieri: cav, grid: g } = state;
  if (cav.t1s.length < 2) return;

  ctx.strokeStyle = '#555';
  ctx.fillStyle = 'rgba(136,136,255,0.5)';
  ctx.beginPath();

  const start = cav.t1s[0];
  ctx.moveTo(getXForHSubTick(start.x, g), getYForVSubTick(start.y, g));

  for (let i = 1; i < cav.t1s.length; i++) {
    ctx.lineTo(getXForHSubTick(cav.t1s[i].x, g), getYForVSubTick(cav.t1s[i].y, g));
  }
  for (let j = cav.t2s.length - 1; j >= 0; j--) {
    ctx.lineTo(getXForHSubTick(cav.t2s[j].x, g), getYForVSubTick(cav.t2s[j].y, g));
  }

  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawSweeperCav(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { sweeper, grid: g } = state;
  const s1 = { x: getXForHSubTick(sweeper.s1end.x, g), y: getYForVSubTick(sweeper.s1end.y, g) };
  const s2 = { x: getXForHSubTick(sweeper.s2end.x, g), y: getYForVSubTick(sweeper.s2end.y, g) };

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(s1.x, s1.y);
  ctx.lineTo(s2.x, s2.y);
  ctx.stroke();
  ctx.lineWidth = 1;

  drawPoint(ctx, s1, '#222', 10);
  drawPoint(ctx, s2, '#222', 10);
}

function drawBullseye(
  ctx: CanvasRenderingContext2D,
  canv: HTMLCanvasElement,
  state: AppState,
): void {
  const { cavalieri: cav } = state;
  const cx = Math.round(2 * canv.width  / 3);
  const cy = Math.round(    canv.height / 3);

  // Outer fan arc (radius 90) from 45° to 135° (downward-facing)
  ctx.strokeStyle = '#229';
  ctx.fillStyle = 'rgba(200,255,200,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 90 * Math.cos(5 * Math.PI / 4), cy - 90 * Math.sin(5 * Math.PI / 4));
  ctx.arc(cx, cy, 90, Math.PI / 4, 3 * Math.PI / 4, false);
  ctx.lineTo(cx - 90 * Math.cos(7 * Math.PI / 4), cy - 90 * Math.sin(7 * Math.PI / 4));
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner arc (radius 60)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 60 * Math.cos(5 * Math.PI / 4), cy - 60 * Math.sin(5 * Math.PI / 4));
  ctx.arc(cx, cy, 60, Math.PI / 4, 3 * Math.PI / 4, false);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.stroke();

  // Left / right diagonal guide lines
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 90 * Math.cos(19 * Math.PI / 12), cy - 90 * Math.sin(19 * Math.PI / 12));
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 90 * Math.cos(17 * Math.PI / 12), cy - 90 * Math.sin(17 * Math.PI / 12));
  ctx.stroke();

  // Centre dot
  ctx.fillStyle = '#229';
  ctx.beginPath();
  ctx.arc(cx, cy, 15, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  // Direction indicator while dragging
  if (cav.isDragging && cav.fallDir !== 'none') {
    ctx.strokeStyle = 'rgba(255,0,0,0.7)';
    ctx.fillStyle   = 'rgba(255,0,0,0.7)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    if (cav.fallDir === 'straight') {
      ctx.lineTo(cx, cy + 85);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + 85, 5, 0, 2 * Math.PI);
      ctx.fill();
    } else if (cav.fallDir === 'left') {
      ctx.lineTo(cx - 45, cy + 72);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - 45, cy + 72, 5, 0, 2 * Math.PI);
      ctx.fill();
    } else if (cav.fallDir === 'right') {
      ctx.lineTo(cx + 45, cy + 72);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 45, cy + 72, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.lineWidth = 1;
  }
}

// ----------------------------------------------------------------
// Interaction
// ----------------------------------------------------------------

export function startDragCAV(pt: Point, state: AppState): void {
  state.cavalieri.isDragging = true;
  state.cavalieri.dragOrigin = { ...pt };
  state.cavalieri.fallDir = 'none';
}

export function mouseDragCAV(pt: Point, state: AppState): void {
  const cav = state.cavalieri;
  if (!cav.isDragging) return;

  const delx = pt.x - cav.dragOrigin.x;
  const dely = pt.y - cav.dragOrigin.y;

  if (dely < 40) {
    cav.fallDir = 'none';
    return;
  }

  if (delx === 0) {
    cav.fallDir = 'straight';
    return;
  }

  const slope = dely / delx;
  if      (slope >  1 && slope <  4) cav.fallDir = 'right';
  else if (slope < -1 && slope > -4) cav.fallDir = 'left';
  else if (Math.abs(slope) >= 4)     cav.fallDir = 'straight';
  else                               cav.fallDir = 'none';
}

export function stopDragCAV(state: AppState): void {
  state.cavalieri.isDragging = false;
  state.cavalieri.fallDir    = 'none';
}

// ----------------------------------------------------------------
// Fall logic (500 ms timer)
// ----------------------------------------------------------------

export function scheduleFall(
  state: AppState,
  canv: HTMLCanvasElement,
  tools: HTMLCanvasElement,
  redrawFn: RedrawFn,
): void {
  fallTimerId = setTimeout(() => {
    if (state.mode !== 4) return;
    maybeFall(state);
    redrawFn(canv, tools, state);
    scheduleFall(state, canv, tools, redrawFn);
  }, 500);
}

function maybeFall(state: AppState): void {
  const { cavalieri: cav, sweeper, grid: g } = state;
  if (!cav.isDragging || cav.fallDir === 'none') return;

  const maxX = g.hticks * g.hSubTicks;
  const maxY = g.vticks * g.vSubTicks;

  let nx1 = sweeper.s1end.x;
  let ny1 = sweeper.s1end.y + 1;   // always drops one sub-tick vertically
  let nx2 = sweeper.s2end.x;
  let ny2 = sweeper.s2end.y + 1;

  if (cav.fallDir === 'right' && cav.canGoRight) {
    nx1 += 1; nx2 += 1;
  } else if (cav.fallDir === 'left' && cav.canGoLeft) {
    nx1 -= 1; nx2 -= 1;
  }

  // Bounds check
  if (nx1 < 0 || nx2 < 0 || nx1 > maxX || nx2 > maxX) return;
  if (ny1 >= maxY || ny2 >= maxY) return;

  sweeper.s1end = { x: nx1, y: ny1 };
  sweeper.s2end = { x: nx2, y: ny2 };
  cav.t1s.push({ ...sweeper.s1end });
  cav.t2s.push({ ...sweeper.s2end });
  cav.height += 1;

  if      (cav.fallDir === 'straight') cav.area += cav.length;
  else if (cav.fallDir === 'right')    cav.area += cav.canGoRight ? cav.rightAdd : cav.length;
  else if (cav.fallDir === 'left')     cav.area += cav.canGoLeft  ? cav.leftAdd  : cav.length;
}

// ----------------------------------------------------------------
// Build the Piece for Cut mode from the Cavalieri trail
// ----------------------------------------------------------------

export function buildCavPiece(state: AppState): Piece {
  const { cavalieri: cav } = state;
  const vertices: Point[] = [
    ...cav.t1s.map(p => ({ ...p })),
    ...[...cav.t2s].reverse().map(p => ({ ...p })),
  ];
  return new Piece(vertices);
}

// ----------------------------------------------------------------
// Area string for toolbar
// ----------------------------------------------------------------

export function getCavAreaString(state: AppState): string {
  const { cavalieri: cav, grid: g } = state;
  const denom = g.hSubTicks * g.vSubTicks;
  return denom > 1
    ? `${cav.area} / ${denom}`
    : String(cav.area);
}
