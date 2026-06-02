// Sweep mode (Mode 2) — ported from sweep.dart and relevant parts of sweeps.dart.
// The student drags the sweeper body to trace a parallelogram and compute its area.

import type { AppState, Point } from './state.ts';
import { getXForHSubTick, getYForVSubTick, getSubTickCoordForPixelV, getSubTickCoordForPixelH } from './coords.ts';
import { drawGridAndRulers } from './grid.ts';

// ----------------------------------------------------------------
// Draw
// ----------------------------------------------------------------

export function drawSWEEP(canv: HTMLCanvasElement, state: AppState): void {
  const ctx = canv.getContext('2d')!;
  ctx.clearRect(0, 0, canv.width, canv.height);
  drawGridAndRulers(canv, state.grid);

  const { sweeper, sweep } = state;

  if (sweeper.grabbed !== 'none') {
    drawSweptShape(ctx, state);
    drawSweeperCurrent(ctx, state);
    sweep.areaToDisplay = getAreaString(state) + ' ' + getAreaUnitsString(state);
    sweeper.readyToGoOn = sweep.draggedUnits !== 0;
  } else {
    drawSweeperCurrent(ctx, state);
  }
}

function drawSweptShape(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { sweeper, sweep, grid: g } = state;

  const strt  = px(sweeper.s1end, g);
  const end   = px(sweeper.s2end, g);

  let strt2: Point, end2: Point;
  if (sweep.dragIsVertical) {
    strt2 = px({ x: sweeper.s1end.x, y: sweeper.s1end.y - sweep.draggedUnits }, g);
    end2  = px({ x: sweeper.s2end.x, y: sweeper.s2end.y - sweep.draggedUnits }, g);
  } else {
    strt2 = px({ x: sweeper.s1end.x - sweep.draggedUnits, y: sweeper.s1end.y }, g);
    end2  = px({ x: sweeper.s2end.x - sweep.draggedUnits, y: sweeper.s2end.y }, g);
  }

  ctx.beginPath();
  if (sweep.hasCut) {
    ctx.strokeStyle = '#44F';
    ctx.lineWidth = 3;
    ctx.setLineDash([3]);
  } else {
    ctx.strokeStyle = '#555';
    ctx.fillStyle = '#88F';
  }
  ctx.moveTo(strt.x,  strt.y);
  ctx.lineTo(strt2.x, strt2.y);
  ctx.lineTo(end2.x,  end2.y);
  ctx.lineTo(end.x,   end.y);
  ctx.closePath();
  if (!sweep.hasCut) ctx.fill();
  ctx.stroke();

  if (sweep.hasCut) {
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }

  // Ruler markings showing the swept dimensions
  if (sweep.draggedUnits !== 0) {
    drawRulerMarkings(ctx, strt, end, strt2, end2, sweep.dragIsVertical, state);
  }
}

