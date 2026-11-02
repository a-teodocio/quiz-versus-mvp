// Regenerates the fake pictures under content/images/. Every picture is a few flat shapes, so it
// holds no real course material (the repo is public) and a question about it has one clear answer.
//
//   node scripts/make-content-images.mjs
//
// What each picture shows (the questions in content/quizzes/ are written against this):
//   demo-1001/feather-bands.png      five horizontal bands, top to bottom: red, orange, yellow, green, blue
//   demo-1001/flock-silhouettes.png  six triangles in a row; the fourth is orange, the rest teal
//   demo-1001/perch-labelled.png     three circles marked A, B, C: red, blue, green
//   demo-1001/nest-eggs.png          a brown nest with three pale eggs
//   demo-2002/strata-layers.png      four layers, top to bottom: sand, grey, red, black
//   demo-2002/crystal-grid.png       a 3 by 3 grid of squares; the centre one is purple, the rest blue
//   demo-2002/sample-tray.png        four circles marked A to D: blue, green, yellow, red
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { createCanvas, encodePng } from './png.mjs';

const WIDTH = 480;
const HEIGHT = 320;
const outDir = join(import.meta.dirname, '..', 'content', 'images');

const COLOURS = {
  white: [250, 250, 250],
  black: [20, 20, 20],
  red: [214, 40, 40],
  orange: [244, 140, 20],
  yellow: [240, 210, 30],
  green: [40, 160, 70],
  blue: [40, 90, 210],
  teal: [20, 150, 160],
  purple: [130, 60, 180],
  sand: [222, 200, 150],
  grey: [140, 140, 150],
  brown: [120, 80, 40],
  egg: [245, 236, 215],
};

const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
};

function setPixel(canvas, x, y, rgb) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  canvas.pixels.set(rgb, (y * canvas.width + x) * 3);
}

function rect(canvas, x, y, width, height, colour) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) setPixel(canvas, col, row, COLOURS[colour]);
  }
}

function circle(canvas, cx, cy, radius, colour) {
  for (let row = cy - radius; row <= cy + radius; row++) {
    for (let col = cx - radius; col <= cx + radius; col++) {
      if ((col - cx) ** 2 + (row - cy) ** 2 <= radius ** 2) {
        setPixel(canvas, col, row, COLOURS[colour]);
      }
    }
  }
}

/** An upward triangle whose base is `width` wide and sits on row `bottom`. */
function triangle(canvas, centreX, bottom, width, height, colour) {
  for (let step = 0; step < height; step++) {
    const half = Math.round((width / 2) * ((step + 1) / height));
    rect(canvas, centreX - half, bottom - height + step, half * 2, 1, colour);
  }
}

function letter(canvas, name, x, y, scale) {
  GLYPHS[name].forEach((line, row) => {
    [...line].forEach((cell, col) => {
      if (cell === '#') rect(canvas, x + col * scale, y + row * scale, scale, scale, 'black');
    });
  });
}

/** Circles in a row, each with its letter above it. */
function labelledCircles(canvas, circles) {
  const gap = WIDTH / (circles.length + 1);
  circles.forEach(([name, colour], at) => {
    const cx = Math.round(gap * (at + 1));
    letter(canvas, name, cx - 15, 60, 6);
    circle(canvas, cx, 200, 45, colour);
  });
}

const blank = (colour) => createCanvas(WIDTH, HEIGHT, COLOURS[colour]);

const pictures = {
  'demo-1001/feather-bands.png': () => {
    const canvas = blank('white');
    ['red', 'orange', 'yellow', 'green', 'blue'].forEach((colour, at) =>
      rect(canvas, 0, at * 64, WIDTH, 64, colour),
    );
    return canvas;
  },
  'demo-1001/flock-silhouettes.png': () => {
    const canvas = blank('white');
    for (let at = 0; at < 6; at++) {
      triangle(canvas, 40 + at * 80, 220, 56, 80, at === 3 ? 'orange' : 'teal');
    }
    return canvas;
  },
  'demo-1001/perch-labelled.png': () => {
    const canvas = blank('white');
    labelledCircles(canvas, [
      ['A', 'red'],
      ['B', 'blue'],
      ['C', 'green'],
    ]);
    return canvas;
  },
  'demo-1001/nest-eggs.png': () => {
    const canvas = blank('white');
    rect(canvas, 90, 190, 300, 70, 'brown');
    [190, 240, 290].forEach((cx) => circle(canvas, cx, 180, 26, 'egg'));
    return canvas;
  },
  'demo-2002/strata-layers.png': () => {
    const canvas = blank('white');
    ['sand', 'grey', 'red', 'black'].forEach((colour, at) =>
      rect(canvas, 0, at * 80, WIDTH, 80, colour),
    );
    return canvas;
  },
  'demo-2002/crystal-grid.png': () => {
    const canvas = blank('white');
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const colour = row === 1 && col === 1 ? 'purple' : 'blue';
        rect(canvas, 90 + col * 110, 10 + row * 100, 90, 80, colour);
      }
    }
    return canvas;
  },
  'demo-2002/sample-tray.png': () => {
    const canvas = blank('white');
    labelledCircles(canvas, [
      ['A', 'blue'],
      ['B', 'green'],
      ['C', 'yellow'],
      ['D', 'red'],
    ]);
    return canvas;
  },
};

for (const [name, draw] of Object.entries(pictures)) {
  const file = join(outDir, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(draw()));
  stdout.write(`wrote content/images/${name}\n`);
}
