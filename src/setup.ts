// Setup mode (Mode 1) — ported from setup.dart and relevant parts of sweeps.dart.
// Handles: sweeper display and dragging, ruler hotspot dragging, unit dialog.

import type { AppState, Point } from './state.ts';
import type { GridState } from './state.ts';
import {
  getXForHSubTick, getYForVSubTick,
  getSubTickCoordForPixelH, getSubTickCoordForPixelV,
  adjustDimensions, makeHEqualToV, makeVEqualToH,
} from './coords.ts';
import { drawGridAndRulers } from './grid.ts';

// Grid size limits (matches Dart maxhticks/minhticks etc.)
const MAX_HTICKS = 42;
const MIN_HTICKS = 2;
const MAX_VTICKS = 32;
const MIN_VTICKS = 2;

// ----------------------------------------------------------------
// Hotspot positions — recomputed each draw (like Dart's hhots/vhots)
// ----------------------------------------------------------------

function hhots(g: GridState): Point {
  return { x: Math.round(g.hoff + g.ticwid), y: g.voff - 25 };
}

function vhots(g: GridState): Point {
  return { x: g.hoff - 25, y: Math.round(g.voff + g.ticht) };
}

function sqDist(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

// ----------------------------------------------------------------
// Draw
// ----------------------------------------------------------------

export function drawSETUP(canv: HTMLCanvasElement, _tools: HTMLCanvasElement, state: AppState): void {
  adjustDimensions(canv, state.grid);
  const ctx = canv.getContext('2d')!;
  ctx.clearRect(0, 0, canv.width, canv.height);

  drawGridAndRulers(canv, state.grid);

  const { sweeper, grid } = state;
  const g = grid;

  if (sweeper.grabbed === 'horizontal' || sweeper.grabbed === 'vertical') {
    // While resizing the grid, show sweeper at its remembered pixel position
    drawSweeperLine(ctx, sweeper.oldpx2, sweeper.oldpx1, sweeper.grabbed, g);
  } else {
    const strt = { x: getXForHSubTick(sweeper.s1end.x, g), y: getYForVSubTick(sweeper.s1end.y, g) };
    const end  = { x: getXForHSubTick(sweeper.s2end.x, g), y: getYForVSubTick(sweeper.s2end.y, g) };
    drawSweeperLine(ctx, strt, end, sweeper.grabbed, g);
  }
}

function drawSweeperLine(
  ctx: CanvasRenderingContext2D,
  strt: Point,
  end: Point,
  grabbed: string,
  _g: GridState,
): void {
  // Main line
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(strt.x, strt.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.lineWidth = 1;

  const mid: Point = {
    x: Math.round((strt.x + end.x) / 2),
    y: Math.round((strt.y + end.y) / 2),
  };

  // Draw the three handle circles: s1end, s2end, middle
  const handles: Array<{ pt: Point; label: string }> = [
    { pt: strt, label: 's1end' },
    { pt: end,  label: 's2end' },
    { pt: mid,  label: 'middle' },
  ];

  for (const { pt, label } of handles) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 10, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.fillStyle = grabbed === label ? '#4C4' : '#999';
    ctx.fill();
  }
}

// Draw the ruler hotspot circles (called from grid.ts indirectly via drawSETUP)
export function drawHotspots(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { grid, sweeper } = state;
  const g = grid;

  // Horizontal hotspot — always shown in Setup mode
  const hh = hhots(g);
  ctx.beginPath();
  ctx.arc(hh.x, hh.y, 10, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.fillStyle = sweeper.grabbed === 'horizontal' ? '#4C4' : '#999';
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.stroke();

  // Vertical hotspot — only shown when units are NOT locked
  if (!g.unitsLocked) {
    const vh = vhots(g);
    ctx.beginPath();
    ctx.arc(vh.x, vh.y, 10, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = sweeper.grabbed === 'vertical' ? '#4C4' : '#999';
    ctx.fill();
    ctx.stroke();
  }
}

// ----------------------------------------------------------------
// Mouse / touch handlers
// ----------------------------------------------------------------

export function startDragSETUP(pt: Point, state: AppState): void {
  if (!handleUnitLabelClick(pt, state)) {
    initInteractionSETUP(pt, state);
  }
}

function initInteractionSETUP(pt: Point, state: AppState): void {
  const { sweeper, grid: g } = state;
  sweeper.readyToGoOn = true;

  const hh = hhots(g);
  const vh = vhots(g);

  if (!g.unitsLocked && sqDist(pt, vh) < sweeper.dragThreshold) {
    sweeper.grabbed = 'vertical';
    rememberSETUP(state);
  } else if (sqDist(pt, hh) < sweeper.dragThreshold) {
    sweeper.grabbed = 'horizontal';
    rememberSETUP(state);
  } else if (sqDist(pt, { x: getXForHSubTick(sweeper.s1end.x, g), y: getYForVSubTick(sweeper.s1end.y, g) }) < sweeper.dragThreshold) {
    sweeper.grabbed = 's1end';
  } else if (sqDist(pt, { x: getXForHSubTick(sweeper.s2end.x, g), y: getYForVSubTick(sweeper.s2end.y, g) }) < sweeper.dragThreshold) {
    sweeper.grabbed = 's2end';
  } else if (inMiddle(pt, state)) {
    sweeper.grabbed = 'middle';
    sweeper.dragOrigin = { ...pt };
    rememberSETUP(state);
  }
}

export function mouseDragSETUP(pt: Point, state: AppState): void {
  draggingSETUP(pt, state);
}

function draggingSETUP(pt: Point, state: AppState): void {
  const { sweeper, grid: g } = state;
  if (sweeper.grabbed === 'none') return;

  if (sweeper.grabbed === 'vertical') {
    const newTickH = Math.max(1, pt.y - g.voff);
    const newVTicks = Math.round(g.vrulerheight / newTickH);
    if (newVTicks !== g.vticks && newVTicks <= MAX_VTICKS && newVTicks >= MIN_VTICKS) {
      updateVSweepsSETUP(newVTicks, state);
      g.vticks = newVTicks;
      g.ticht = g.vrulerheight / g.vticks;
    }
  } else if (sweeper.grabbed === 'horizontal') {
    const newTickW = Math.max(1, pt.x - g.hoff);
    const newHTicks = Math.round(g.hrulerwidth / newTickW);
    if (newHTicks !== g.hticks && newHTicks <= MAX_HTICKS && newHTicks >= MIN_HTICKS) {
      updateHSweepsSETUP(newHTicks, state);
      g.hticks = newHTicks;
      g.ticwid = g.hrulerwidth / g.hticks;
      if (g.unitsLocked) {
        makeVEqualToH(g);
        ensureAllPointsAreOnscreen(state);
      }
    }
  } else if (sweeper.grabbed === 's1end') {
    sweeper.s1end = clampedSubTickPoint(pt, g);
  } else if (sweeper.grabbed === 's2end') {
    sweeper.s2end = clampedSubTickPoint(pt, g);
  } else if (sweeper.grabbed === 'middle') {
    updateWithShiftSETUP(pt, state);
  }
}

export function stopDragSETUP(state: AppState): void {
  state.sweeper.grabbed = 'none';
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function inMiddle(pt: Point, state: AppState): boolean {
  const { sweeper, grid: g } = state;
  const px1 = { x: getXForHSubTick(sweeper.s1end.x, g), y: getYForVSubTick(sweeper.s1end.y, g) };
  const px2 = { x: getXForHSubTick(sweeper.s2end.x, g), y: getYForVSubTick(sweeper.s2end.y, g) };
  const mid = { x: Math.round((px1.x + px2.x) / 2), y: Math.round((px1.y + px2.y) / 2) };
  return sqDist(pt, mid) < 2 * sweeper.dragThreshold;
}

function clampedSubTickPoint(pt: Point, g: GridState): Point {
  const nx = Math.min(Math.max(getSubTickCoordForPixelH(pt.x, g), 0), g.hticks * g.hSubTicks);
  const ny = Math.min(Math.max(getSubTickCoordForPixelV(pt.y, g), 0), g.vticks * g.vSubTicks);
  return { x: nx, y: ny };
}

function updateWithShiftSETUP(now: Point, state: AppState): void {
  const { sweeper, grid: g } = state;
  const delx = now.x - sweeper.dragOrigin.x;
  const dely = now.y - sweeper.dragOrigin.y;
  const shiftx = Math.round(g.hSubTicks * delx / g.ticwid);
  const shifty = Math.round(g.vSubTicks * dely / g.ticht);
  const new1 = { x: sweeper.olds1.x + shiftx, y: sweeper.olds1.y + shifty };
  const new2 = { x: sweeper.olds2.x + shiftx, y: sweeper.olds2.y + shifty };
  const maxX = g.hticks * g.hSubTicks;
  const maxY = g.vticks * g.vSubTicks;
  if (new1.x >= 0 && new1.x <= maxX && new1.y >= 0 && new1.y <= maxY &&
      new2.x >= 0 && new2.x <= maxX && new2.y >= 0 && new2.y <= maxY) {
    sweeper.s1end = new1;
    sweeper.s2end = new2;
  }
}

function updateHSweepsSETUP(newTicks: number, state: AppState): void {
  const { sweeper } = state;
  sweeper.s1end = { x: Math.round(sweeper.olds1.x / sweeper.oldhtix * newTicks), y: sweeper.s1end.y };
  sweeper.s2end = { x: Math.round(sweeper.olds2.x / sweeper.oldhtix * newTicks), y: sweeper.s2end.y };
}

function updateVSweepsSETUP(newTicks: number, state: AppState): void {
  const { sweeper } = state;
  sweeper.s1end = { x: sweeper.s1end.x, y: Math.round(sweeper.olds1.y / sweeper.oldvtix * newTicks) };
  sweeper.s2end = { x: sweeper.s2end.x, y: Math.round(sweeper.olds2.y / sweeper.oldvtix * newTicks) };
}

function rememberSETUP(state: AppState): void {
  const { sweeper, grid: g } = state;
  sweeper.olds1   = { ...sweeper.s1end };
  sweeper.olds2   = { ...sweeper.s2end };
  sweeper.oldpx1  = { x: getXForHSubTick(sweeper.s1end.x, g), y: getYForVSubTick(sweeper.s1end.y, g) };
  sweeper.oldpx2  = { x: getXForHSubTick(sweeper.s2end.x, g), y: getYForVSubTick(sweeper.s2end.y, g) };
  sweeper.oldhtix = g.hticks;
  sweeper.oldvtix = g.vticks;
}

function ensureAllPointsAreOnscreen(state: AppState): void {
  const { sweeper, grid: g } = state;
  const maxX = Math.floor(g.hticks) * g.hSubTicks;
  const maxY = Math.floor(g.vticks) * g.vSubTicks;
  if (sweeper.s1end.x > maxX) sweeper.s1end = { ...sweeper.s1end, x: maxX };
  if (sweeper.s2end.x > maxX) sweeper.s2end = { ...sweeper.s2end, x: maxX };
  if (sweeper.s1end.y > maxY) sweeper.s1end = { ...sweeper.s1end, y: maxY };
  if (sweeper.s2end.y > maxY) sweeper.s2end = { ...sweeper.s2end, y: maxY };
}

// ----------------------------------------------------------------
// Unit label click detection — opens the dialog
// ----------------------------------------------------------------

function handleUnitLabelClick(pt: Point, state: AppState): boolean {
  const g = state.grid;
  const hLabelX = g.hrulerwidth + g.hoff / 2;
  const hLabelY = 20;
  const vLabelX = 20;
  const vLabelY = g.vrulerheight + g.voff / 2;

  if (sqDist(pt, { x: hLabelX, y: hLabelY }) < 1100) {
    displayUnitDialog('horizontal', state);
    return true;
  }
  if (sqDist(pt, { x: vLabelX, y: vLabelY }) < 1100) {
    displayUnitDialog('vertical', state);
    return true;
  }
  return false;
}

// ----------------------------------------------------------------
// Unit dialog
// ----------------------------------------------------------------

export function displayUnitDialog(axis: 'horizontal' | 'vertical', state: AppState): void {
  const g = state.grid;
  const shortEl  = document.getElementById('unitshort')  as HTMLInputElement;
  const subdivEl = document.getElementById('subdiv')     as HTMLInputElement;
  const sliderEl = document.getElementById('sliderval')  as HTMLSpanElement;
  const sameEl   = document.getElementById('sameUnit')   as HTMLInputElement;
  const oppEl    = document.getElementById('oppDirection') as HTMLSpanElement;
  const popup    = document.getElementById('popupDiv')!;

  shortEl.value  = axis === 'horizontal' ? g.hunits : g.vunits;
  subdivEl.value = String(axis === 'horizontal' ? g.hSubTicks : g.vSubTicks);
  sliderEl.textContent = subdivEl.value;
  sameEl.checked = g.unitsLocked;
  oppEl.textContent = axis === 'horizontal' ? 'Vertical' : 'Horizontal';

  // Store which axis this dialog is for so the submit button knows
  popup.dataset['axis'] = axis;
  popup.style.visibility = 'visible';
}

export function submitUnitDialog(state: AppState, canv: HTMLCanvasElement, tools: HTMLCanvasElement): void {
  const g = state.grid;
  const popup    = document.getElementById('popupDiv')!;
  const axis     = popup.dataset['axis'] as 'horizontal' | 'vertical';
  const shortEl  = document.getElementById('unitshort')  as HTMLInputElement;
  const subdivEl = document.getElementById('subdiv')     as HTMLInputElement;
  const sameEl   = document.getElementById('sameUnit')   as HTMLInputElement;

  const newLabel   = shortEl.value.trim();
  const newSubdivs = parseInt(subdivEl.value, 10);

  if (axis === 'horizontal') {
    if (newLabel.length > 0) g.hunits = newLabel;
    const oldSubs = g.hSubTicks;
    g.hSubTicks = newSubdivs;
    // Rescale sweeper endpoints to new subdivision count
    const sw = state.sweeper;
    sw.s1end = { x: Math.round(sw.s1end.x / oldSubs * newSubdivs), y: sw.s1end.y };
    sw.s2end = { x: Math.round(sw.s2end.x / oldSubs * newSubdivs), y: sw.s2end.y };

    if (sameEl.checked || g.hunits === g.vunits) {
      makeHEqualToV(g);
      g.vunits = g.hunits;
      g.unitsLocked = true;
      ensureAllPointsAreOnscreen(state);
    } else {
      g.unitsLocked = false;
    }
  } else {
    if (newLabel.length > 0) g.vunits = newLabel;
    const oldSubs = g.vSubTicks;
    g.vSubTicks = newSubdivs;
    const sw = state.sweeper;
    sw.s1end = { x: sw.s1end.x, y: Math.round(sw.s1end.y / oldSubs * newSubdivs) };
    sw.s2end = { x: sw.s2end.x, y: Math.round(sw.s2end.y / oldSubs * newSubdivs) };

    if (sameEl.checked || g.hunits === g.vunits) {
      makeVEqualToH(g);
      g.hunits = g.vunits;
      g.unitsLocked = true;
      ensureAllPointsAreOnscreen(state);
    } else {
      g.unitsLocked = false;
    }
  }

  popup.style.visibility = 'hidden';
  drawSETUP(canv, tools, state);
}