function drawRulerMarkings(
  ctx: CanvasRenderingContext2D,
  strt: Point, end: Point, strt2: Point, end2: Point,
  isVertical: boolean,
  state: AppState,
): void {
  const { sweep, grid: g } = state;

  // Determine the corner points for the highlighting boxes.
  // The logic mirrors Dart's drawRulerMarkings(BottomLeft, TopLeft, TopRight).
  let bl: Point, tl: Point, tr: Point;

  if (isVertical) {
    if (strt.x > end.x) {
      bl = sweep.draggedUnits > 0 ? end2  : end;
      tl = sweep.draggedUnits > 0 ? end   : end2;
      tr = sweep.draggedUnits > 0 ? strt  : strt2;
    } else {
      bl = sweep.draggedUnits > 0 ? strt2 : strt;
      tl = sweep.draggedUnits > 0 ? strt  : strt2;
      tr = sweep.draggedUnits > 0 ? end   : end2;
    }
  } else {
    if (strt.y > end.y) {
      bl = sweep.draggedUnits > 0 ? strt  : strt2;
      tl = sweep.draggedUnits > 0 ? end   : end2;
      tr = sweep.draggedUnits > 0 ? end2  : end;
    } else {
      bl = sweep.draggedUnits > 0 ? end   : end2;
      tl = sweep.draggedUnits > 0 ? strt  : strt2;
      tr = sweep.draggedUnits > 0 ? strt2 : strt;
    }
  }

  // Highlight boxes on the rulers
  ctx.fillStyle = 'rgba(255,0,0,0.15)';
  ctx.fillRect(0, bl.y, g.hoff, tl.y - bl.y);
  ctx.fillRect(tr.x, 0, tl.x - tr.x, g.voff);

  ctx.strokeStyle = '#000';
  ctx.fillStyle   = '#000';
  ctx.font = 'italic 20pt Calibri, sans-serif';
  ctx.textAlign = 'center';

  // Vertical ruler label
  const vCount = Math.abs(getSubTickCoordForPixelV(bl.y, g) - getSubTickCoordForPixelV(tl.y, g));
  const vFrac  = g.vSubTicks > 1 ? ` / ${g.vSubTicks} ` : ' ';
  const vLabel = `${vCount}${vFrac}${g.vunits}`;
  const ycor   = Math.round((bl.y + tl.y) / 2);
  drawVerticalText(ctx, vLabel, 28, ycor);

  // Horizontal ruler label
  const hCount = Math.abs(getSubTickCoordForPixelH(tr.x, g) - getSubTickCoordForPixelH(tl.x, g));
  const hFrac  = g.hSubTicks > 1 ? ` / ${g.hSubTicks} ` : ' ';
  const hLabel = `${hCount}${hFrac}${g.hunits}`;
  ctx.fillText(hLabel, Math.round((tl.x + tr.x) / 2), 28);
}

