// Geoboard mode (Mode 5) — drag vertices of a polygon on a peg grid.
//
// Interaction:
//   mousedown near a vertex   → grab and drag it
//   mousedown on an edge      → insert a new vertex there, then drag it
//   mouseup                   → snap to nearest full tick; merge with adjacent
//                               vertex if coincident; revert on self-intersection
//
// All coordinates stored in sub-tick space (hSubTicks=1 default → same as ticks).
// Snapping is to full ticks only (no half-sub-tick snapping here).

import type { AppState, Point } from './state.ts';
import { Piece, copyPieces } from './piece.ts';
import { drawGridAndRulers } from './grid.ts';
import {
  getXForHSubTick, getYForVSubTick,
  getGridCoordForPixelH, getGridCoordForPixelV,
} from './coords.ts';

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

const GEO_COLOR   = { r: 136, g: 136, b: 255, a: 0.5 };
const PEG_RADIUS  = 5;   // pixels
const GRAB_RADIUS = 0.3; // tick units — how close a click must be to grab

// ----------------------------------------------------------------
// Mode entry
// ----------------------------------------------------------------

export function enterGeoboardMode(state: AppState): void {
  const g = state.grid;
  // Default starter triangle at (3,3)–(7,3)–(3,7) in tick coords.
  // Multiply by hSubTicks/vSubTicks to get sub-tick coords.
  const sx = g.hSubTicks;
  const sy = g.vSubTicks;
  const tri = new Piece([
    { x: 3 * sx, y: 3 * sy },
    { x: 7 * sx, y: 3 * sy },
    { x: 3 * sx, y: 7 * sy },
  ]);
  tri.color = { ...GEO_COLOR };
  state.cut.pieces = [tri];
  state.cut.originalPieces = copyPieces([tri]);
  state.geo.dragging = false;
  state.geo.originalPiece = null;
  state.mode = 5;
}

// Called when the student clicks "Done" — hands the geoboard polygon to cut mode.
export function enterCutFromGeoboard(state: AppState): void {
  const g = state.grid;
  const piece = state.cut.pieces[0];
  // Compute area via shoelace (in sub-tick² → convert to tick²)
  const area = shoelaceArea(piece.vertices) / (g.hSubTicks * g.vSubTicks);
  state.cut.originalPieces = copyPieces([piece]);
  state.cut.subMode = 'choose';
  state.cut.draggingPiece = null;
  state.cut.cutGrabbed = 'none';
  state.cut.cameFromCustom = false;
  state.cut.cameFromGeoboard = true;
  state.cut.showArea = false;
  state.cut.areaString = formatArea(area, state);
  state.cut.doingRotation = false;
  state.cut.rotationPieceIndex = -1;
  state.cut.hoverCenter = null;
  state.cut.animating = false;
  state.cut.animTargetPiece = null;
  state.cut.animCenter = null;
  state.cut.doingReflection = false;
  state.cut.reflectGrabbed = 'none';
  state.cut.mirrorActive = 'none';
  const maxX = g.hticks * g.hSubTicks;
  const maxY = g.vticks * g.vSubTicks;
  state.cut.handleX = Math.max(0, maxX - 1);
  state.cut.handleY = Math.max(0, maxY - 1);
  state.cut.mirrorX = Math.max(0, maxX - 1);
  state.cut.mirrorY = Math.max(0, maxY - 1);
  state.mode = 3;
}

// Reset geoboard polygon back to the starter triangle.
export function resetGeoboard(state: AppState): void {
  const g = state.grid;
  const sx = g.hSubTicks;
  const sy = g.vSubTicks;
  const tri = new Piece([
    { x: 3 * sx, y: 3 * sy },
    { x: 7 * sx, y: 3 * sy },
    { x: 3 * sx, y: 7 * sy },
  ]);
  tri.color = { ...GEO_COLOR };
  state.cut.pieces = [tri];
  state.cut.originalPieces = copyPieces([tri]);
  state.geo.dragging = false;
  state.geo.originalPiece = null;
}

// ----------------------------------------------------------------
// Drawing
// ----------------------------------------------------------------

