#!/usr/bin/env node
/**
 * Find text in staged adventures that is already printed in another item
 * (any group, any pack), so it can be replaced by a tag or a _ref.
 *
 *   node reprint-check.js <staged.json> --dest <pack.json> [--min <chars>]
 *
 * Also verifies every `_ref` embed (table, sidebar, rule) resolves: its
 * `source`, else the destination, else CRB (check.js skips _ref).
 *
 * Compares sentences (tags reduced to their displayed words, case and
 * whitespace normalized) of every string in the staged `adventure` items
 * against every string of every other item. Adventures with the same name
 * are skipped, so re-staging an existing adventure doesn't flag itself.
 * Exit code 1 when anything is found.
 */
const path = require('path');
const lib = require('../../pack-core/scripts/lib');

const { flags, positional } = lib.parseArgs(process.argv.slice(2));
if (!positional[0] || !flags.dest) {
   console.error('usage: reprint-check.js <staged.json> --dest <pack.json> [--min <chars>]');
   process.exit(2);
}
const MIN = Number(flags.min || 40);
const staged = lib.readJson(path.resolve(positional[0]));
const adventures = staged.adventure || [];
const stagedNames = new Set(adventures.map((a) => a.name.toLowerCase()));

/* {@type name|display|source} → display || name; style tags → their text */
function plain(text) {
   let out = text;
   let prev;
   do {
      prev = out;
      out = out.replace(/\{@(\w+) ([^{}]*)\}/g, (_, tag, body) => {
         const [name, display] = body.split('|');
         return display || name;
      });
   } while (out !== prev);
   return out.toLowerCase().replace(/["'‘’“”]/g, '').replace(/\s+/g, ' ').trim();
}

function strings(value, out = []) {
   if (typeof value === 'string') out.push(value);
   else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
   else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) if (k !== '_ref' && k !== 'imageUrl') strings(v, out);
   }
   return out;
}

/* corpus: one normalized blob per item */
const corpus = [];
const packs = lib.loadPacks();
const { byFile } = packs;
const destPack = byFile.get(path.resolve(flags.dest));
for (const pack of byFile.values()) {
   for (const [group, items] of Object.entries(pack.data)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
         if (group === 'adventure' && stagedNames.has(String(item.name).toLowerCase())) continue;
         const text = strings(item).map(plain).join(' \u0000 ');
         if (text) corpus.push({ label: `${pack.abbr} ${group} "${item.name}"`, text });
      }
   }
}
/* other groups in the staging file count too (e.g. an adversary staged in the same run) */
for (const [group, items] of Object.entries(staged)) {
   if (group === 'adventure' || !Array.isArray(items)) continue;
   for (const item of items) corpus.push({ label: `staged ${group} "${item.name}"`, text: strings(item).map(plain).join(' \u0000 ') });
}

/* _ref targets */
let badRefs = 0;
for (const a of adventures) (function walk(entries) {
   for (const e of entries || []) {
      if (!e || typeof e !== 'object') continue;
      if (e._ref) {
         const type = e.type || 'sidebar';
         const packsToTry = e._ref.source ? [packs.byAbbr.get(e._ref.source.toLowerCase())] : [destPack, packs.byAbbr.get('crb')];
         const ok = packsToTry.some((p) => lib.packHas(p, type, e._ref.name))
            || (!e._ref.source && (staged[type] || []).some((i) => i.name.toLowerCase() === e._ref.name.toLowerCase()));
         if (!ok) {
            badRefs++;
            const elsewhere = lib.whereIs(packs, type, e._ref.name);
            console.log(`- "${a.name}": _ref ${type} "${e._ref.name}"${e._ref.source ? ' (' + e._ref.source + ')' : ''} not found${elsewhere.length ? ' — exists in: ' + elsewhere.join(', ') + ' (add source)' : ''}`);
         }
      }
      walk(e.entries);
   }
}(a.chapters));
if (badRefs) console.log(`${badRefs} unresolved _ref(s).\n`);

let found = 0;
for (const adventure of adventures) {
   const seen = new Set();
   for (const s of strings(adventure.chapters)) {
      const sentences = plain(s).split(/(?<=[.!?:])\s+/).filter((x) => x.length >= MIN);
      for (const sentence of sentences) {
         const hits = corpus.filter((c) => c.text.includes(sentence)).map((c) => c.label);
         if (!hits.length) continue;
         const key = s + hits.join();
         if (seen.has(key)) continue;
         seen.add(key);
         found++;
         console.log(`- "${adventure.name}": "${s.slice(0, 90)}${s.length > 90 ? '…' : ''}"\n    also in: ${hits.join('; ')}`);
      }
   }
}
console.log(found ? `\n${found} possible reprint(s). Replace each with a tag or _ref, or keep it and say why.` : 'No reprints found.');
process.exit(found || badRefs ? 1 : 0);
