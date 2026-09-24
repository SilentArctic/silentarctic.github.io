#!/usr/bin/env node
/**
 * Annotated text for PDF pages: italic/bold runs and Genesys dice/symbol glyphs marked as draft tags.
 * Built on poppler's `pdftohtml -xml`, which reports font styles and the symbol font per text run.
 *
 *   node pdf-runs.js <pdf> <firstPdfPage> [lastPdfPage] [--render <dir>] [--poppler <bin dir>]
 *
 * Output per PDF page (PDF page indexes, not printed page numbers):
 *   {@i …} / {@b …}      italic / bold runs as printed (headings and "Tier:" labels show up bold too)
 *   {@symbols aa}        result symbols, decoded from the Genesys symbol font
 *   {@dice difficulty|2} dice, decoded from glyph shape + fill color
 *   [[glyph U+XXXXX #color]]  a glyph not in the table: confirm it visually and extend GLYPHS below
 * Wording is approximate here (line-break hyphens are kept as "-|"); take exact wording from pdftotext.
 *
 * --render <dir> also writes page PNGs (pdftoppm, 110 dpi) for visual checks with the Read tool.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const lib = require('./lib');

const { flags, positional } = lib.parseArgs(process.argv.slice(2));
const [pdf, firstArg, lastArg] = positional;
if (!pdf || !firstArg) {
   console.error('usage: pdf-runs.js <pdf> <firstPdfPage> [lastPdfPage] [--render <dir>] [--poppler <bin dir>]');
   process.exit(2);
}
const first = Number(firstArg);
const last = Number(lastArg || firstArg);

/* ---------------------------------------------------------------- locate poppler */

function isPoppler(exe) {
   const res = spawnSync(exe, ['-v'], { stdio: ['ignore', 'pipe', 'pipe'] });
   return /poppler/i.test(`${res.stdout || ''}${res.stderr || ''}`);
}

function findPopplerBin() {
   const candidates = [];
   if (flags.poppler) candidates.push(flags.poppler);
   if (process.env.POPPLER_BIN) candidates.push(process.env.POPPLER_BIN);
   candidates.push(''); // PATH
   const wingetRoot = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
   if (fs.existsSync(wingetRoot)) {
      for (const pkg of fs.readdirSync(wingetRoot).filter(d => /poppler/i.test(d))) {
         const pkgDir = path.join(wingetRoot, pkg);
         for (const ver of fs.readdirSync(pkgDir)) candidates.push(path.join(pkgDir, ver, 'Library', 'bin'));
      }
   }
   for (const dir of candidates) {
      const exe = dir ? path.join(dir, 'pdftohtml') : 'pdftohtml';
      if (isPoppler(exe)) return dir;
   }
   return null;
}

const bin = findPopplerBin();
if (bin === null) {
   console.error('poppler not found (pdftohtml -xml is required). Install it with: winget install oschwartz10612.Poppler');
   process.exit(2);
}
const tool = name => (bin ? path.join(bin, name) : name);

/* ---------------------------------------------------------------- glyph table */

/*
 * Genesys symbol font (confirmed visually in Embers of the Imperium, 2026-09-18).
 * Dice share one glyph per shape; the fill color picks the die. Colored dice are also drawn with
 * a dark outline glyph at the same spot, which is dropped as a duplicate.
 * Other books may use other codes: anything unknown prints as [[glyph …]] for a visual check.
 */
const GLYPHS = {
   0xF22B0: { symbol: 'f' }, // failure
   0xF22B1: { symbol: 'h' }, // threat
   0xF22B2: { symbol: 'd' }, // despair
   0xF22B3: { symbol: 's' }, // success
   0xF22B4: { symbol: 'a' }, // advantage
   0xF22B5: { symbol: 't' }, // triumph
   0xF22B7: { shape: 'diamond' }, // ability (green) / difficulty (purple)
   0xF22B8: { shape: 'square' }, // boost (light blue) / setback (black)
   0xF22BB: { shape: 'hexagon' }, // proficiency (yellow) / challenge (red)
};

function colorClass(hex) {
   const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
   if (!m) return 'unknown';
   const [r, g, b] = m.slice(1).map(x => parseInt(x, 16));
   const max = Math.max(r, g, b);
   const min = Math.min(r, g, b);
   if (max < 70) return 'black';
   if (min > 225) return 'white';
   if (r > 150 && g > 130 && b < 100) return 'yellow';
   if (b >= r && b >= g && g > r) return 'blue';
   if (g > r && g > b) return 'green';
   if (r > g && b > g && Math.abs(r - b) < 70) return 'purple';
   if (r > g && r > b) return 'red';
   return 'unknown';
}

const DICE = {
   diamond: { green: 'ability', purple: 'difficulty' },
   square: { blue: 'boost', black: 'setback' },
   hexagon: { yellow: 'proficiency', red: 'challenge' },
};

/* ---------------------------------------------------------------- parse */

const decode = s => s
   .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
   .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');

const xml = execFileSync(tool('pdftohtml'), ['-xml', '-i', '-q', '-f', String(first), '-l', String(last), '-stdout', pdf], {
   stdio: ['ignore', 'pipe', 'ignore'],
   maxBuffer: 256 * 1024 * 1024,
}).toString('utf8');

const fonts = {};
for (const m of xml.matchAll(/<fontspec id="(\d+)"[^>]*family="([^"]*)"[^>]*color="([^"]*)"/g)) {
   fonts[m[1]] = { family: m[2], color: m[3], symbol: /genesys/i.test(m[2]) };
}