export function drawGEO(canv: HTMLCanvasElement, state: AppState): void {
  const ctx = canv.getContext('2d')!;
  ctx.clearRect(0, 0, canv.width, canv.height);
  drawGridAndRulers(canv, state.grid);

  const g = state.grid;
  const piece = state.cut.pieces[0];
  if (!piece) return;

  piece.draw(ctx, g);

  // Draw pegs at each vertex
  for (let i = 0; i < piece.vertices.length; i++) {
    const v = piece.vertices[i];
    const px = getXForHSubTick(v.x, g);
    const py = getYForVSubTick(v.y, g);
    const isActive = state.geo.dragging && state.geo.vertexIndex === i;
    ctx.beginPath();
    ctx.arc(px, py, PEG_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? '#222' : '#999';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ----------------------------------------------------------------
// Event handlers
// ----------------------------------------------------------------

export function startDragGEO(pt: Point, state: AppState): void {
  if (state.geo.dragging) return;
  const piece = state.cut.pieces[0];
  if (!piece) return;
  const g = state.grid;

  const tickPt = pixelToTick(pt, g);

  // Try to grab an existing vertex
  for (let i = 0; i < piece.vertices.length; i++) {
    if (dist(piece.vertices[i], tickPt) < GRAB_RADIUS) {
      state.geo.dragging = true;
      state.geo.vertexIndex = i;
      state.geo.originalPiece = piece.copy();
      return;
    }
  }

  // Try to insert on an edge
  const len = piece.vertices.length;
  for (let i = 0; i < len; i++) {
    const v1 = piece.vertices[i];
    const v2 = piece.vertices[(i + 1) % len];
    if (isOnSegment(tickPt, v1, v2)) {
      state.geo.originalPiece = piece.copy();
      piece.vertices.splice(i + 1, 0, { ...tickPt });
      piece.setupSides();
      state.geo.dragging = true;
      state.geo.vertexIndex = i + 1;
      return;
    }
  }
}

export function mouseDragGEO(pt: Point, state: AppState): void {
  if (!state.geo.dragging) return;
  const piece = state.cut.pieces[0];
  if (!piece) return;
  const g = state.grid;

  const tickPt = pixelToTick(pt, g);
  // Move freely (no snap during drag, just like rubber band)
  if (doesNotSelfIntersect(piece, state.geo.vertexIndex, tickPt)) {
    piece.vertices[state.geo.vertexIndex] = { ...tickPt };
    piece.setupSides();
  }
}

export function stopDragGEO(pt: Point, state: AppState): void {
  if (!state.geo.dragging) return;
  const piece = state.cut.pieces[0];
  if (!piece) return;
  const g = state.grid;

  const tickPt = pixelToTick(pt, g);
  const snapped = snapToTick(tickPt, g);

  const idx = state.geo.vertexIndex;
  const len = piece.vertices.length;

  if (snapped && doesNotSelfIntersect(piece, idx, snapped)) {
    piece.vertices[idx] = snapped;

    // Merge with adjacent vertex if coincident
    const prev = (idx - 1 + len) % len;
    const next = (idx + 1) % len;
    if (len > 3 && dist(piece.vertices[prev], snapped) < 0.01) {
      piece.vertices.splice(prev < idx ? prev : idx, 1);
    } else if (len > 3 && dist(piece.vertices[next < len ? next : 0], snapped) < 0.01) {
      const delIdx = next < len ? next : 0;
      piece.vertices.splice(delIdx, 1);
    }

    piece.setupSides();
    piece.establishBoundingBox();
  } else {
    // Revert
    if (state.geo.originalPiece) {
      state.cut.pieces[0] = state.geo.originalPiece;
    }
  }

  state.geo.dragging = false;
  state.geo.vertexIndex = 0;
  state.geo.originalPiece = null;
}

// ----------------------------------------------------------------
// Geometry helpers
// ----------------------------------------------------------------

function pixelToTick(pt: Point, g: import('./state.ts').GridState): Point {
  return {
    x: getGridCoordForPixelH(pt.x, g),
    y: getGridCoordForPixelV(pt.y, g),
  };
}

function snapToTick(pt: Point, g: import('./state.ts').GridState): Point | null {
  const sx = g.hSubTicks;
  const sy = g.vSubTicks;
  // Snap to nearest full tick (integer multiples of hSubTicks in sub-tick space)
  const snappedX = Math.round(pt.x / sx) * sx;
  const snappedY = Math.round(pt.y / sy) * sy;
  // Clamp to grid bounds
  if (snappedX < 0 || snappedX > g.hticks * sx) return null;
  if (snappedY < 0 || snappedY > g.vticks * sy) return null;
  return { x: snappedX, y: snappedY };
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function isOnSegment(test: Point, v1: Point, v2: Point): boolean {
  if (dist(v1, test) < GRAB_RADIUS || dist(v2, test) < GRAB_RADIUS) return false;
  if (dist(v1, v2) < 0.0001) return false;

  // Check bounding box (with tolerance)
  const minX = Math.min(v1.x, v2.x) - GRAB_RADIUS;
  const maxX = Math.max(v1.x, v2.x) + GRAB_RADIUS;
  const minY = Math.min(v1.y, v2.y) - GRAB_RADIUS;
  const maxY = Math.max(v1.y, v2.y) + GRAB_RADIUS;
  if (test.x < minX || test.x > maxX || test.y < minY || test.y > maxY) return false;

  // Perpendicular distance from point to line
  const d = Math.abs(
    (v2.y - v1.y) * test.x - (v2.x - v1.x) * test.y + v2.x * v1.y - v2.y * v1.x
  ) / dist(v1, v2);
  return d < GRAB_RADIUS;
}

// Returns true if moving piece.vertices[index] to pt does not create self-intersection.
function doesNotSelfIntersect(piece: Piece, index: number, pt: Point): boolean {
  const verts = piece.vertices;
  const len = verts.length;
  if (len < 3) return true;

  const prev = (index - 1 + len) % len;
  const next = (index + 1) % len;

  // The two new edges: prev→pt and pt→next
  for (let j = 0; j < len; j++) {
    const a = verts[j];
    const b = verts[(j + 1) % len];

    // Skip edges that share the moved vertex
    if (j === prev || j === index || (j + 1) % len === index) continue;

    if (segmentsIntersect(verts[prev], pt, a, b)) return false;
    if (j === next || (j + 1) % len === next) continue;
    if (segmentsIntersect(pt, verts[next], a, b)) return false;
  }
  return true;
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function shoelaceArea(verts: Point[]): number {
  let sum = 0;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += verts[i].x * verts[j].y;
    sum -= verts[j].x * verts[i].y;
  }
  return Math.abs(sum) / 2;
}

function formatArea(area: number, state: AppState): string {
  const u = state.grid.hunits;
  return `${area % 1 === 0 ? area.toFixed(0) : area.toFixed(2)} ${u}²`;
}
