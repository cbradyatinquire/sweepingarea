// Mode management — toolbar drawing, event routing, mode transitions.
// Replaces Dart's pause/resume StreamSubscription pattern with a single
// dispatcher per event type that routes based on state.mode.

import type { AppState, Point } from './state.ts';
import { drawSETUP, startDragSETUP, mouseDragSETUP, stopDragSETUP, drawHotspots } from './setup.ts';
import { drawSWEEP, startDragSWEEP, mouseDragSWEEP, stopDragSWEEP, getAreaString, getAreaUnitsString } from './sweep.ts';
import { drawCUT, startDragCUT, mouseDragCUT, stopDragCUT, enterCutMode, resetCut,
         enterCutAllPreview, enterCustomCut, enterRearrangeFromCustom, backFromRearrange,
         toggleRotation, toggleReflection } from './cut.ts';
import { drawCAVALIERI, enterCavalieriMode, startDragCAV, mouseDragCAV, stopDragCAV,
         scheduleFall, stopFallTimer, buildCavPiece, getCavAreaString } from './cavalieri.ts';
import { drawGEO, startDragGEO, mouseDragGEO, stopDragGEO,
         enterCutFromGeoboard, resetGeoboard } from './geoboard.ts';

// ----------------------------------------------------------------
// Toolbar images (loaded once at startup)
// ----------------------------------------------------------------

import rightButtonSrc   from '../public/images/rightImage.jpg';
import leftButtonSrc    from '../public/images/leftImage.jpg';
import forkedButtonSrc  from '../public/images/forkedRightImage.jpg';
import tiltButtonSrc    from '../public/images/cavalieri.png';
import rotateUpSrc      from '../public/images/rotateUp.png';
import rotateDownSrc    from '../public/images/rotateDown.png';
import reflectUpSrc     from '../public/images/reflectUp.png';
import reflectDownSrc   from '../public/images/reflectDown.png';
const rightButton    = new Image();  rightButton.src    = rightButtonSrc;
const leftButton     = new Image();  leftButton.src     = leftButtonSrc;
const forkedButton   = new Image();  forkedButton.src   = forkedButtonSrc;
const tiltButton     = new Image();  tiltButton.src     = tiltButtonSrc;
const rotateUpBtn    = new Image();  rotateUpBtn.src    = rotateUpSrc;
const rotateDownBtn  = new Image();  rotateDownBtn.src  = rotateDownSrc;
const reflectUpBtn   = new Image();  reflectUpBtn.src   = reflectUpSrc;
const reflectDownBtn = new Image();  reflectDownBtn.src = reflectDownSrc;

// ----------------------------------------------------------------
// Toolbar drawing
// ----------------------------------------------------------------


const CAPTIONS = [
  'Click to start!',
  'Set up Sweeper & Units',
  'Drag to Sweep',
  'Click to Cut; Drag to Arrange',
  'Tilt to Sweep Down',
  'Drag vertices · click edge to add · Done when ready',
  'Click to Rotate; Drag to Arrange',
];

