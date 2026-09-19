#!/usr/bin/env node
/**
 * Splice staged items into a content pack without reformatting anything else.
 *
 *   node merge.js <staged.json> --dest <pack.json> [options]
 *
 * Options:
 *   --dry-run               show what would change (incl. field diffs for replacements); write nothing
 *   --replace <name>        replace the existing item with this name (repeatable; only after user approval)
 *   --replace-all           replace every staged item that already exists (only after user approval)
 *   --overwrite-preserved   let staged values win for id/settings/tags/imageUrl/meta on replacements
 *   --allow-schema-errors   write even if the result has NEW schema errors (only when the user approved
 *                           following a pattern the schema doesn't support yet)
 *
 * New items are inserted following the group's existing order (alphabetical, else page, else appended).
 * Existing items are never touched unless named by --replace/--replace-all. Only new/replaced items are
 * serialized (JSON.stringify, 3-space style, file's own line endings); every other byte is preserved.
 */
const fs = require('fs');
const path = require('path');
const lib = require('./lib');

const { parseWithSpans, lineIndent } = lib;

const PRESERVE = ['id', 'settings', 'tags', 'imageUrl', 'meta'];

const { flags, positional } = lib.parseArgs(process.argv.slice(2), ['dry-run', 'replace-all', 'overwrite-preserved', 'allow-schema-errors']);
const stagedFile = positional[0] && path.resolve(positional[0]);
if (!stagedFile || !flags.dest) {
   console.error('usage: merge.js <staged.json> --dest <pack.json> [--dry-run] [--replace <name>]… [--replace-all]');
   process.exit(2);
}
const destFile = path.resolve(flags.dest);
const dryRun = !!flags['dry-run'];
const replaceNames = new Set([].concat(flags.replace || []).map(n => String(n).trim().toLowerCase()));
const replaceAll = !!flags['replace-all'];

const staged = lib.readJson(stagedFile);
const rawFile = lib.readText(destFile);
const bom = rawFile.startsWith('\uFEFF') ? '\uFEFF' : '';
const text = rawFile.slice(bom.length);
const original = JSON.parse(text);

const crlf = (text.match(/\r\n/g) || []).length;
const lfOnly = (text.match(/(?<!\r)\n/g) || []).length;
const EOL = crlf > lfOnly ? '\r\n' : '\n';

/* ---------------------------------------------------------------- helpers */

function serialize(item, unit, indent) {
   return JSON.stringify(item, null, unit).split('\n').join(EOL + indent);
}

function isPlainObject(v) {
   return v && typeof v === 'object' && !Array.isArray(v);
}

function short(v) {
   if (v === undefined) return '(absent)';
   const s = JSON.stringify(v);
   return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

function diff(a, b, p, out) {
   if (JSON.stringify(a) === JSON.stringify(b)) return out;
   if (isPlainObject(a) && isPlainObject(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p ? `${p}.${k}` : k, out);
   } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      a.forEach((_, i) => diff(a[i], b[i], `${p}[${i}]`, out));
   } else {
      out.push(`${p || '(item)'}: ${short(a)}  →  ${short(b)}`);
   }
   return out;
}

function mergeForReplace(existing, incoming) {
   const keepExisting = !flags['overwrite-preserved'];
   const out = {};
   for (const k of Object.keys(existing)) {
      if (PRESERVE.includes(k) && (keepExisting || !(k in incoming))) out[k] = existing[k];
      else if (k in incoming) out[k] = incoming[k];
   }
   for (const k of Object.keys(incoming)) {
      if (!(k in out)) out[k] = incoming[k];
   }
   return out;
}

const cmpName = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'en', { sensitivity: 'base' });

function detectOrder(items) {
   if (items.length < 2) return 'append';
   const alpha = items.every((it, i) => i === 0 || cmpName(items[i - 1].name, it.name) <= 0);
   if (alpha) return 'alphabetical';
   const paged = items.every(it => Number.isInteger(it.page)) && items.every((it, i) => i === 0 || items[i - 1].page <= it.page);
   if (paged) return 'page';
   return 'append';
}

function insertionIndex(order, items, item) {
   if (order === 'alphabetical') {
      const idx = items.findIndex(x => cmpName(x.name, item.name) > 0);
      return idx === -1 ? items.length : idx;
   }
   if (order === 'page' && Number.isInteger(item.page)) {
      /* a base item goes before its variants on the same page ("Carrier" before "Carrier (Naalu …)") */
      const variantIdx = items.findIndex(x => x.page === item.page && cmpName(String(x.name).slice(0, item.name.length + 2), `${item.name} (`) === 0);
      if (variantIdx !== -1) return variantIdx;
      /* otherwise after every item on the same or an earlier page (book order within a page is unknown) */
      const idx = items.findIndex(x => x.page > item.page);
      return idx === -1 ? items.length : idx;
   }
   return items.length;
}

