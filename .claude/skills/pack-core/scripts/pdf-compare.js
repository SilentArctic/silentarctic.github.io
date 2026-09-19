#!/usr/bin/env node
/**
 * Compare a content pack's text with its source PDF and list discrepancies for review.
 *
 *   node pdf-compare.js --dest <pack.json> --pdf <book.pdf> [--pages 241-242] [--group adversary]…
 *                       [--offset N] [--context 5] [--max N]
 *
 * For every item with a `page` (optionally limited to --pages / --group):
 *   PAGE   the item's name isn't on its printed page (suggests where it is)
 *   TEXT   word-level differences between prose fields (description, entries, items, details…) and the book
 *   STATS  adversary Skills / Talents / Abilities lines that differ from the data (names and ranks)
 *   MISS   prose that couldn't be located near the item's page
 *
 * Tags are rendered to plain text before comparing ({@skill Stealth} → "Stealth", difficulty → "Hard Discipline check").
 * Comparison ignores case, dice/symbol glyphs, quotes, and dash style; it keeps words, numbers, and . , ; : ! ? ( ).
 * The printed-page → PDF-page offset is detected from item names unless --offset is given.
 * Every finding is a lead to verify against the page image, never an automatic fix.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const lib = require('./lib');

const { flags } = lib.parseArgs(process.argv.slice(2));
if (!flags.dest || !flags.pdf) {
   console.error('usage: pdf-compare.js --dest <pack.json> --pdf <book.pdf> [--pages 241-242] [--group <group>]… [--offset N]');
   process.exit(2);
}
const destFile = path.resolve(flags.dest);
const pdf = path.resolve(flags.pdf);
for (const f of [destFile, pdf]) {
   if (!fs.existsSync(f)) {
      console.error(`not found: ${f}`);
      process.exit(2);
   }
}
const CONTEXT = Number(flags.context || 5);
const MAX = Number(flags.max || 1000);
const groupsWanted = flags.group ? [].concat(flags.group) : null;

function parsePages(spec) {
   if (!spec) return null;
   const set = new Set();
   for (const part of String(spec).split(',')) {
      const [a, b] = part.split('-').map(Number);
      for (let p = a; p <= (b || a); p++) set.add(p);
   }
   return set;
}
const pagesWanted = parsePages(flags.pages);

/* ---------------------------------------------------------------- PDF text */