export function drawTools(tools: HTMLCanvasElement, state: AppState): void {
  const ctx = tools.getContext('2d')!;
  ctx.clearRect(0, 0, tools.width, tools.height);

  const imht   = tools.height;
  let   imwid  = 2 * imht;
  if (tools.width < 4.5 * tools.height) {
    imwid = Math.round((2 / 4.5) * tools.width);
  }
  const lbound = imwid;  // right edge of left arrow zone

  // Caption
  ctx.fillStyle = '#000';
  ctx.font = `italic 20pt Calibri, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let caption = CAPTIONS[state.mode] ?? '';
  if (state.mode === 2 && state.sweep.draggedUnits !== 0) {
    caption = state.sweep.showArea
      ? `Area swept: ${getAreaString(state)} ${getAreaUnitsString(state)}`
      : 'Area swept';
  }
  if (state.mode === 4) {
    if (state.cavalieri.height === 0) {
      caption = 'Drag to choose fall direction';
    } else if (state.sweep.showArea) {
      caption = `Area: ${getCavAreaString(state)} ${state.grid.hunits}²`;
    } else {
      caption = 'Area swept';
    }
  }
  if (state.mode === 3) {
    if (state.cut.subMode === 'choose')    caption = 'Cut on grid  ↑  or  ↓  Cut your own';
    if (state.cut.subMode === 'cutAll')    caption = 'Click the shape to cut on grid';
    if (state.cut.subMode === 'custom')    caption = 'Drag lines · ✂ to cut · → when done';
    if (state.cut.subMode === 'rearrange') {
      if (state.cut.animating) {
        caption = 'Rotating…';
      } else if (state.cut.doingRotation) {
        caption = state.cut.rotationPieceIndex === -1
          ? 'Click a shape to rotate'
          : 'Click center of rotation';
      } else if (state.cut.doingReflection) {
        if (state.cut.mirrorActive === 'none') {
          caption = 'Drag a mirror line to position · release to lock';
        } else {
          caption = 'Click a shape to reflect';
        }
      } else if (state.cut.showArea && state.cut.areaString) {
        caption = `Area: ${state.cut.areaString}`;
      } else {
        caption = 'Arrange, rotate & reflect pieces';
      }
    }
  }
  // Centre caption in the available space between left arrow and rightmost button.
  // In rearrange mode both rotate + reflect buttons occupy the two right slots.
  const rightmostButton = (state.mode === 3 && state.cut.subMode === 'rearrange' && !state.cut.animating)
    ? tools.width - 2 * imwid   // reflect button is second-from-right
    : tools.width - imwid;       // only right arrow present
  const captionCx = Math.round((lbound + rightmostButton) / 2);
  ctx.fillText(caption, captionCx, imht / 2);

  // Left arrow (modes 2+; mode 1 has nowhere to go back to)
  if (state.mode > 1 && !state.cut.animating) {
    ctx.drawImage(leftButton, 0, 0, imwid, imht);
  }

  // Right arrow
  if (state.mode === 1 && state.sweeper.readyToGoOn) {
    ctx.drawImage(rightButton, tools.width - imwid, 0, imwid, imht);
  }
  if (state.mode === 1 && state.sweeper.readyToGoOn) {
    ctx.drawImage(rightButton, tools.width - imwid, 0, imwid, imht);
    // Horizontal sweeper → Tilt button at second-from-right slot, smaller with label
    if (state.sweeper.s1end.y === state.sweeper.s2end.y) {
      const tw = Math.round(imwid * 0.6);
      const th = Math.round(imht  * 0.6);
      const tx = tools.width - 2 * imwid + Math.round((imwid - tw) / 2);
      const ty = Math.round((imht - th) / 2);
      ctx.drawImage(tiltButton, tx, ty, tw, th);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(imht * 0.35)}px Calibri, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Tilt', tx + tw / 2, ty + th / 2);
    }
  }
  if (state.mode === 2 && state.sweep.draggedUnits !== 0) {
    ctx.drawImage(rightButton, tools.width - imwid, 0, imwid, imht);
  }
  if (state.mode === 4 && state.cavalieri.t1s.length > 1) {
    ctx.drawImage(rightButton, tools.width - imwid, 0, imwid, imht);
  }
  if (state.mode === 5) {
    // Done button (right slot)
    ctx.drawImage(rightButton, tools.width - imwid, 0, imwid, imht);
    // Reset button (second-from-right slot) — draw as text label over arrow shape
    const tw = Math.round(imwid * 0.8);
    const th = Math.round(imht  * 0.8);
    const tx = tools.width - 2 * imwid + Math.round((imwid - tw) / 2);
    const ty = Math.round((imht - th) / 2);
    ctx.fillStyle = '#888';
    ctx.fillRect(tx, ty, tw, th);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(imht * 0.35)}px Calibri, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Reset', tx + tw / 2, ty + th / 2);
  }
  if (state.mode === 3 && state.cut.subMode === 'choose') {
    ctx.drawImage(forkedButton, tools.width - imwid, 0, imwid, imht);
  }
  if (state.mode === 3 && state.cut.subMode === 'custom') {
    ctx.drawImage(rightButton, tools.width - imwid, 0, imwid, imht);
  }
  if (state.mode === 3 && state.cut.subMode === 'rearrange' && !state.cut.animating) {
    const rotBtn = state.cut.doingRotation ? rotateDownBtn : rotateUpBtn;
    ctx.drawImage(rotBtn, tools.width - imwid, 0, imwid, imht);
    const refBtn = state.cut.doingReflection ? reflectDownBtn : reflectUpBtn;
    ctx.drawImage(refBtn, tools.width - 2 * imwid, 0, imwid, imht);
  }

  // Area toggle: clicking centre of toolbar in Sweep mode shows/hides number
  // (handled in testSwitchMode)
}

// ----------------------------------------------------------------
// Main canvas event dispatcher
// ----------------------------------------------------------------

function getPoint(e: MouseEvent): Point {
  const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function getTouchPoint(e: TouchEvent, canv: HTMLCanvasElement): Point {
  const rect = canv.getBoundingClientRect();
  const t = e.changedTouches[0];
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

export function onCanvasMouseDown(
  e: MouseEvent, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement
): void {
  const pt = getPoint(e);
  if (state.mode === 1) startDragSETUP(pt, state);
  if (state.mode === 2) startDragSWEEP(pt, state);
  if (state.mode === 3) startDragCUT(pt, state, canv, tools, redraw);
  if (state.mode === 4) startDragCAV(pt, state);
  if (state.mode === 5) startDragGEO(pt, state);
  redraw(canv, tools, state);
}

export function onCanvasMouseMove(
  e: MouseEvent, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement
): void {
  const pt = getPoint(e);
  if (state.mode === 1) mouseDragSETUP(pt, state);
  if (state.mode === 2) mouseDragSWEEP(pt, state);
  if (state.mode === 3) mouseDragCUT(pt, state);
  if (state.mode === 4) mouseDragCAV(pt, state);
  if (state.mode === 5) mouseDragGEO(pt, state);
  redraw(canv, tools, state);
}

export function onCanvasMouseUp(
  e: MouseEvent, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement
): void {
  if (state.mode === 1) stopDragSETUP(state);
  if (state.mode === 2) stopDragSWEEP(state);
  if (state.mode === 3) stopDragCUT(state);
  if (state.mode === 4) stopDragCAV(state);
  if (state.mode === 5) stopDragGEO(getPoint(e), state);
  redraw(canv, tools, state);
}

export function onCanvasTouchStart(
  e: TouchEvent, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement
): void {
  e.preventDefault();
  const pt = getTouchPoint(e, canv);
  if (state.mode === 1) startDragSETUP(pt, state);
  if (state.mode === 2) startDragSWEEP(pt, state);
  if (state.mode === 3) startDragCUT(pt, state, canv, tools, redraw);
  if (state.mode === 4) startDragCAV(pt, state);
  if (state.mode === 5) startDragGEO(pt, state);
  redraw(canv, tools, state);
}

export function onCanvasTouchMove(
  e: TouchEvent, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement
): void {
  e.preventDefault();
  const pt = getTouchPoint(e, canv);
  if (state.mode === 1) mouseDragSETUP(pt, state);
  if (state.mode === 2) mouseDragSWEEP(pt, state);
  if (state.mode === 3) mouseDragCUT(pt, state);
  if (state.mode === 4) mouseDragCAV(pt, state);
  if (state.mode === 5) mouseDragGEO(pt, state);
  redraw(canv, tools, state);
}

export function onCanvasTouchEnd(
  e: TouchEvent, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement
): void {
  e.preventDefault();
  const pt = getTouchPoint(e, canv);
  if (state.mode === 1) stopDragSETUP(state);
  if (state.mode === 2) stopDragSWEEP(state);
  if (state.mode === 3) stopDragCUT(state);
  if (state.mode === 4) stopDragCAV(state);
  if (state.mode === 5) stopDragGEO(pt, state);
  redraw(canv, tools, state);
}

// ----------------------------------------------------------------
// Toolbar click dispatcher
// ----------------------------------------------------------------

export function onToolsMouseDown(
  e: MouseEvent, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement
): void {
  const pt = getPoint(e);
  testSwitchMode(pt, state, canv, tools);
}

function testSwitchMode(
  pt: Point, state: AppState,
  canv: HTMLCanvasElement, tools: HTMLCanvasElement
): void {
  const imwid  = Math.min(2 * tools.height, Math.round((2 / 4.5) * tools.width));
  const rbound = tools.width - imwid;
  const lbound = imwid;

  if (pt.x > rbound) {
    // Right arrow area
    if (state.mode === 5) {
      enterCutFromGeoboard(state);
    } else if (state.mode === 1 && state.sweeper.readyToGoOn) {
      enterSweepMode(state);
    } else if (state.mode === 2 && state.sweep.draggedUnits !== 0) {
      enterCutMode(state);
      state.mode = 3;
    } else if (state.mode === 4 && state.cavalieri.t1s.length > 1) {
      // Cavalieri → Cut using the trail as the shape
      stopFallTimer();
      const piece = buildCavPiece(state);
      piece.color = { r: 136, g: 136, b: 255, a: 0.5 };
      state.cut.pieces = [piece];
      state.cut.originalPieces = [piece.copy()];
      state.cut.subMode = 'choose';
      state.cut.draggingPiece = null;
      state.cut.cameFromCustom = false;
      state.sweep.hasCut = false;
      const g = state.grid;
      state.cut.handleX   = g.hticks * g.hSubTicks - 1;
      state.cut.handleY   = g.vticks * g.vSubTicks - 1;
      state.cut.mirrorX   = g.hticks * g.hSubTicks - 1;
      state.cut.mirrorY   = g.vticks * g.vSubTicks - 1;
      state.cut.showArea  = false;
      state.cut.areaString = `${getCavAreaString(state)} ${state.grid.hunits}²`;
      state.mode = 3;
    } else if (state.mode === 3 && state.cut.subMode === 'choose') {
      // Forked arrow: top half = cut on grid, bottom half = cut your own
      if (pt.y < tools.height / 2) {
        enterCutAllPreview(state);
      } else {
        enterCustomCut(state);
      }
    } else if (state.mode === 3 && state.cut.subMode === 'custom') {
      enterRearrangeFromCustom(state);
    } else if (state.mode === 3 && state.cut.subMode === 'rearrange' && !state.cut.animating) {
      toggleRotation(state);
    }
  } else if (pt.x > tools.width - 2 * imwid && pt.x <= tools.width - imwid) {
    // Second-from-right slot
    if (state.mode === 5) {
      resetGeoboard(state);
    } else if (state.mode === 1
        && state.sweeper.readyToGoOn
        && state.sweeper.s1end.y === state.sweeper.s2end.y) {
      // Tilt button → Cavalieri
      enterCavalieriMode(state);
      scheduleFall(state, canv, tools, redraw);
    } else if (state.mode === 3 && state.cut.subMode === 'rearrange' && !state.cut.animating) {
      // Reflect button
      toggleReflection(state);
    }
  } else if (pt.x < lbound) {
    // Left arrow
    if (state.mode === 4) {
      // Back from Cavalieri → restore sweeper to starting position, return to Setup
      stopFallTimer();
      const cav = state.cavalieri;
      if (cav.t1s.length > 0) {
        state.sweeper.s1end = { ...cav.t1s[0] };
        state.sweeper.s2end = { ...cav.t2s[0] };
        state.sweeper.olds1 = { ...cav.t1s[0] };
        state.sweeper.olds2 = { ...cav.t2s[0] };
      }
      state.sweeper.readyToGoOn = true;
      state.mode = 1;
    } else if (state.mode === 2) {
      enterSetupFromSweep(state);
    } else if (state.mode === 3) {
      if (state.cut.subMode === 'rearrange') {
        backFromRearrange(state);
      } else if (state.cut.subMode === 'custom' || state.cut.subMode === 'cutAll') {
        resetCut(state);
      } else {
        // 'choose': go back to where we came from
        state.mode = state.cut.cameFromGeoboard ? 5 : 2;
      }
    }
  } else {
    // Centre of toolbar
    if (state.mode === 2 && state.sweep.draggedUnits !== 0) {
      state.sweep.showArea = !state.sweep.showArea;
    } else if (state.mode === 3 && state.cut.subMode === 'rearrange'
               && !state.cut.doingRotation && !state.cut.doingReflection
               && !state.cut.animating && state.cut.areaString) {
      state.cut.showArea = !state.cut.showArea;
    }
  }

  redraw(canv, tools, state);
}

function enterSweepMode(state: AppState): void {
  state.mode = 2;
  state.sweeper.grabbed = 'none';
  state.sweep.draggedUnits = 0;
  state.sweep.hasCut = false;
  state.sweep.showArea = false;
  // Remember sweeper position as drag baseline
  state.sweeper.olds1 = { ...state.sweeper.s1end };
  state.sweeper.olds2 = { ...state.sweeper.s2end };
}

function enterSetupFromSweep(state: AppState): void {
  // Restore sweeper to its pre-sweep position
  const { sweeper, sweep } = state;
  if (sweep.dragIsVertical) {
    sweeper.s1end = { x: sweeper.s1end.x, y: sweeper.s1end.y - sweep.draggedUnits };
    sweeper.s2end = { x: sweeper.s2end.x, y: sweeper.s2end.y - sweep.draggedUnits };
  } else {
    sweeper.s1end = { x: sweeper.s1end.x - sweep.draggedUnits, y: sweeper.s1end.y };
    sweeper.s2end = { x: sweeper.s2end.x - sweep.draggedUnits, y: sweeper.s2end.y };
  }
  sweep.draggedUnits = 0;
  sweeper.grabbed = 'none';
  sweeper.readyToGoOn = true;
  state.mode = 1;
}

// ----------------------------------------------------------------
// Central redraw — calls the right draw function for the current mode
// ----------------------------------------------------------------

export function redraw(canv: HTMLCanvasElement, tools: HTMLCanvasElement, state: AppState): void {
  if (state.mode === 1) {
    drawSETUP(canv, tools, state);
    const ctx = canv.getContext('2d')!;
    drawHotspots(ctx, state);
  } else if (state.mode === 2) {
    drawSWEEP(canv, state);
  } else if (state.mode === 3) {
    drawCUT(canv, state);
  } else if (state.mode === 4) {
    drawCAVALIERI(canv, state);
  } else if (state.mode === 5) {
    drawGEO(canv, state);
  }
  drawTools(tools, state);
}
