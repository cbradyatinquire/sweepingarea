// Grid and ruler drawing — ported from sweeps.dart (drawGrid, drawRulers,
// drawHorizontalAxis, drawVerticalAxis, drawVerticalText).

import type { GridState } from './state.ts';
import { getXForHTick, getYForVTick } from './coords.ts';

export function drawGridAndRulers(canv: HTMLCanvasElement, g: GridState): void {
  const ctx = canv.getContext('2d')!;
  drawGrid(ctx, canv, g);
  drawRulers(ctx, g);
}

function drawGrid(ctx: CanvasRenderingContext2D, canv: HTMLCanvasElement, g: GridState): void {
  // Major grid lines — dashed
  ctx.strokeStyle = '#222';
  ctx.beginPath();
  ctx.setLineDash([2]);

  for (let i = 0; i <= g.hticks; i++) {
    const x = getXForHTick(i, g);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canv.height);
  }
  for (let j = 0; j <= g.vticks; j++) {
    const y = getYForVTick(j, g);
    ctx.moveTo(0, y);
    ctx.lineTo(canv.width, y);
  }
  ctx.stroke();

  // Sub-tick grid lines — thinner, solid
  ctx.beginPath();
  ctx.strokeStyle = '#000';
  ctx.setLineDash([]);
  ctx.lineWidth = 0.2;

  for (let i = 0; i <= g.hticks; i++) {
    for (let j = 1; j < g.hSubTicks; j++) {
      const x = getXForHTick(i + j / g.hSubTicks, g);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canv.height);
    }
  }
  for (let j = 0; j <= g.vticks; j++) {
    for (let k = 1; k < g.vSubTicks; k++) {
      const y = getYForVTick(j + k / g.vSubTicks, g);
      ctx.moveTo(0, y);
      ctx.lineTo(canv.width, y);
    }
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
}

function drawRulers(ctx: CanvasRenderingContext2D, g: GridState): void {
  // Left (vertical) ruler strip
  ctx.beginPath();
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#FA7';
  ctx.rect(0, g.voff, 50, g.vrulerheight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  drawVerticalAxis(ctx, 50, g);

  // Top (horizontal) ruler strip
  ctx.beginPath();
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#FA7';
  ctx.rect(g.hoff, 0, g.hrulerwidth, 50);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  drawHorizontalAxis(ctx, 50, g);
}

function drawHorizontalAxis(ctx: CanvasRenderingContext2D, bott: number, g: GridState): void {
  const tsize = 30;
  ctx.beginPath();
  ctx.strokeStyle = '#000';

  for (let i = 0; i <= g.hticks; i++) {
    const x = getXForHTick(i, g);
    ctx.moveTo(x, bott);
    ctx.lineTo(x, bott - tsize);
    for (let j = 1; j < g.hSubTicks; j++) {
      const x1 = getXForHTick(i + j / g.hSubTicks, g);
      ctx.moveTo(x1, bott);
      ctx.lineTo(x1, bott - tsize / 2);
    }
  }
  ctx.closePath();
  ctx.stroke();

  // Unit label
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.font = 'italic 16pt sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(g.hunits, g.hrulerwidth + g.hoff / 2, 25);
}

function drawVerticalAxis(ctx: CanvasRenderingContext2D, right: number, g: GridState): void {
  const tsize = 30;
  ctx.beginPath();
  ctx.strokeStyle = '#000';

  for (let i = 0; i <= g.vticks; i++) {
    const y = getYForVTick(i, g);
    ctx.moveTo(right, y);
    ctx.lineTo(right - tsize, y);
    for (let k = 1; k < g.vSubTicks; k++) {
      const y1 = getYForVTick(i + k / g.vSubTicks, g);
      ctx.moveTo(right, y1);
      ctx.lineTo(right - tsize / 2, y1);
    }
  }
  ctx.closePath();
  ctx.stroke();

  // Unit label — rotated 90°
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.font = 'italic 16pt sans-serif';
  ctx.textAlign = 'left';
  ctx.save();
  ctx.translate(25, g.vrulerheight + g.voff - 10);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(g.vunits, 0, 0);
  ctx.restore();
}
