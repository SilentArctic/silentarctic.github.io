#!/usr/bin/env node
/**
 * Apply small, approved fixes to existing items in a content pack without reformatting the file.
 *
 *   node patch.js <fixes.json> --dest <pack.json> [--dry-run] [--allow-schema-errors]
 *
 * fixes.json is an array of operations, each on one item (found by group + name):
 *   { "group": "adversary", "name": "Elder Titan", "path": "skills[6].ranks", "set": 4 }
 *   { "group": "adversary", "name": "Naalu Exploiter", "path": "skills[4].source", "delete": true }
 *   { "group": "adversary", "name": "Empyrean Observer", "path": "abilities", "set": ["EM Flood", "Flyer", "…"] }
 *   { "group": "talent", "name": "X", "path": "description[0]", "set": "Whole new paragraph text." }
 *   { "group": "adversary", "name": "Wake Worm", "path": "page", "set": 243 }
 *   { "group": "adversaryAbility", "name": "Swat", "path": "description[0]", "find": "Rulebook)).", "replace": "Rulebook)." }
 *
 * - `set` replaces the value at `path` (the key must already exist, except on objects where it's added last).
 *   A replaced array keeps its layout: one element per line if it was multi-line, inline otherwise.
 * - `delete` removes an object property.
 * - `find`/`replace` edits text inside one string value; `find` must occur exactly once in it.
 * Safety: every other item must stay deep-equal, each operation's result is verified, and new schema errors abort
 * (unless --allow-schema-errors). Nothing is written if any check fails.
 */
const fs = require('fs');
const path = require('path');
const lib = require('./lib');

process.on('uncaughtException', e => {
   console.error(`nothing written: ${e.message}`);
   process.exit(1);
});

const { flags, positional } = lib.parseArgs(process.argv.slice(2), ['dry-run', 'allow-schema-errors']);
const fixesFile = positional[0];
if (!fixesFile || !flags.dest) {
   console.error('usage: patch.js <fixes.json> --dest <pack.json> [--dry-run] [--allow-schema-errors]');
   process.exit(2);
}
const destFile = path.resolve(flags.dest);
const fixes = lib.readJson(path.resolve(fixesFile));
if (!Array.isArray(fixes)) {
   console.error('fixes file must be a JSON array of operations');
   process.exit(2);
}

let text = lib.readText(destFile);
const hadBom = text.startsWith('\uFEFF');
if (hadBom) text = text.slice(1);
const original = JSON.parse(text);
const EOL = text.includes('\r\n') ? '\r\n' : '\n';

function parsePath(p) {
   const parts = [];
   for (const m of String(p).matchAll(/([^.[\]]+)|\[(\d+)\]/g)) parts.push(m[2] !== undefined ? Number(m[2]) : m[1]);
   return parts;
}

function itemNode(root, group, name) {
   const groupProp = root.props.find(p => p.key === group);
   if (!groupProp) throw new Error(`no group "${group}"`);
   const data = JSON.parse(text)[group];
   const matches = data.map((it, k) => (it?.name === name ? k : -1)).filter(k => k !== -1);
   if (matches.length !== 1) throw new Error(`${group}["${name}"]: ${matches.length} items with that name`);
   return groupProp.value.elements[matches[0]];
}

function walk(node, parts, label) {
   let cur = node;
   let parent = null;
   let last = null;
   for (const part of parts) {
      parent = cur;
      last = part;
      if (typeof part === 'number') {
         if (cur.type !== 'array' || !cur.elements[part]) throw new Error(`${label}: no element [${part}]`);
         cur = cur.elements[part];
      } else {
         if (cur.type !== 'object') throw new Error(`${label}: "${part}" is not inside an object`);
         const prop = cur.props.find(p => p.key === part);
         if (!prop) return { node: null, parent, key: part };
         cur = prop.value;
      }
   }
   return { node: cur, parent, key: last };
}

/* the whitespace that starts the line containing `offset` */
function leadingSpace(offset) {
   const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
   return /^[ \t]*/.exec(text.slice(lineStart, offset))[0];
}

/* serialize a value to sit where `node` was, keeping the old layout */
function serializeLike(value, node) {
   const oldText = text.slice(node.start, node.end);
   const multiLine = oldText.includes('\n');
   if (!multiLine || value === null || typeof value !== 'object') return JSON.stringify(value);
   const baseIndent = leadingSpace(node.start);
   const first = node.elements?.[0]?.start ?? node.props?.[0]?.keyStart;
   const unit = (first !== undefined && leadingSpace(first).slice(baseIndent.length)) || '   ';
   return JSON.stringify(value, null, unit).split('\n').join(EOL + baseIndent);
}