function drawVerticalText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawSweeperCurrent(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { sweeper, grid: g } = state;
  const strt = px(sweeper.s1end, g);
  const end  = px(sweeper.s2end, g);
  const mid: Point = {
    x: Math.round((strt.x + end.x) / 2),
    y: Math.round((strt.y + end.y) / 2),
  };

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(strt.x, strt.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.lineWidth = 1;

  drawPoint(ctx, strt, '#222', 10);
  drawPoint(ctx, end,  '#222', 10);
  drawPoint(ctx, mid,  sweeper.grabbed === 'body' ? '#4C4' : '#999', 10);
}

export function drawPoint(ctx: CanvasRenderingContext2D, pt: Point, style: string, radius: number): void {
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = style;
  ctx.fill();
}

// ----------------------------------------------------------------
// Interaction
// ----------------------------------------------------------------

export function startDragSWEEP(pt: Point, state: AppState): void {
  if (inMiddle(pt, state)) {
    state.sweeper.grabbed = 'body';
    // Only reset drag origin if this is the first move
    if (state.sweep.draggedUnits === 0) {
      state.sweeper.dragOrigin = { ...pt };
      rememberSWEEP(state);
    }
  }
}

export function mouseDragSWEEP(pt: Point, state: AppState): void {
  if (state.sweeper.grabbed === 'body') {
    draggingSWEEP(pt, state);
  }
}

export function stopDragSWEEP(state: AppState): void {
  state.sweeper.grabbed = 'done';
}

function draggingSWEEP(pt: Point, state: AppState): void {
  const { sweeper, sweep, grid: g } = state;
  const delx = pt.x - sweeper.dragOrigin.x;
  const dely = pt.y - sweeper.dragOrigin.y;

  let changedDirection = false;
  const wasVertical = sweep.dragIsVertical;

  if (Math.abs(delx) > Math.abs(dely)) {
    sweep.dragIsVertical = false;
  } else {
    sweep.dragIsVertical = true;
  }

  if (sweep.dragIsVertical !== wasVertical) changedDirection = true;

  // Override: a vertical sweeper must sweep horizontally, and vice versa
  if (sweeper.olds1.x === sweeper.olds2.x && sweeper.olds1.y !== sweeper.olds2.y) {
    sweep.dragIsVertical = false;
  } else if (sweeper.olds1.y === sweeper.olds2.y && sweeper.olds1.x !== sweeper.olds2.x) {
    sweep.dragIsVertical = true;
  }

  let wantToDragSubUnits: number;
  let new1: Point, new2: Point;

  if (sweep.dragIsVertical) {
    wantToDragSubUnits = Math.round(g.vSubTicks * dely / g.ticht);
    new1 = { x: sweeper.olds1.x, y: sweeper.olds1.y + wantToDragSubUnits };
    new2 = { x: sweeper.olds2.x, y: sweeper.olds2.y + wantToDragSubUnits };
  } else {
    wantToDragSubUnits = Math.round(g.hSubTicks * delx / g.ticwid);
    new1 = { x: sweeper.olds1.x + wantToDragSubUnits, y: sweeper.olds1.y };
    new2 = { x: sweeper.olds2.x + wantToDragSubUnits, y: sweeper.olds2.y };
  }

  const maxX = g.hticks * g.hSubTicks;
  const maxY = g.vticks * g.vSubTicks;

  if (new1.x >= 0 && new1.x <= maxX && new1.y >= 0 && new1.y <= maxY &&
      new2.x >= 0 && new2.x <= maxX && new2.y >= 0 && new2.y <= maxY) {
    sweeper.s1end = new1;
    sweeper.s2end = new2;
    sweep.draggedUnits = wantToDragSubUnits;
  } else if (changedDirection) {
    sweep.dragIsVertical = !sweep.dragIsVertical;
  }
}

// ----------------------------------------------------------------
// Area calculation
// ----------------------------------------------------------------

export function getAreaString(state: AppState): string {
  const { sweep, grid: g } = state;
  const len  = getSweeperLength(state);
  const area = Math.abs(len * sweep.draggedUnits);
  let result = String(area);
  if (g.hSubTicks > 1 || g.vSubTicks > 1) {
    result += ` / ${g.hSubTicks * g.vSubTicks} `;
  }
  return result;
}

export function getAreaUnitsString(state: AppState): string {
  const { grid: g } = state;
  if (g.hunits === g.vunits) {
    return g.hunits + '²';      // e.g. "in²"
  }
  return g.hunits + '·' + g.vunits;  // e.g. "in·cm"
}

function getSweeperLength(state: AppState): number {
  const { sweeper, sweep } = state;
  return sweep.dragIsVertical
    ? Math.abs(sweeper.s1end.x - sweeper.s2end.x)
    : Math.abs(sweeper.s1end.y - sweeper.s2end.y);
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function px(pt: Point, g: ReturnType<typeof import('./state.ts')['makeDefaultState']>['grid']): Point {
  return { x: getXForHSubTick(pt.x, g), y: getYForVSubTick(pt.y, g) };
}

function inMiddle(pt: Point, state: AppState): boolean {
  const { sweeper, grid: g } = state;
  const px1 = { x: getXForHSubTick(sweeper.s1end.x, g), y: getYForVSubTick(sweeper.s1end.y, g) };
  const px2 = { x: getXForHSubTick(sweeper.s2end.x, g), y: getYForVSubTick(sweeper.s2end.y, g) };
  const mid = { x: Math.round((px1.x + px2.x) / 2), y: Math.round((px1.y + px2.y) / 2) };
  const dx = pt.x - mid.x, dy = pt.y - mid.y;
  return (dx * dx + dy * dy) < 2 * state.sweeper.dragThreshold;
}

function rememberSWEEP(state: AppState): void {
  const { sweeper } = state;
  sweeper.olds1 = { ...sweeper.s1end };
  sweeper.olds2 = { ...sweeper.s2end };
}