/* ---------------------------------------------------------------- plan the splice */

let root;
try {
   root = parseWithSpans(text);
} catch (error) {
   console.error(`could not parse ${lib.relative(destFile)}: ${error.message}`);
   process.exit(2);
}
if (root.type !== 'object') {
   console.error('destination root is not an object');
   process.exit(2);
}

const rootIndent = (root.props[0] && lineIndent(text, root.props[0].keyStart)) || '   ';
const UNIT = rootIndent.startsWith('\t') ? '\t' : ' '.repeat(rootIndent.length || 3);

const ops = []; // { at, remove, text }
const report = { added: [], replaced: [], skipped: [], newGroups: [] };
const touched = new Map(); // group → Set(lowerName) of replaced names
const problems = [];

for (const [group, items] of Object.entries(staged)) {
   if (/^[_$]/.test(group)) {
      problems.push(`staged group "${group}" is not an item group`);
      continue;
   }
   if (!Array.isArray(items)) {
      problems.push(`staged group "${group}" is not an array`);
      continue;
   }
   const seen = new Set();
   for (const it of items) {
      const k = String(it?.name ?? '').trim().toLowerCase();
      if (!k) problems.push(`${group}: staged item without a name`);
      if (seen.has(k)) problems.push(`${group}: duplicate staged name ${JSON.stringify(it.name)}`);
      seen.add(k);
   }

   const prop = root.props.find(p => p.key === group);
   const existingItems = Array.isArray(original[group]) ? original[group] : null;

   if (prop && prop.value.type !== 'array') {
      problems.push(`destination "${group}" is not an array`);
      continue;
   }

   /* group doesn't exist yet: append a new top-level property */
   if (!prop) {
      const elemIndent = rootIndent + UNIT;
      const body = items.map(it => serialize(it, UNIT, elemIndent)).join(`,${EOL}${elemIndent}`);
      const arrayText = `[${EOL}${elemIndent}${body}${EOL}${rootIndent}]`;
      const last = root.props[root.props.length - 1];
      ops.push({ at: last.value.end, remove: 0, text: `,${EOL}${rootIndent}${JSON.stringify(group)}: ${arrayText}` });
      report.newGroups.push(group);
      items.forEach(it => report.added.push(`${group}: ${it.name}`));
      continue;
   }

   const arr = prop.value;
   const propIndent = lineIndent(text, prop.keyStart) ?? rootIndent;
   const elemIndent = (arr.elements[0] && lineIndent(text, arr.elements[0].start)) ?? propIndent + UNIT;
   const order = detectOrder(existingItems);
   const replacedHere = new Set();
   const inserts = new Map(); // slot index → items

   for (const item of items) {
      const lower = String(item.name).trim().toLowerCase();
      const idx = existingItems.findIndex(x => String(x?.name ?? '').trim().toLowerCase() === lower);
      if (idx !== -1) {
         if (replaceAll || replaceNames.has(lower)) {
            const merged = mergeForReplace(existingItems[idx], item);
            const changes = diff(existingItems[idx], merged, '', []);
            const el = arr.elements[idx];
            ops.push({ at: el.start, remove: el.end - el.start, text: serialize(merged, UNIT, elemIndent) });
            replacedHere.add(lower);
            report.replaced.push({ label: `${group}: ${item.name}`, changes });
         } else {
            const changes = diff(existingItems[idx], mergeForReplace(existingItems[idx], item), '', []);
            report.skipped.push({ label: `${group}: ${item.name}`, changes });
         }
         continue;
      }
      const slot = insertionIndex(order, existingItems, item);
      if (!inserts.has(slot)) inserts.set(slot, []);
      inserts.get(slot).push(item);
      report.added.push(`${group}: ${item.name}${order === 'append' ? '' : ` (${order} order, position ${slot})`}`);
   }
   touched.set(group, replacedHere);

   for (const [slot, slotItems] of inserts) {
      if (order === 'alphabetical') slotItems.sort((a, b) => cmpName(a.name, b.name));
      else if (order === 'page') slotItems.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
      const texts = slotItems.map(it => serialize(it, UNIT, elemIndent));
      if (arr.elements.length === 0) {
         ops.push({ at: arr.start, remove: arr.end - arr.start, text: `[${EOL}${elemIndent}${texts.join(`,${EOL}${elemIndent}`)}${EOL}${propIndent}]` });
      } else if (slot >= arr.elements.length) {
         ops.push({ at: arr.elements[arr.elements.length - 1].end, remove: 0, text: texts.map(t => `,${EOL}${elemIndent}${t}`).join('') });
      } else {
         ops.push({ at: arr.elements[slot].start, remove: 0, text: texts.map(t => `${t},${EOL}${elemIndent}`).join('') });
      }
   }
}

