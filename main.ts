// news-image-20261121 — "Sum up 21 November's world news in one image"
// One 1024x1024 PNG drawn pixel by pixel with Node 22 stdlib only.
// It ships its own PNG encoder (zlib deflate + CRC32), its own 5x7
// bitmap alphabet, and flat vector-style scenes for each story.
// No network, no disk reads, no clock, no randomness: two runs
// produce byte-identical output.
//
// The five verified stories of Saturday 21 November 2026:
//   1. LEAD — M6.8 quake hits central Peru (Junin, Andes) at
//      01:09 UTC Sat 21 Nov; felt as far as Lima; no deaths,
//      no major damage, no tsunami threat.
//   2. NATO chief Mark Rutte arrives in Warsaw TODAY (21 Nov),
//      a day after Russian missiles landed in Poland (20 Nov).
//   3. Foreign investors pour a record Rs 1.22 lakh crore into
//      Indian equities over 2-20 Nov — biggest monthly inflow ever.
//   4. Paris braces for a cost-of-living march Sat 21 Nov 14:00;
//      70,000 police deployed across France.
//   5. KL Rahul scores 100 off 207 balls in Wellington, Sat 21 Nov
//      — first India opener with Test tons in all four SENA nations.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const SIDE = 1024;

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const INK: RGB = [24, 26, 34];
const PAPER: RGB = [255, 252, 243];
const CREAM: RGB = [244, 237, 220];
const NAVY: RGB = [13, 36, 62];
const NAVY2: RGB = [36, 66, 102];
const GOLD: RGB = [226, 176, 66];
const GOLD_D: RGB = [176, 128, 32];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [178, 44, 44];
const TEAL: RGB = [14, 104, 88];
const BLUE: RGB = [28, 96, 148];
const SKY: RGB = [126, 178, 214];
const GREEN: RGB = [44, 128, 64];
const ORANGE: RGB = [230, 110, 40];
const GREY: RGB = [112, 118, 130];
const LIGHT: RGB = [228, 233, 239];
const BROWN: RGB = [120, 84, 50];

// ------------------------------------------------------------------ frame
// One RGB byte buffer for the whole picture; everything paints into it.
const frame = new Uint8Array(SIDE * SIDE * 3);
frame.fill(255);

function dot(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= SIDE || y >= SIDE) return;
  const i = (y * SIDE + x) * 3;
  frame[i] = c[0];
  frame[i + 1] = c[1];
  frame[i + 2] = c[2];
}

function block(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(SIDE, x + w);
  const y1 = Math.min(SIDE, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * SIDE + xx) * 3;
      frame[i] = c[0];
      frame[i + 1] = c[1];
      frame[i + 2] = c[2];
    }
  }
}

function frameRect(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
  block(x, y, w, t, c);
  block(x, y + h - t, w, t, c);
  block(x, y, t, h, c);
  block(x + w - t, y, t, h, c);
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) dot(cx + x, cy + y, c);
    }
  }
}

function ring(cx: number, cy: number, r: number, c: RGB, t: number): void {
  for (let y = -r - t; y <= r + t; y++) {
    for (let x = -r - t; x <= r + t; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d >= r - t && d <= r + t) dot(cx + x, cy + y, c);
    }
  }
}

// Bresenham line, thickness 1..n via small discs.
function stroke(x0: number, y0: number, x1: number, y1: number, c: RGB, w = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (w <= 1) dot(x, y, c);
    else disc(x, y, Math.floor(w / 2), c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function polyline(pts: Array<[number, number]>, c: RGB, w = 1): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    stroke(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, w);
  }
}

function triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minX = Math.max(0, Math.min(x0, x1, x2));
  const maxX = Math.min(SIDE - 1, Math.max(x0, x1, x2));
  const minY = Math.max(0, Math.min(y0, y1, y2));
  const maxY = Math.min(SIDE - 1, Math.max(y0, y1, y2));
  const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (d === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
      const b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
      const cc = 1 - a - b;
      if (a >= 0 && b >= 0 && cc >= 0) dot(x, y, c);
    }
  }
}

// ------------------------------------------------------------------- font
// A 5-wide, 7-tall bitmap alphabet, each glyph seven rows of five bits.
// Only the characters the poster needs are defined.
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
};