const applied = [];
for (const [n, op] of fixes.entries()) {
   const label = `#${n + 1} ${op.group}["${op.name}"].${op.path}`;
   const parts = parsePath(op.path);
   if (!parts.length) throw new Error(`${label}: empty path`);
   const root = lib.parseWithSpans(text);
   const item = itemNode(root, op.group, op.name);
   const { node, parent, key } = walk(item, parts, label);
   const splice = (a, b, s) => {
      text = text.slice(0, a) + s + text.slice(b);
   };

   if (op.delete) {
      if (!node) throw new Error(`${label}: nothing to delete`);
      if (parent.type !== 'object') throw new Error(`${label}: delete only works on object properties`);
      const k = parent.props.findIndex(p => p.key === key);
      const prop = parent.props[k];
      if (k > 0) splice(parent.props[k - 1].value.end, prop.value.end, '');
      else if (parent.props.length > 1) splice(prop.keyStart, parent.props[1].keyStart, '');
      else splice(parent.start, parent.end, '{}');
      applied.push({ label, parts, expect: undefined });
   } else if (op.find !== undefined) {
      if (!node || node.type !== 'string') throw new Error(`${label}: find/replace needs a string value`);
      const count = node.value.split(op.find).length - 1;
      if (count !== 1) throw new Error(`${label}: "${op.find}" occurs ${count} times (must be exactly once)`);
      const next = node.value.replace(op.find, () => op.replace);
      splice(node.start, node.end, JSON.stringify(next));
      applied.push({ label, parts, expect: next });
   } else if ('set' in op) {
      if (node) {
         splice(node.start, node.end, serializeLike(op.set, node));
      } else {
         if (parent.type !== 'object') throw new Error(`${label}: path doesn't exist`);
         const lastProp = parent.props[parent.props.length - 1];
         const indent = lastProp ? leadingSpace(lastProp.keyStart) : '';
         const insert = `,${EOL}${indent}${JSON.stringify(key)}: ${JSON.stringify(op.set)}`;
         if (!lastProp) throw new Error(`${label}: adding to an empty object isn't supported`);
         splice(lastProp.value.end, lastProp.value.end, insert);
      }
      applied.push({ label, parts, expect: op.set });
   } else {
      throw new Error(`${label}: needs "set", "delete", or "find"/"replace"`);
   }
   applied[applied.length - 1].op = op;
}

/* ---------------------------------------------------------------- verify */

const result = JSON.parse(text);
const problems = [];
const touched = new Set(fixes.map(f => `${f.group}\u0000${f.name}`));
for (const group of new Set([...Object.keys(original), ...Object.keys(result)])) {
   const a = original[group];
   const b = result[group];
   if (!Array.isArray(a)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`"${group}" changed`);
      continue;
   }
   if (!Array.isArray(b) || a.length !== b.length) {
      problems.push(`group "${group}" changed length`);
      continue;
   }
   a.forEach((it, k) => {
      if (!touched.has(`${group}\u0000${it?.name}`) && JSON.stringify(it) !== JSON.stringify(b[k])) problems.push(`untouched item ${group}["${it?.name}"] changed`);
   });
}
for (const a of applied) {
   const item = result[a.op.group].find(x => x?.name === a.op.name);
   let v = item;
   for (const p of a.parts) v = v == null ? undefined : v[p];
   if (JSON.stringify(v) !== JSON.stringify(a.expect)) problems.push(`${a.label}: result ${JSON.stringify(v)} ≠ expected ${JSON.stringify(a.expect)}`);
}
if (problems.length) {
   console.error(`nothing written:\n  - ${problems.join('\n  - ')}`);
   process.exit(1);
}

const validate = lib.makeValidator();
const beforeKeys = lib.schemaErrorKeys(original, validate(original).errors || []);
const afterKeys = lib.schemaErrorKeys(result, validate(result).errors || []);
const newErrors = [...afterKeys].filter(k => !beforeKeys.has(k));

console.log(`patch: ${applied.length} operation(s) → ${lib.relative(destFile)}${flags['dry-run'] ? ' [dry run]' : ''}`);
for (const a of applied) {
   const before = (() => {
      let v = original[a.op.group].find(x => x?.name === a.op.name);
      for (const p of a.parts) v = v == null ? undefined : v[p];
      return v;
   })();
   const show = v => (v === undefined ? '(none)' : JSON.stringify(v).slice(0, 160));
   console.log(`   ${a.label.replace(/^#\d+ /, '')}: ${show(before)} → ${show(a.expect)}`);
}
if (newErrors.length) {
   console.log(`\nnew schema errors (${newErrors.length}):\n   ${newErrors.join('\n   ')}`);
   if (!flags['allow-schema-errors']) {
      console.error('\nnothing written (new schema errors; fix the operations or pass --allow-schema-errors with approval)');
      process.exit(1);
   }
}
if (!flags['dry-run']) {
   fs.writeFileSync(destFile, (hadBom ? '\uFEFF' : '') + text);
   console.log('\nwritten. Next: bump-version.js --dest <pack>');
}