for (const name of replaceNames) {
   const inStaged = Object.values(staged).some(items => Array.isArray(items) && items.some(it => String(it?.name ?? '').trim().toLowerCase() === name));
   if (!inStaged) problems.push(`--replace "${name}" does not match any staged item`);
}

if (problems.length) {
   console.error(`merge aborted:\n  - ${problems.join('\n  - ')}`);
   process.exit(1);
}

/* apply from the end so earlier offsets stay valid; at equal offsets, replace before inserting */
ops.sort((a, b) => (b.at - a.at) || (b.remove - a.remove));
let result = text;
for (const op of ops) result = result.slice(0, op.at) + op.text + result.slice(op.at + op.remove);

/* ---------------------------------------------------------------- safety checks */

let merged;
try {
   merged = JSON.parse(result);
} catch (error) {
   console.error(`internal error: merged text is not valid JSON (${error.message}); nothing written`);
   process.exit(1);
}

const untouchedProblems = [];
for (const key of Object.keys(original)) {
   if (!(key in staged)) {
      if (JSON.stringify(original[key]) !== JSON.stringify(merged[key])) untouchedProblems.push(`"${key}" changed unexpectedly`);
      continue;
   }
   const stagedNames = new Set(staged[key].map(it => String(it.name).trim().toLowerCase()));
   const replaced = touched.get(key) || new Set();
   const before = original[key].filter(it => !replaced.has(String(it?.name ?? '').trim().toLowerCase()));
   const after = merged[key].filter(it => {
      const n = String(it?.name ?? '').trim().toLowerCase();
      return !(stagedNames.has(n) && (replaced.has(n) || !original[key].some(o => String(o?.name ?? '').trim().toLowerCase() === n)));
   });
   if (JSON.stringify(before) !== JSON.stringify(after)) untouchedProblems.push(`existing "${key}" items changed unexpectedly`);
}
if (untouchedProblems.length) {
   console.error(`internal error, nothing written:\n  - ${untouchedProblems.join('\n  - ')}`);
   process.exit(1);
}

const validate = lib.makeValidator();
const beforeKeys = lib.schemaErrorKeys(original, validate(original).errors);
const afterKeys = lib.schemaErrorKeys(merged, validate(merged).errors);
const newErrors = [...afterKeys].filter(k => !beforeKeys.has(k));

/* ---------------------------------------------------------------- report */

console.log(`merge: ${lib.relative(stagedFile).startsWith('..') ? stagedFile : lib.relative(stagedFile)} → ${lib.relative(destFile)}${dryRun ? ' [dry run]' : ''}`);
console.log(`line endings: ${EOL === '\r\n' ? 'CRLF' : 'LF'}`);
if (report.newGroups.length) console.log(`new groups: ${report.newGroups.join(', ')}`);
console.log(`\nadded (${report.added.length}):`);
report.added.forEach(a => console.log(`   + ${a}`));
console.log(`\nreplaced (${report.replaced.length}):`);
for (const r of report.replaced) {
   console.log(`   ~ ${r.label}`);
   (r.changes.length ? r.changes : ['(no changes)']).forEach(c => console.log(`        ${c}`));
}
console.log(`\nexisting, NOT replaced (${report.skipped.length})${report.skipped.length ? ' — replace only after the user approves: --replace "<name>"' : ''}:`);
for (const s of report.skipped) {
   console.log(`   = ${s.label}`);
   (s.changes.length ? s.changes : ['(identical)']).forEach(c => console.log(`        ${c}`));
}

console.log(`\nschema: ${beforeKeys.size} pre-existing error(s) in the destination; ${newErrors.length} new`);
newErrors.slice(0, 80).forEach(e => console.log(`   NEW  ${e}`));

if (newErrors.length && !flags['allow-schema-errors']) {
   console.log('\nABORTED: the merge would introduce new schema errors; nothing written.');
   process.exit(1);
}
if (dryRun) {
   console.log('\ndry run — nothing written.');
   process.exit(0);
}
if (!ops.length) {
   console.log('\nnothing to write.');
   process.exit(0);
}
fs.writeFileSync(destFile, bom + result, 'utf8');
console.log(`\nwrote ${lib.relative(destFile)}`);
