// Coordinate conversion between grid (tick) space and pixel (canvas) space.
// See ARCHITECTURE.md §4 for a full explanation of the two systems.
//
// Grid coordinates: origin = top-left of the ruled area, unit = one sub-tick.
// Pixel coordinates: origin = top-left of the canvas element, unit = one pixel.
//
// All Piece vertices are stored in grid coordinates.
// All canvas drawing calls use pixel coordinates.

import type { GridState } from './state.ts';

// Grid → pixel

export function getXForHTick(i: number, g: GridState): number {
  return g.hoff + Math.round(i * g.ticwid);
}

export function getXForHSubTick(i: number, g: GridState): number {
  return g.hoff + Math.round(i * g.ticwid / g.hSubTicks);
}

export function getYForVTick(j: number, g: GridState): number {
  return g.voff + Math.round(j * g.ticht);
}

export function getYForVSubTick(j: number, g: GridState): number {
  return g.voff + Math.round(j * g.ticht / g.vSubTicks);
}

// Pixel → grid (float — not snapped)

export function getGridCoordForPixelH(px: number, g: GridState): number {
  return g.hSubTicks * (px - g.hoff) / g.ticwid;
}

export function getGridCoordForPixelV(py: number, g: GridState): number {
  return g.vSubTicks * (py - g.voff) / g.ticht;
}

// Pixel → grid (snapped to nearest sub-tick)

export function getSubTickCoordForPixelH(px: number, g: GridState): number {
  return Math.round(g.hSubTicks * (px - g.hoff) / g.ticwid);
}

export function getSubTickCoordForPixelV(py: number, g: GridState): number {
  return Math.round(g.vSubTicks * (py - g.voff) / g.ticht);
}

// Recalculate derived grid fields after canvas resize or tick-count change.
// Both axes are calculated independently — the locked/square relationship is
// re-applied explicitly via makeVEqualToH / makeHEqualToV, not automatically
// on every resize. This matches the Dart original's behaviour.
export function adjustDimensions(canv: HTMLCanvasElement, g: GridState): void {
  g.hrulerwidth = canv.width - g.hoff;
  g.vrulerheight = canv.height - g.voff;
  g.ticwid = g.hrulerwidth / g.hticks;
  g.ticht = g.vrulerheight / g.vticks;
}

// Make V tick size match H: sets ticht = ticwid, recalculates vticks to fill height.
// Used at startup and when user re-applies "same units" from the V-axis dialog.
export function makeVEqualToH(g: GridState): void {
  g.ticht  = g.ticwid;
  g.vticks = g.vrulerheight / g.ticht;
}

// Make H tick size match V: sets ticwid = ticht, recalculates hticks to fill width.
// Used when user re-applies "same units" from the H-axis dialog.
export function makeHEqualToV(g: GridState): void {
  g.ticwid  = g.ticht;
  g.hticks  = g.hrulerwidth / g.ticwid;
}