const CHAR_W = 5;
const CHAR_H = 7;

function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * (CHAR_W * scale + scale) - scale;
}

function drawGlyph(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const rows = GLYPHS[ch] ?? GLYPHS[" "];
  for (let r = 0; r < CHAR_H; r++) {
    for (let col = 0; col < CHAR_W; col++) {
      if (rows[r][col] === "1") {
        block(x + col * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}

function drawText(x: number, y: number, text: string, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of text) {
    drawGlyph(ch, cx, y, scale, c);
    cx += CHAR_W * scale + scale;
  }
}

function drawTextCentred(cx: number, y: number, text: string, scale: number, c: RGB): void {
  drawText(cx - Math.floor(textWidth(text, scale) / 2), y, text, scale, c);
}

// Greedy word wrap: returns lines that fit inside maxWidth pixels.
function wrap(text: string, scale: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur === "" ? w : cur + " " + w;
    if (textWidth(next, scale) <= maxWidth || cur === "") {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------ header
function drawHeader(): void {
  block(0, 0, SIDE, 96, NAVY);
  block(0, 96, SIDE, 5, GOLD);
  drawTextCentred(SIDE / 2, 16, "SATURDAY 21 NOVEMBER 2026", 4, WHITE);
  drawTextCentred(SIDE / 2, 62, "THE WORLD IN ONE IMAGE", 2, GOLD);
}

// ------------------------------------------------------------- lead panel
function drawLeadPanel(): void {
  const px = 16;
  const py = 116;
  const pw = 992;
  const ph = 436;
  block(px, py, pw, ph, PAPER);
  frameRect(px, py, pw, ph, NAVY, 4);

  // --- left scene: Andes mountains, shaking Lima street, seismograph
  const sx = px + 14;
  const sy = py + 14;
  const sw = 500;
  const sh = ph - 28;
  block(sx, sy, sw, sh, CREAM);
  frameRect(sx, sy, sw, sh, NAVY2, 2);
  // sky + sun
  disc(sx + 430, sy + 52, 26, GOLD);
  ring(sx + 430, sy + 52, 34, GOLD_D, 2);
  // Andes peaks
  triangle(sx + 10, sy + 250, sx + 150, sy + 90, sx + 290, sy + 250, NAVY2);
  triangle(sx + 130, sy + 250, sx + 300, sy + 120, sx + 470, sy + 250, NAVY);
  // snow caps
  triangle(sx + 128, sy + 118, sx + 150, sy + 90, sx + 172, sy + 118, WHITE);
  triangle(sx + 282, sy + 142, sx + 300, sy + 120, sx + 318, sy + 142, WHITE);
  // ground
  block(sx, sy + 250, sw, sh - 250, BROWN);
  block(sx, sy + 250, sw, 6, INK);
  // shaking building, leaning, with crack + motion dashes
  block(sx + 60, sy + 150, 110, 100, INK);
  for (let f = 0; f < 4; f++) {
    for (let w2 = 0; w2 < 4; w2++) {
      block(sx + 76 + w2 * 24, sy + 166 + f * 22, 12, 10, GOLD);
    }
  }
  polyline(
    [
      [sx + 105, sy + 150],
      [sx + 118, sy + 180],
      [sx + 100, sy + 205],
      [sx + 116, sy + 235],
      [sx + 104, sy + 250],
    ],
    RED,
    3,
  );
  stroke(sx + 40, sy + 180, sx + 52, sy + 180, RED, 3);
  stroke(sx + 40, sy + 205, sx + 52, sy + 205, RED, 3);
  stroke(sx + 178, sy + 190, sx + 190, sy + 190, RED, 3);
  // people running on the street
  for (let i = 0; i < 4; i++) {
    const bx = sx + 230 + i * 62;
    const by = sy + 300;
    disc(bx, by, 9, INK);
    stroke(bx, by + 9, bx, by + 30, INK, 4);
    stroke(bx, by + 32, bx - 10, by + 52, INK, 4);
    stroke(bx, by + 32, bx + 12, by + 50, INK, 4);
    stroke(bx, by + 16, bx - 12, by + 26, INK, 4);
    stroke(bx, by + 16, bx + 12, by + 8, INK, 4);
  }
  // seismograph strip along the bottom of the scene
  block(sx, sy + sh - 52, sw, 52, WHITE);
  stroke(sx, sy + sh - 26, sx + sw, sy + sh - 26, LIGHT, 1);
  polyline(
    [
      [sx + 8, sy + sh - 26],
      [sx + 60, sy + sh - 26],
      [sx + 78, sy + sh - 44],
      [sx + 96, sy + sh - 8],
      [sx + 114, sy + sh - 40],
      [sx + 132, sy + sh - 14],
      [sx + 150, sy + sh - 34],
      [sx + 170, sy + sh - 26],
      [sx + 230, sy + sh - 26],
      [sx + 250, sy + sh - 46],
      [sx + 268, sy + sh - 6],
      [sx + 288, sy + sh - 26],
      [sx + 360, sy + sh - 26],
      [sx + 380, sy + sh - 38],
      [sx + 398, sy + sh - 14],
      [sx + 420, sy + sh - 26],
      [sx + 492, sy + sh - 26],
    ],
    RED,
    2,
  );
  // M6.8 badge
  disc(sx + 62, sy + 56, 48, GOLD);
  ring(sx + 62, sy + 56, 48, GOLD_D, 3);
  drawTextCentred(sx + 62, sy + 44, "M6.8", 3, NAVY);

  // --- right text column
  const tx = px + 548;
  const tw = pw - 548 - 24;
  drawText(tx, py + 26, "LEAD STORY - PERU", 2, RED);
  drawText(tx, py + 62, "M6.8 QUAKE", 4, NAVY);
  drawText(tx, py + 104, "SHAKES PERU", 4, NAVY);
  const body = [
    "CENTRAL PERU - JUNIN, ANDES",
    "01:09 UTC SAT 21 NOV - FELT",
    "AS FAR AS LIMA, 320 KM AWAY",
    "NO DEATHS, NO MAJOR DAMAGE",
    "NO TSUNAMI THREAT",
  ];
  let by = py + 168;
  for (const line of body) {
    drawText(tx, by, line, 2, INK);
    by += 34;
  }
  block(tx, py + 356, tw, 3, GOLD);
  drawText(tx, py + 374, "CONGRESS EVACUATED AS A", 2, GREY);
  drawText(tx, py + 400, "PRECAUTION", 2, GREY);
}

// ------------------------------------------------------------ small panels
interface SmallStory {
  kicker: string;
  colour: RGB;
  headline: string;
  lines: string[];
  art: "star" | "chart" | "crowd" | "bat";
}

const STORIES: SmallStory[] = [
  {
    kicker: "POLAND - NATO",
    colour: NAVY,
    headline: "NATO CHIEF IN WARSAW TODAY",
    lines: [
      "RUSSIAN MISSILES FELL IN POLAND ON 20 NOV",
      "SEC-GEN MARK RUTTE ARRIVES SAT 21 NOV",
      "PM TUSK: A DELIBERATE PROVOCATION",
    ],
    art: "star",
  },
  {
    kicker: "INDIA - MARKETS",
    colour: TEAL,
    headline: "RECORD FOREIGN CASH INTO INDIA",
    lines: [
      "RS 1.22 LAKH CRORE IN 2-20 NOV",
      "BIGGEST MONTHLY INFLOW EVER",
      "ENDS 16 MONTHS OF SELLING",
    ],
    art: "chart",
  },
  {
    kicker: "EUROPE - PROTESTS",
    colour: RED,
    headline: "PARIS BRACES FOR COST-OF-LIVING MARCH",
    lines: [
      "70,000 POLICE DEPLOYED ACROSS FRANCE",
      "MARCH SAT 14:00, REPUBLIQUE TO NATION",
      "PART OF 3-DAY WAVE IN 7 COUNTRIES",
    ],
    art: "crowd",
  },
  {
    kicker: "CRICKET - WELLINGTON",
    colour: GOLD_D,
    headline: "KL RAHUL 100 COMPLETES SENA SET",
    lines: [
      "100 OFF 207 BALLS - 13TH TEST TON",
      "FIRST INDIA OPENER WITH TONS IN ALL 4",
      "SENA NATIONS - SA ENG NZ AUS",
    ],
    art: "bat",
  },
];

function drawArt(kind: SmallStory["art"], x: number, y: number, c: RGB): void {
  if (kind === "star") {
    // four-point compass star for NATO, kept inside the 34px strip
    triangle(x + 16, y, x + 21, y + 11, x + 11, y + 11, c);
    triangle(x + 16, y + 32, x + 21, y + 21, x + 11, y + 21, c);
    triangle(x, y + 16, x + 11, y + 11, x + 11, y + 21, c);
    triangle(x + 32, y + 16, x + 21, y + 11, x + 21, y + 21, c);
    disc(x + 16, y + 16, 4, c);
  } else if (kind === "chart") {
    // rising bars + arrow, kept inside the 34px strip
    const base = y + 31;
    const heights = [8, 14, 11, 20, 27];
    for (let i = 0; i < heights.length; i++) {
      block(x + i * 9, base - heights[i], 6, heights[i], c);
    }
    polyline(
      [
        [x, base - 7],
        [x + 12, base - 14],
        [x + 24, base - 11],
        [x + 36, base - 22],
        [x + 44, base - 29],
      ],
      RED,
      3,
    );
    triangle(x + 44, base - 29, x + 37, base - 26, x + 41, base - 21, RED);
  } else if (kind === "crowd") {
    // marchers, kept inside the 34px strip (no placard: it clipped)
    for (let i = 0; i < 4; i++) {
      const bx = x + 6 + i * 11;
      disc(bx, y + 8, 4, c);
      block(bx - 3, y + 13, 7, 17, c);
    }
  } else {
    // cricket bat + ball, kept inside the 34px strip
    stroke(x + 8, y + 30, x + 26, y + 6, BROWN, 6);
    block(x + 23, y + 2, 9, 10, BROWN);
    disc(x + 38, y + 24, 5, RED);
    ring(x + 38, y + 24, 5, WHITE, 1);
  }
}

function drawSmallPanel(s: SmallStory, px: number, py: number): void {
  const pw = 488;
  const ph = 188;
  block(px, py, pw, ph, WHITE);
  frameRect(px, py, pw, ph, NAVY, 3);
  block(px, py, pw, 34, s.colour);
  drawText(px + 14, py + 10, s.kicker, 2, WHITE);
  // small art in the strip's right corner, fully inside the strip
  drawArt(s.art, px + pw - 52, py + 1, WHITE);
  const tx = px + 14;
  const tw = pw - 28;
  const headLines = wrap(s.headline, 2, tw);
  let y = py + 46;
  for (const line of headLines) {
    drawText(tx, y, line, 2, NAVY);
    y += 26;
  }
  y += 4;
  block(tx, y, 64, 3, s.colour);
  y += 12;
  for (const line of s.lines) {
    const wrapped = wrap(line, 1, tw);
    for (const wl of wrapped) {
      drawText(tx, y, wl, 1, INK);
      y += 16;
    }
  }
}

// ------------------------------------------------------------------ footer
function drawFooter(): void {
  drawTextCentred(
    SIDE / 2,
    972,
    "SOURCES: REUTERS - AP - AFP - THE HINDU BUSINESSLINE - 21 NOV 2026",
    1,
    GREY,
  );
  drawTextCentred(SIDE / 2, 990, "ALL ART DRAWN IN CODE - NO PHOTOS", 1, GREY);
}

// -------------------------------------------------------------------- png
// CRC32 (IEEE) over a byte buffer.
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIDE, 0);
  ihdr.writeUInt32BE(SIDE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // One scanline per row: filter byte 0 + raw RGB.
  const raw = Buffer.alloc(SIDE * (SIDE * 3 + 1));
  for (let y = 0; y < SIDE; y++) {
    raw[y * (SIDE * 3 + 1)] = 0;
    raw.set(frame.subarray(y * SIDE * 3, (y + 1) * SIDE * 3), y * (SIDE * 3 + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------------- main
function main(): void {
  drawHeader();
  drawLeadPanel();
  drawSmallPanel(STORIES[0], 16, 568);
  drawSmallPanel(STORIES[1], 520, 568);
  drawSmallPanel(STORIES[2], 16, 772);
  drawSmallPanel(STORIES[3], 520, 772);
  drawFooter();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), encodePng());
}

main();