const pages = [];
let current = null;
for (const line of xml.split(/\r?\n/)) {
   const pm = /<page number="(\d+)"/.exec(line);
   if (pm) {
      current = { number: Number(pm[1]), items: [] };
      pages.push(current);
      continue;
   }
   const tm = /<text top="(-?\d+)" left="(-?\d+)"[^>]*font="(\d+)"[^>]*>(.*)<\/text>/.exec(line);
   if (!tm || !current) continue;
   current.items.push({ left: Number(tm[2]), font: fonts[tm[3]] || {}, raw: tm[4] });
}

/* ---------------------------------------------------------------- render */

const NBSP = String.fromCharCode(0xA0);

function glyphTokens(item) {
   const tokens = [];
   for (const ch of decode(item.raw.replace(/<[^>]+>/g, ''))) {
      if (ch.trim() === '' || ch === NBSP) continue;
      const cp = ch.codePointAt(0);
      const g = GLYPHS[cp];
      const color = colorClass(item.font.color);
      if (g?.symbol) tokens.push({ kind: 'symbol', value: g.symbol });
      else if (g?.shape && DICE[g.shape][color]) tokens.push({ kind: 'dice', value: DICE[g.shape][color] });
      else tokens.push({ kind: 'unknown', value: `[[glyph U+${cp.toString(16).toUpperCase()} ${item.font.color}]]` });
   }
   return tokens;
}

function styled(raw) {
   let s = raw.replace(/<i>/g, '{@i ').replace(/<\/i>/g, '}').replace(/<b>/g, '{@b ').replace(/<\/b>/g, '}');
   s = s.replace(/<[^>]+>/g, '');
   return decode(s).split(NBSP).join(' ');
}

function renderPage(page) {
   const items = page.items;
   /* drop dark outline glyphs duplicated under a colored die at the same position */
   const keep = items.map((it, i) => {
      if (!it.font.symbol || colorClass(it.font.color) !== 'black') return true;
      const twin = [items[i - 1], items[i + 1]].find(o => o && o.font.symbol && o !== it && colorClass(o.font.color) !== 'black'
         && Math.abs(o.left - it.left) <= 3 && o.raw === it.raw);
      return !twin;
   });

   const parts = []; // { text, glyph }
   items.forEach((it, i) => {
      if (!keep[i]) return;
      if (it.font.symbol) parts.push({ glyph: true, tokens: glyphTokens(it) });
      else parts.push({ glyph: false, text: styled(it.raw) });
   });

   let out = '';
   let prevText = '';
   let pendingGlyphs = [];
   const flushGlyphs = () => {
      if (!pendingGlyphs.length) return;
      const groups = [];
      for (const t of pendingGlyphs) {
         const last = groups[groups.length - 1];
         if (last && last.kind === t.kind && (t.kind === 'symbol' || last.value === t.value)) last.items.push(t);
         else groups.push({ kind: t.kind, value: t.value, items: [t] });
      }
      out += groups.map(g => {
         if (g.kind === 'symbol') return `{@symbols ${g.items.map(t => t.value).join('')}}`;
         if (g.kind === 'dice') return `{@dice ${g.value}${g.items.length > 1 ? `|${g.items.length}` : ''}}`;
         return g.items.map(t => t.value).join('');
      }).join('');
      pendingGlyphs = [];
   };

   for (const part of parts) {
      if (part.glyph) {
         pendingGlyphs.push(...part.tokens);
         continue;
      }
      const text = part.text;
      if (/\(Order #\d+\)/.test(text)) continue; // purchase watermark
      if (pendingGlyphs.length) {
         /* text between two glyph runs that is only whitespace keeps the run together */
         if (text.trim() === '') continue;
         flushGlyphs();
         out += /^[A-Za-z0-9]/.test(text) ? ` ${text}` : text; // a glyph ending a line loses its space

         prevText = text;
         continue;
      }
      const plainPrev = prevText.replace(/\}+$/, '');
      const plainNext = text.replace(/^\{@[a-z]+ /, '');
      const join = /\s$/.test(plainPrev) || /^\s/.test(plainNext) || /^[.,;:)!?]/.test(plainNext) || /\($/.test(plainPrev)
         || (/[A-Za-z]$/.test(plainPrev) && /^[a-z]/.test(plainNext)) // small caps are split into separate runs
         || out === '';
      if (join) out += text;
      else if (/-$/.test(plainPrev)) out += `|${text}`; // line-break hyphen: "dif-|ferent"
      else out += `\n${text}`;
      prevText = text;
   }
   flushGlyphs();

   /* merge a style run split across lines: "{@i a }{@i b}" → "{@i a b}" */
   for (const tag of ['i', 'b']) {
      const re = new RegExp(`\\}([ \\t]*\\|?)\\{@${tag} `, 'g'); // same line only
      let prev;
      do {
         prev = out;
         out = out.replace(re, (m, gap, offset) => {
            /* only merge when the "}" closes the same tag */
            const open = out.lastIndexOf('{@', offset);
            return out.startsWith(`{@${tag} `, open) ? gap : m;
         });
      } while (out !== prev);
   }
   return out.replace(/[ \t]+\n/g, '\n').trim();
}

for (const page of pages) {
   console.log(`== PDF page ${page.number}`);
   console.log(renderPage(page));
   console.log('');
}

if (flags.render) {
   const dir = path.resolve(flags.render);
   fs.mkdirSync(dir, { recursive: true });
   const prefix = path.join(dir, path.basename(pdf, path.extname(pdf)).replace(/\W+/g, '_'));
   execFileSync(tool('pdftoppm'), ['-q', '-r', '110', '-png', '-f', String(first), '-l', String(last), pdf, prefix], { stdio: 'ignore' });
   const rendered = fs.readdirSync(dir).filter(f => f.startsWith(path.basename(prefix)) && f.endsWith('.png')).sort();
   console.log(`rendered PNGs (view with the Read tool):\n${rendered.map(f => `  ${path.join(dir, f)}`).join('\n')}`);
}