const raw = execFileSync('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8');
let pdfPages = raw.split('\f').map(t => t.split(/\r?\n/).filter(l => !/\(Order #\d+\)/.test(l))); // drop purchase watermark

/* drop running headers/footers: short lines repeated on many pages, and bare page numbers */
{
   const freq = new Map();
   for (const lines of pdfPages) for (const l of new Set(lines.map(x => x.trim()).filter(Boolean))) freq.set(l, (freq.get(l) || 0) + 1);
   const limit = Math.max(8, pdfPages.length * 0.05);
   pdfPages = pdfPages.map(lines => lines.filter(l => {
      const t = l.trim();
      if (/^\d{1,4}$/.test(t)) return false;
      return !(t.length < 60 && freq.get(t) > limit);
   }).join('\n'));
}

/* ---------------------------------------------------------------- normalize + tokenize */

const GLYPHS = /[\uE000-\uF8FF\uFFFD\uD800-\uDFFF]|[\u{F0000}-\u{FFFFD}]|[\u{100000}-\u{10FFFD}]/gu;

function normalize(s) {
   return s.normalize('NFKC')
      .replace(GLYPHS, ' ')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') // zero-width characters
      .replace(/\u00AD\s*/g, '') // soft hyphen (+ the line break after it)
      .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
      .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
      .replace(/[\[{]/g, '(').replace(/[\]}]/g, ')')
      .replace(/\([\s–—-]*\)/g, ' ') // brackets that only held dice/symbols (or a dash: "Simple (–)")
      .replace(/-\s*\n\s*(?=[a-z])/g, ''); // line-break hyphenation
}

function tokenize(s) {
   const out = [];
   for (const m of normalize(s).matchAll(/[A-Za-z0-9\u00C0-\u024F]+(?:'[A-Za-z]+)*|[.,;:!?()]/g)) {
      out.push({ text: m[0], key: m[0].toLowerCase().replace(/'/g, '') });
   }
   return out;
}

const titleCase = s => s.replace(/\b[a-z]/g, c => c.toUpperCase());

/* render tags to the words a reader would see */
function renderPlain(str) {
   let s = str;
   const re = /\{@(\w+)(?: ([^{}]*))?\}/;
   let guard = 0;
   while (re.test(s) && guard++ < 500) {
      s = s.replace(re, (m, tag, body = '') => {
         const parts = body.split('|');
         switch (tag) {
            case 'dice': return ' ';
            case 'symbols': return ` ${body.replace(/[asthfd]+/g, ' ')} `;
            case 'combat': case 'social': case 'general': return ' ';
            case 'difficulty': {
               const [level, skill] = parts;
               return `${titleCase(level || '')}${skill ? ` ${titleCase(skill)} check` : ''}`;
            }
            case 'b': case 'i': case 's': case 'u': case 'title': case 'code': return body;
            case 'link': case 'filter': case 'genesysref': return parts[1] || parts[0];
            case 'image': return ' ';
            case 'table': return parts[1] || `Table ${parts[0]}`;
            default: return parts[1] || parts[0]; // reference tag: display || name
         }
      });
   }
   return s;
}

/* ---------------------------------------------------------------- page offset */

const dest = lib.readJson(destFile);
const skipGroups = new Set(['_meta', '$schema']);
const items = [];
for (const [group, list] of Object.entries(dest)) {
   if (skipGroups.has(group) || !Array.isArray(list)) continue;
   for (const item of list) if (item && typeof item.name === 'string' && Number.isInteger(item.page)) items.push({ group, item });
}

const pageTokens = pdfPages.map(t => tokenize(t));
const PUNCT = new Set(['.', ',', ';', ':', '!', '?', '(', ')']);
const pageKeys = pageTokens.map(toks => toks.map(t => t.key));
const pageWords = pageKeys.map(keys => keys.filter(k => !PUNCT.has(k)));

function findSeq(hay, needle, from = 0) {
   if (!needle.length) return -1;
   outer: for (let i = from; i <= hay.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
      return i;
   }
   return -1;
}
const nameKeys = name => tokenize(name).map(t => t.key).filter(k => !PUNCT.has(k));
const onPage = (name, pdfIndex) => pdfIndex >= 0 && pdfIndex < pageWords.length && findSeq(pageWords[pdfIndex], nameKeys(name)) !== -1;
/* "Base (Variant)" names are often printed as "Base", "Variant", or "Variant Base" */
function nameOnPdfPage(name, pdfIndex) {
   if (onPage(name, pdfIndex)) return true;
   const m = /^(.+?)s*((.+))$/.exec(name);
   return !!m && [m[1], m[2], `${m[2]} ${m[1]}`].some(n => nameKeys(n).length && onPage(n, pdfIndex));
}

let offset;
if (flags.offset !== undefined) offset = Number(flags.offset);
else {
   const votes = new Map();
   for (const { item } of items) {
      if (nameKeys(item.name).length < 2) continue; // short names match everywhere
      for (let k = -20; k <= 20; k++) {
         if (nameOnPdfPage(item.name, item.page + k - 1)) votes.set(k, (votes.get(k) || 0) + 1);
      }
   }
   const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
   offset = best ? best[0] : 0;
   const total = [...votes.values()].reduce((a, b) => a + b, 0);
   console.log(`page offset: PDF page = printed page ${offset >= 0 ? '+' : '-'} ${Math.abs(offset)} (detected from ${best ? best[1] : 0} of ${total} name matches; override with --offset)`);
}
const pdfIndexOf = printed => printed + offset - 1; // 0-based index into pdfPages
const printedOf = index => index - offset + 1;

/* ---------------------------------------------------------------- alignment */

/* semi-global alignment: all of `a` (data) against any window of `b` (book); returns ops or null */
function align(a, b) {
   const n = a.length;
   const m = b.length;
   const W = new Uint32Array((n + 1) * (m + 1));
   const idx = (i, j) => i * (m + 1) + j;
   for (let i = 1; i <= n; i++) W[idx(i, 0)] = i;
   for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
         const sub = W[idx(i - 1, j - 1)] + (a[i - 1].key === b[j - 1].key ? 0 : 1);
         const del = W[idx(i - 1, j)] + 1;
         const ins = W[idx(i, j - 1)] + 1;
         W[idx(i, j)] = Math.min(sub, del, ins);
      }
   }
   let j = 0;
   for (let k = 1; k <= m; k++) if (W[idx(n, k)] < W[idx(n, j)]) j = k;
   const cost = W[idx(n, j)];
   const ops = [];
   let i = n;
   while (i > 0) {
      if (j > 0 && W[idx(i, j)] === W[idx(i - 1, j - 1)] + (a[i - 1].key === b[j - 1].key ? 0 : 1)) {
         ops.push({ op: a[i - 1].key === b[j - 1].key ? 'eq' : 'sub', a: a[i - 1], b: b[j - 1] });
         i--; j--;
      } else if (W[idx(i, j)] === W[idx(i - 1, j)] + 1) {
         ops.push({ op: 'del', a: a[i - 1] });
         i--;
      } else {
         ops.push({ op: 'ins', b: b[j - 1] });
         j--;
      }
   }
   return { ops: ops.reverse(), cost };
}

/* locate `toks` in book tokens using 4-gram anchors, then align within a window */
const N = 4;
function gramIndex(book) {
   const bookKeys = book.map(t => t.key);
   const grams = new Map();
   for (let j = 0; j + N <= bookKeys.length; j++) {
      const g = bookKeys.slice(j, j + N).join(' ');
      if (!grams.has(g)) grams.set(g, []);
      grams.get(g).push(j);
   }
   return { book, bookKeys, grams };
}

function locate(toks, index) {
   const { book, bookKeys, grams } = index;
   const keys = toks.map(t => t.key);
   const starts = new Map();
   if (keys.length < N) {
      const at = findSeq(bookKeys, keys);
      return at === -1 ? null : { ...align(toks, book.slice(at, at + keys.length)), at };
   }
   for (let i = 0; i + N <= keys.length; i++) {
      for (const j of grams.get(keys.slice(i, i + N).join(' ')) || []) {
         const s = j - i;
         starts.set(s, (starts.get(s) || 0) + 1);
      }
   }
   if (!starts.size) return null;
   const [start, hits] = [...starts.entries()].sort((x, y) => y[1] - x[1])[0];
   if (hits < Math.min(3, keys.length - N + 1)) return null;
   const slack = Math.max(10, Math.ceil(keys.length * 0.2));
   const lo = Math.max(0, start - slack);
   const hi = Math.min(book.length, start + keys.length + slack);
   return { ...align(toks, book.slice(lo, hi)), at: start };
}

/* whole-book index, built on first use */
let globalIndex = null;
let globalPageOf = null;
function locateAnywhere(toks) {
   if (!globalIndex) {
      const all = [];
      globalPageOf = [];
      pageTokens.forEach((list, ix) => list.forEach(tk => {
         all.push(tk);
         globalPageOf.push(ix);
      }));
      globalIndex = gramIndex(all);
   }
   const res = locate(toks, globalIndex);
   if (!res) return null;
   return { ...res, page: printedOf(globalPageOf[Math.max(0, Math.min(globalPageOf.length - 1, res.at))]) };
}

/* group non-eq ops into readable hunks */
function hunks(ops) {
   const out = [];
   const join = list => list.map(t => t.text).join(' ').replace(/ ([.,;:!?)])/g, '$1').replace(/\( /g, '(');
   for (let k = 0; k < ops.length; k++) {
      if (ops[k].op === 'eq') continue;
      let e = k;
      while (e + 1 < ops.length && (ops[e + 1].op !== 'eq' || (e + 2 < ops.length && ops[e + 2].op !== 'eq'))) e++;
      const before = ops.slice(Math.max(0, k - CONTEXT), k).filter(o => o.a).map(o => o.a);
      const after = ops.slice(e + 1, e + 1 + CONTEXT).filter(o => o.a).map(o => o.a);
      const seg = ops.slice(k, e + 1);
      /* data items often add a final period, or drop the book's closing punctuation: ignore punctuation-only edges */
      const punctOnly = seg.every(o => [o.a, o.b].every(x => !x || /^[.,;:!?()]$/.test(x.text)));
      if (punctOnly && (!after.length || !before.length)) {
         k = e;
         continue;
      }
      out.push({
         data: join(seg.filter(o => o.a).map(o => o.a)),
         book: join(seg.filter(o => o.b).map(o => o.b)),
         before: join(before),
         after: join(after),
      });
      k = e;
   }
   return out;
}

/* ---------------------------------------------------------------- prose fields */

const PROSE_KEYS = new Set(['description', 'entries', 'items', 'details', 'narrative', 'summary', 'lore', 'shouldUse', 'shouldNotUse', 'why']);
const SKIP_KEYS = new Set(['tags', 'settings', 'id', 'imageUrl', '_ref', 'rows', 'columns', 'gear', 'modifiers']);

function proseStrings(value, where, inProse, out) {
   if (typeof value === 'string') {
      if (inProse) out.push({ where, text: value });
   } else if (Array.isArray(value)) {
      value.forEach((v, i) => proseStrings(v, `${where}[${i}]`, inProse, out));
   } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
         if (SKIP_KEYS.has(k)) continue;
         proseStrings(v, where ? `${where}.${k}` : k, inProse || PROSE_KEYS.has(k), out);
      }
   }
   return out;
}

/* ---------------------------------------------------------------- adversary stat lines */

function splitTop(s) {
   const parts = [];
   let depth = 0;
   let cur = '';
   for (const ch of s) {
      if ('([{'.includes(ch)) depth++;
      if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) {
         parts.push(cur);
         cur = '';
      } else cur += ch;
   }
   if (cur.trim()) parts.push(cur);
   return parts.map(p => p.trim()).filter(Boolean);
}

/* "Skills:" / "Talents:" / "Abilities:" paragraphs on a page, in order */
function statLines(text) {
   const flat = normalize(text).replace(/\n(?!\s*\n)/g, ' ');
   const found = [];
   for (const m of flat.matchAll(/\b(Skills(?: \(group only\))?|Talents|Abilities|Equipment):\s*/g)) found.push({ label: m[1].replace(/ .*/, ''), at: m.index, bodyAt: m.index + m[0].length });
   return found.map((f, i) => {
      const end = i + 1 < found.length ? found[i + 1].at : flat.length;
      let body = flat.slice(f.bodyAt, end).split(/\n\s*\n/)[0];
      const dot = body.search(/\.\s+[A-Z][^,]{0,60}\((Minion|Rival|Nemesis)\)|\.\s*$/); // stop at the next heading
      if (dot !== -1) body = body.slice(0, dot);
      return { label: f.label, body: body.replace(/\.\s*$/, '').trim() };
   });
}

const entryName = e => e.replace(/\s*\(.*$/s, '').trim();
/* word order and a trailing rank don't matter for matching ("Improved Inspiring Rhetoric" = "Inspiring Rhetoric (Improved)") */
const listKey = s => nameKeys(s.trim().replace(/\s+\d+$/, '')).sort().join(' ');
const rankOf = s => {
   const m = /\s(\d+)$/.exec(s.trim());
   return m ? Number(m[1]) : undefined;
};

function compareAdversary(item, pageIdxs) {
   const findings = [];
   const lines = pageIdxs.flatMap(ix => statLines(pdfPages[ix] || ''));
   const dataSkills = (item.skills || []).filter(s => s && s.name);
   if (!dataSkills.length) return findings;
   /* pick the Skills line whose names overlap most with the data */
   let best = null;
   lines.forEach((l, i) => {
      if (l.label !== 'Skills') return;
      const names = splitTop(l.body).map(e => listKey(e.replace(/\s+\d+$/, '')));
      const overlap = dataSkills.filter(s => names.includes(listKey(s.name))).length;
      const score = overlap / Math.max(names.length, dataSkills.length);
      if (!best || score > best.score) best = { score, i, names };
   });
   if (!best || best.score < 0.5) {
      findings.push('STATS  no matching "Skills:" line found on the page');
      return findings;
   }
   const printed = splitTop(lines[best.i].body).map(e => {
      const m = /^(.*?)(?:\s+(\d+))?$/.exec(e.trim());
      return { name: m[1], ranks: m[2] === undefined ? undefined : Number(m[2]) };
   });
   for (const p of printed) {
      const d = dataSkills.find(s => listKey(s.name) === listKey(p.name));
      if (!d) findings.push(`STATS  skill "${p.name}${p.ranks !== undefined ? ` ${p.ranks}` : ''}" is printed but missing from the data`);
      else if (item.type !== 'minion' && d.ranks !== p.ranks) findings.push(`STATS  ${p.name}: data ranks ${d.ranks ?? '(none)'} → book ${p.ranks ?? '(none)'}`);
   }
   for (const d of dataSkills) {
      if (!printed.some(p => listKey(p.name) === listKey(d.name))) findings.push(`STATS  skill "${d.name}" is in the data but not printed`);
   }
   /* the Talents / Abilities lines that follow that Skills line */
   for (const [label, field] of [['Talents', 'talents'], ['Abilities', 'abilities']]) {
      const line = lines.slice(best.i + 1).find(l => l.label === label || l.label === 'Skills');
      if (!line || line.label !== label) continue;
      const printedNames = /^none$/i.test(line.body) ? [] : splitTop(line.body).map(entryName);
      const dataNames = (item[field] || []).map(x => (typeof x === 'string' ? x : x?.name)).filter(Boolean);
      for (const p of printedNames) {
         const d = dataNames.find(x => listKey(x) === listKey(p));
         if (!d) findings.push(`STATS  ${field}: "${p}" is printed but missing from the data`);
         else if (rankOf(p) !== undefined && rankOf(d) !== undefined && rankOf(p) !== rankOf(d)) findings.push(`STATS  ${field}: data "${d}" → book "${p}"`);
      }
      for (const d of dataNames) if (!printedNames.some(p => listKey(p) === listKey(d))) findings.push(`STATS  ${field}: "${d}" is in the data but not printed`);
      const inBoth = printedNames.filter(p => dataNames.some(d => listKey(d) === listKey(p)));
      const dataOrder = dataNames.filter(d => inBoth.some(p => listKey(p) === listKey(d)));
      if (inBoth.map(listKey).join('|') !== dataOrder.map(listKey).join('|')) findings.push(`STATS  ${field} order differs: book ${inBoth.join(', ')} | data ${dataOrder.join(', ')}`);
   }
   return findings;
}

/* ---------------------------------------------------------------- run */

let reported = 0;
const misses = new Map();
let checked = 0;
const summary = { PAGE: 0, TEXT: 0, STATS: 0, MISS: 0 };

for (const { group, item } of items) {
   if (groupsWanted && !groupsWanted.includes(group)) continue;
   if (pagesWanted && !pagesWanted.has(item.page)) continue;
   checked++;
   const findings = [];
   const home = pdfIndexOf(item.page);
   const near = [home - 1, home, home + 1].filter(ix => ix >= 0 && ix < pdfPages.length);

   const isVariant = item.variant === true;

   /* PAGE */
   const nk = nameKeys(item.name);
   if (!isVariant && nk.length && !nameOnPdfPage(item.name, home)) {
      const nearby = [];
      for (let d = 1; d <= 15 && nearby.length < 3; d++) {
         for (const ix of [home + d, home - d]) if (nameOnPdfPage(item.name, ix)) nearby.push(printedOf(ix));
      }
      findings.push(`PAGE   "${item.name}" isn't on printed p.${item.page}${nearby.length ? `; found on p.${nearby.join(', p.')}` : ''}`);
      summary.PAGE++;
   }

   /* TEXT */
   const nearIndex = gramIndex(near.flatMap(ix => pageTokens[ix]));
   for (const { where, text } of proseStrings(item, '', false, [])) {
      const toks = tokenize(renderPlain(text));
      if (toks.length < 3) continue;
      if (!text.replace(/{@[^{}]*}/g, '').replace(/[s.,;:]/g, '')) continue;
      /* a match must be close to count: common phrases anchor anywhere */
      let res = locate(toks, nearIndex);
      if (res && res.cost > toks.length * 0.6) res = null;
      let elsewhere = '';
      if (!res) {
         res = locateAnywhere(toks);
         if (res && res.cost > toks.length * 0.15) res = null;
         if (res) elsewhere = ` (text is on p.${res.page})`;
      }
      if (!res) {
         const key = text.length > 140 ? `${text.slice(0, 140)}…` : text;
         if (!misses.has(key)) misses.set(key, []);
         misses.get(key).push(`${group}["${item.name}"].${where}`);
         summary.MISS++;
         continue;
      }
      for (const h of hunks(res.ops)) {
         findings.push(`TEXT   ${where}${elsewhere}: …${h.before} [data: "${h.data}" → book: "${h.book}"] ${h.after}…`);
         summary.TEXT++;
      }
   }

   /* STATS */
   if (group === 'adversary' && !isVariant) {
      const stats = compareAdversary(item, near);
      summary.STATS += stats.length;
      findings.push(...stats);
   }

   if (findings.length && reported < MAX) {
      console.log(`\n${group}["${item.name}"] p.${item.page}`);
      for (const f of findings) console.log(`   ${f}`);
      reported++;
   }
}

if (misses.size) {
   console.log('\n== MISS: prose not found anywhere in the book (curator-added, or reworded too much to match)');
   for (const [text, wheres] of misses) {
      console.log(`   "${text}"`);
      console.log(`      in ${wheres.slice(0, 4).join(', ')}${wheres.length > 4 ? ` (+${wheres.length - 4} more)` : ''}`);
   }
}

console.log(`\nchecked ${checked} item(s): ${Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(', ')}`);
if (reported >= MAX) console.log(`(output capped at ${MAX} items; use --max, --pages, or --group)`);
