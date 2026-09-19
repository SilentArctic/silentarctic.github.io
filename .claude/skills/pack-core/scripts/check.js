#!/usr/bin/env node
/**
 * Lint staged items (or a whole pack) for a GenesysRef content pack.
 *
 *   node check.js <staged.json> --dest <pack.json>        lint staged items against their destination
 *   node check.js --dest <pack.json> --all                lint every item already in a pack
 *
 * Options:
 *   --no-hints     skip the "possible untagged reference" scan (default off with --all)
 *   --hints        force the scan on with --all
 *   --max <n>      max lines printed per section (default 400)
 *
 * Sections: SCHEMA, TAGS, REFS, HYGIENE, HINTS. Exit code 1 when SCHEMA, TAGS,
 * or REFS contain errors; HYGIENE and HINTS never fail the run.
 */
const path = require('path');
const fs = require('fs');
const lib = require('./lib');

const { flags, positional } = lib.parseArgs(process.argv.slice(2), ['all', 'hints', 'no-hints']);
if (!flags.dest) {
   console.error('usage: check.js <staged.json> --dest <pack.json>  |  check.js --dest <pack.json> --all');
   process.exit(2);
}

const destFile = path.resolve(flags.dest);
if (!fs.existsSync(destFile)) {
   console.error(`destination not found: ${destFile}`);
   process.exit(2);
}
const allMode = !!flags.all;
const stagedFile = positional[0] ? path.resolve(positional[0]) : null;
if (!allMode && !stagedFile) {
   console.error('pass a staged file, or --all to lint the whole destination');
   process.exit(2);
}
const MAX = Number(flags.max || 400);
const wantHints = flags['no-hints'] ? false : (allMode ? !!flags.hints : true);

const dest = lib.readJson(destFile);
const destAbbr = dest?._meta?.source?.abbreviation;
if (!destAbbr) {
   console.error('destination has no _meta.source.abbreviation');
   process.exit(2);
}
const destAbbrLower = destAbbr.toLowerCase();

let staged = null;
if (stagedFile) {
   staged = lib.readJson(stagedFile);
   if (!staged || typeof staged !== 'object' || Array.isArray(staged)) {
      console.error('staged file must be an object of { "<group>": [items] }');
      process.exit(2);
   }
}

/* effective destination = destination with staged items added/replaced (so staged items can reference each other) */
const effectiveDest = JSON.parse(JSON.stringify(dest));
if (staged) {
   for (const [group, items] of Object.entries(staged)) {
      if (!Array.isArray(items)) continue;
      const list = Array.isArray(effectiveDest[group]) ? effectiveDest[group] : (effectiveDest[group] = []);
      for (const item of items) {
         const idx = list.findIndex(x => sameName(x?.name, item?.name));
         if (idx === -1) list.push(item);
         else list[idx] = item;
      }
   }
}

const packs = lib.loadPacks({ [destFile]: effectiveDest });
const destPack = packs.byFile.get(destFile) || [...packs.byAbbr.values()].find(p => p.abbrLower === destAbbrLower);
const crbPack = packs.byAbbr.get('crb');

const out = { SCHEMA: [], TAGS: [], REFS: [], HYGIENE: [], HINTS: [] };
const counts = { SCHEMA: 0, TAGS: 0, REFS: 0 }; // errors only

function error(section, msg) {
   out[section].push(`ERROR  ${msg}`);
   if (section in counts) counts[section]++;
}
function warn(section, msg) {
   out[section].push(`warn   ${msg}`);
}
function hint(section, msg) {
   out[section].push(`hint   ${msg}`);
}

function sameName(a, b) {
   return typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/* ---------------------------------------------------------------- SCHEMA */

const validate = lib.makeValidator();
{
   const collection = allMode ? dest : { _meta: dest._meta, ...staged };
   const { valid, errors } = validate(collection);
   if (!valid) {
      for (const line of lib.formatSchemaErrors(collection, errors, Infinity)) error('SCHEMA', line);
   }
}

/* staged-only structural checks */
if (staged) {
   for (const [group, items] of Object.entries(staged)) {
      if (!Array.isArray(items)) {
         error('SCHEMA', `staged group "${group}" is not an array`);
         continue;
      }
      const seen = new Set();
      for (const item of items) {
         const key = (item?.name || '').trim().toLowerCase();
         if (seen.has(key)) error('SCHEMA', `${group}: duplicate staged name ${JSON.stringify(item.name)}`);
         seen.add(key);
         const existing = (dest[group] || []).some(x => sameName(x?.name, item?.name));
         if (existing) warn('SCHEMA', `${group}[${JSON.stringify(item.name)}] already exists in the destination (update: needs approval + merge --replace)`);
         if (!existing && item && item.id !== undefined) warn('SCHEMA', `${group}[${JSON.stringify(item.name)}] new items should not carry an "id"`);
      }
   }
}

/* ---------------------------------------------------------------- helpers */

const PROSE_KEYS = new Set([
   'description', 'entries', 'items', 'narrative', 'structured', 'shouldUse', 'shouldNotUse', 'why',
   'summary', 'lore', 'codex', 'characterOptions', 'info', 'gear', 'details', 'foot', 'subtitle', 'chapters',
]);
const SKIP_KEYS = new Set(['tags', 'settings', 'id', 'imageUrl', 'coverImageUrl', 'backgroundUrl', 'coverBackgroundUrl', '_ref']);

function walkStrings(value, pathArr, cb) {
   if (typeof value === 'string') cb(value, pathArr);
   else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, pathArr.concat(i), cb));
   else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
         if (SKIP_KEYS.has(k)) continue;
         walkStrings(v, pathArr.concat(k), cb);
      }
   }
}

function fmtPath(pathArr) {
   return pathArr.map((p, i) => (typeof p === 'number' ? `[${p}]` : (i === 0 ? p : `.${p}`))).join('');
}

function isProse(pathArr) {
   if (pathArr.includes('rows')) return true;
   const keys = pathArr.filter(p => typeof p === 'string');
   return PROSE_KEYS.has(keys[keys.length - 1]);
}

function snippet(str, start, end, pad = 40) {
   const a = Math.max(0, start - pad);
   const b = Math.min(str.length, end + pad);
   return `${a > 0 ? '…' : ''}${str.slice(a, start)}«${str.slice(start, end)}»${str.slice(end, b)}${b < str.length ? '…' : ''}`;
}

/* scan {@…} tags with nesting; returns tags (with parent/children) and brace problems */
function scanTags(str) {
   const tags = [];
   const stack = [];
   const problems = [];
   for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '{' && str[i + 1] === '@') {
         const m = /^\{@([A-Za-z]*)/.exec(str.slice(i));
         const name = m[1];
         const afterName = i + 2 + name.length;
         const tag = {
            start: i,
            name,
            spaced: str[afterName] === ' ',
            contentStart: str[afterName] === ' ' ? afterName + 1 : afterName,
            parent: stack.filter(t => !t.plain).pop() || null,
            children: [],
         };
         if (tag.parent) tag.parent.children.push(tag);
         stack.push(tag);
         i = afterName - 1;
         continue;
      }
      if (ch === '{') {
         stack.push({ plain: true, start: i });
         continue;
      }
      if (ch === '}') {
         const top = stack.pop();
         if (!top) {
            problems.push({ at: i, msg: 'unmatched "}"' });
            continue;
         }
         if (top.plain) continue;
         top.end = i + 1;
         top.content = str.slice(top.contentStart, i);
         tags.push(top);
      }
   }
   for (const t of stack) problems.push({ at: t.start, msg: t.plain ? 'unmatched "{"' : `unclosed {@${t.name}` });
   tags.sort((a, b) => a.start - b.start);
   return { tags, problems };
}

function levenshtein(a, b) {
   const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
   for (let j = 1; j <= b.length; j++) dp[0][j] = j;
   for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
         dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
   }
   return dp[a.length][b.length];
}

function suggestTag(name) {
   let best = null;
   for (const known of lib.KNOWN_TAGS) {
      const d = levenshtein(name.toLowerCase(), known.toLowerCase());
      if (d <= 3 && (!best || d < best.d)) best = { known, d };
   }
   return best ? ` (did you mean {@${best.known}?)` : '';
}

/* ---------------------------------------------------------------- reference resolution */

function packLabel(abbrLower) {
   return packs.byAbbr.get(abbrLower)?.abbr || abbrLower;
}

function elsewhere(type, name, exclude = []) {
   return lib.whereIs(packs, type, name).filter(a => !exclude.includes(a.toLowerCase()));
}

const shadowHintsShown = new Set();
const lookedIn = destAbbrLower === 'crb' ? 'CRB' : `${destAbbr} or CRB`;

/* resolve a reference TAG the way the app does: given source, else destination then CRB */
function resolveTagRef(type, name, source) {
   if (source) {
      const pack = packs.byAbbr.get(source.toLowerCase());
      if (!pack) return { error: `unknown source "${source}" (not an abbreviation in api/index.json or api/community/index.json)` };
      if (lib.packHas(pack, type, name)) return { ok: true };
      const found = elsewhere(type, name, [source.toLowerCase()]);
      return { error: `${type} "${name}" not found in ${pack.abbr}${found.length ? ` (found in: ${found.join(', ')})` : ''}` };
   }
   const inDest = lib.packHas(destPack, type, name);
   const inCrb = destAbbrLower !== 'crb' && lib.packHas(crbPack, type, name);
   if (inDest) {
      const key = `${type}|${name.toLowerCase()}`;
      if (!inCrb || shadowHintsShown.has(key)) return { ok: true };
      shadowHintsShown.add(key);
      return { ok: true, hint: `${type} "${name}" exists in both ${destAbbr} and CRB; unsourced tags resolve to ${destAbbr}'s item (add ||crb where CRB's was meant) [shown once]` };
   }
   if (lib.packHas(crbPack, type, name)) return { ok: true };
   const found = elsewhere(type, name, [destAbbrLower, 'crb']);
   if (found.length) return { error: `${type} "${name}" not in ${lookedIn}; found in ${found.join(', ')} → add ||${found[0].toLowerCase()}` };
   return { error: `${type} "${name}" not found in ${lookedIn} (or any pack)` };
}

/* resolve a STRUCTURED ref ({name, source}); unsourced refs must live in the destination */
function resolveStructuredRef(type, name, source, { anyPack = false, stripRank = false } = {}) {
   const tryNames = [name];
   if (stripRank && /\s+\d+$/.test(name)) tryNames.push(name.replace(/\s+\d+$/, ''));
   const has = pack => tryNames.some(n => lib.packHas(pack, type, n));

   if (source) {
      const pack = packs.byAbbr.get(String(source).toLowerCase());
      if (!pack) return { error: `unknown source "${source}"` };
      if (has(pack)) return { ok: true };
      const found = tryNames.flatMap(n => elsewhere(type, n, [String(source).toLowerCase()]));
      return { error: `${type} "${name}" not found in ${pack.abbr}${found.length ? ` (found in: ${[...new Set(found)].join(', ')})` : ''}` };
   }
   if (has(destPack)) return { ok: true };
   const found = [...new Set(tryNames.flatMap(n => elsewhere(type, n, [destAbbrLower])))];
   if (anyPack && found.length) return { ok: true };
   if (found.length) return { error: `${type} "${name}" is not in ${destAbbr}; found in ${found.join(', ')} → add "source": "${found[0].toLowerCase()}"` };
   return { error: `${type} "${name}" not found in ${destAbbr} (or any pack)` };
}

/* structured references per item group */
function structuredRefs(group, item) {
   const refs = [];
   const add = (type, ref, where, opts = {}) => {
      if (ref === undefined || ref === null) return;
      if (typeof ref === 'string') refs.push({ type, name: ref, source: undefined, where, opts });
      else if (typeof ref === 'object' && typeof ref.name === 'string') refs.push({ type, name: ref.name, source: ref.source, where, opts });
   };
   const each = (arr, fn) => (Array.isArray(arr) ? arr.forEach(fn) : null);

   switch (group) {
      case 'career':
         each(item.skills, (s, i) => add('skill', s, `skills[${i}]`));
         each(item.usefulTalents?.talents, (t, i) => add('talent', t, `usefulTalents.talents[${i}]`));
         each(item.startingGear?.selections, (sel, i) => {
            const visit = (entry, where) => {
               if (Array.isArray(entry)) entry.forEach((e, j) => visit(e, `${where}[${j}]`));
               else if (entry && !entry.money) add('gear', entry, where);
            };
            visit(sel, `startingGear.selections[${i}]`);
         });
         break;
      case 'specialization':
         add('career', item.career, 'career');
         each(item.skills, (s, i) => add('skill', s, `skills[${i}]`));
         for (const [row, talents] of Object.entries(item.talents || {})) each(talents, (t, i) => add('talent', t, `talents.${row}[${i}]`));
         break;
      case 'adversary':
         each(item.skills, (s, i) => add('skill', s, `skills[${i}]`));
         each(item.talents, (t, i) => add('talent', t, `talents[${i}]`, { stripRank: true }));
         each(item.abilities, (a, i) => {
            if (typeof a === 'string') add('adversaryAbility', a, `abilities[${i}]`, { anyPack: true, stripRank: true });
         });
         each(item.weapons, (w, i) => {
            add('skill', w.skill, `weapons[${i}].skill`);
            each(w.qualities, (q, j) => add('quality', q, `weapons[${i}].qualities[${j}]`));
         });
         each(item.spells?.skills, (s, i) => add('skill', s, `spells.skills[${i}]`));
         break;
      case 'archetype': {
         each(item.skills?.skills, (s, i) => add('skill', s, `skills.skills[${i}]`, typeof s === 'string' ? { lenient: true } : {}));
         const visitChoice = (entry, where) => {
            if (Array.isArray(entry)) entry.forEach((e, j) => visitChoice(e, `${where}[${j}]`));
            else if (entry && typeof entry === 'object') add('skill', entry, where);
         };
         if (Array.isArray(item.skills?.choice)) visitChoice(item.skills.choice, 'skills.choice');
         each(item.abilities, (a, i) => {
            if (typeof a === 'string') add('archetypeAbility', a, `abilities[${i}]`, { anyPack: true });
         });
         break;
      }
      case 'gear':
         add('skill', item.skill, 'skill');
         each(item.special, (q, i) => add('quality', q, `special[${i}]`));
         each(item.qualities, (q, i) => add('quality', q, `qualities[${i}]`));
         break;
      case 'vehicle':
         add('skill', item.controlSkill, 'controlSkill');
         each(item.weapons, (w, i) => {
            add('skill', w.skill, `weapons[${i}].skill`);
            each(w.qualities, (q, j) => add('quality', q, `weapons[${i}].qualities[${j}]`));
         });
         break;
      case 'spell':
         each(item.skills, (s, i) => add('skill', s, `skills[${i}]`));
         break;
      case 'skill':
         each(item.spells, (s, i) => add('spell', s, `spells[${i}]`));
         break;
      case 'spellEffects':
         add('spell', item.spell, 'spell', { lenient: true });
         break;
      default:
         break;
   }
   return refs;
}

/* ---------------------------------------------------------------- tag lint */

const STYLE_ORDER = lib.STYLE_TAGS; // title, code, b, i, s, u

function lintTags(str, where) {
   const { tags, problems } = scanTags(str);
   for (const p of problems) error('TAGS', `${where}: ${p.msg}: ${snippet(str, p.at, p.at + 1)}`);

   for (const tag of tags) {
      const at = snippet(str, tag.start, tag.end);
      const { name } = tag;
      if (!name) {
         error('TAGS', `${where}: empty tag name: ${at}`);
         continue;
      }
      if (!lib.KNOWN_TAGS.has(name)) {
         error('TAGS', `${where}: unknown tag {@${name}}${suggestTag(name)}: ${at}`);
         continue;
      }
      if (!tag.spaced) {
         error('TAGS', `${where}: {@${name}} needs a space before its content: ${at}`);
         continue;
      }
      const isStyle = STYLE_ORDER.includes(name);
      const content = tag.content;

      if (!isStyle && tag.children.length) {
         error('TAGS', `${where}: {@${name}} cannot contain other tags (only style tags can wrap tags): ${at}`);
         continue;
      }
      if (isStyle) {
         for (const child of tag.children) {
            if (STYLE_ORDER.includes(child.name) && STYLE_ORDER.indexOf(child.name) >= STYLE_ORDER.indexOf(name)) {
               error('TAGS', `${where}: {@${child.name}} inside {@${name}} will not render (inner style tags must come earlier in the order ${STYLE_ORDER.join(' > ')}; swap the nesting): ${at}`);
            }
         }
         if (!content.trim()) warn('TAGS', `${where}: empty {@${name}}: ${at}`);
         continue;
      }

      const parts = content.split('|');
      switch (name) {
         case 'dice': {
            const [dn, count, upgrades] = parts;
            if (!(dn in lib.DICE_NAMES)) error('TAGS', `${where}: unknown die "${dn}" (use boost/setback/ability/difficulty/proficiency/challenge, lowercase): ${at}`);
            if (count !== undefined && !/^[1-9]\d*$/.test(count)) error('TAGS', `${where}: dice count must be a positive integer (got "${count}"): ${at}`);
            if (upgrades !== undefined && upgrades !== '' && !/^\d+$/.test(upgrades)) error('TAGS', `${where}: dice upgrades must be an integer: ${at}`);
            if (upgrades && !['ability', 'difficulty'].includes(lib.DICE_NAMES[dn])) warn('TAGS', `${where}: upgrades only apply to ability/difficulty dice: ${at}`);
            if (dn in lib.DICE_NAMES && lib.DICE_NAMES[dn] !== dn) hint('TAGS', `${where}: prefer the full die name "${lib.DICE_NAMES[dn]}": ${at}`);
            break;
         }
         case 'symbols': {
            if (/[^asthfd\s]/.test(content.replace(/\b(or|and)\b/g, ''))) error('TAGS', `${where}: symbols may only use a s t h f d (plus " or "/" and "): ${at}`);
            else if (!/^[asthfd]+(\s+(or|and)\s+[asthfd]+)*$/.test(content)) warn('TAGS', `${where}: unusual symbols content "${content}": ${at}`);
            break;
         }
         case 'combat':
         case 'general':
         case 'social':
            if (!/^\d+$/.test(content)) error('TAGS', `${where}: {@${name}} expects a number: ${at}`);
            break;
         case 'difficulty': {
            const [level, skill, upgrades, source] = parts;
            if (!lib.DIFFICULTIES.includes((level || '').toLowerCase())) error('TAGS', `${where}: unknown difficulty "${level}": ${at}`);
            if (upgrades !== undefined && upgrades !== '' && !/^\d+$/.test(upgrades)) error('TAGS', `${where}: difficulty upgrades must be an integer: ${at}`);
            if (skill && skill.trim()) {
               const skills = /\s+or\s+/i.test(skill) ? skill.split(/\s+or\s+/i) : [skill];
               for (const s of skills) {
                  const r = resolveTagRef('skill', s.trim(), source && source.trim() ? source.trim() : undefined);
                  if (r.error) (skills.length > 1 ? warn : error)('REFS', `${where}: difficulty skill: ${r.error}: ${at}`);
               }
            }
            break;
         }
         case 'link':
            if (!/^https?:\/\//.test(parts[0])) warn('TAGS', `${where}: {@link} should start with http(s)://: ${at}`);
            break;
         case 'filter':
            if (parts.length < 3) error('TAGS', `${where}: {@filter} needs [item type]|[display]|[filter string]: ${at}`);
            break;
         case 'image':
         case 'genesysref':
            if (!parts[0].trim()) error('TAGS', `${where}: {@${name}} needs a target: ${at}`);
            break;
         case 'trait':
            warn('TAGS', `${where}: {@trait} is legacy (no "trait" item group); use {@optionFeature …}: ${at}`);
            break;
         default: {
            /* reference tags */
            const [refName, , ...rest] = parts;
            const source = rest.join('|');
            if (parts.length > 3) warn('TAGS', `${where}: reference tag has more than 3 parts: ${at}`);
            if (!refName || !refName.trim()) {
               error('TAGS', `${where}: reference tag without a name: ${at}`);
               break;
            }
            if (/[<>]/.test(refName)) error('TAGS', `${where}: "<" and ">" are not allowed in reference names: ${at}`);
            if (refName !== refName.trim()) warn('TAGS', `${where}: reference name has leading/trailing spaces: ${at}`);
            if (name === 'table' && /^table\s/i.test(refName.trim())) error('TAGS', `${where}: table tags omit the "Table " prefix (the app adds it): ${at}`);
            const r = resolveTagRef(name, refName.trim(), source && source.trim() && source !== 'undefined' ? source.trim() : undefined);
            if (r.error) error('REFS', `${where}: ${r.error}: ${at}`);
            else if (r.hint) hint('REFS', `${where}: ${r.hint}`);
         }
      }
   }
   return tags;
}

/* ---------------------------------------------------------------- hygiene */

function lintHygiene(str, where, tags) {
   const checks = [
      [/[\u2018\u2019\u201A\u201B\u201C\u201D\u201E]/g, 'curly quote → use straight quotes'],
      [/[\uFB00-\uFB06]/g, 'ligature character → spell out the letters'],
      [/\u00AD/g, 'soft hyphen'],
      [/[\uE000-\uF8FF\uFFFD]/g, 'private-use/replacement character (unconverted PDF glyph?)'],
      [/ {2,}/g, 'double space'],
      [/\b[A-Za-z]{2,}- (?!or\b|and\b|to\b|through\b)[a-z]{2,}\b/g, 'possible line-break hyphenation'],
   ];
   for (const [re, msg] of checks) {
      for (const m of str.matchAll(re)) warn('HYGIENE', `${where}: ${msg}: ${snippet(str, m.index, m.index + m[0].length)}`);
   }
   if (/^\s|\s$/.test(str)) warn('HYGIENE', `${where}: leading/trailing whitespace`);

   const outside = blankTags(str, tags, true);
   for (const m of outside.matchAll(/\b(Simple|Easy|Average|Hard|Daunting|Formidable)\s*\(/g)) {
      warn('HYGIENE', `${where}: untagged difficulty → {@difficulty …}: ${snippet(str, m.index, m.index + m[0].length)}`);
   }
   for (const m of outside.matchAll(/\bTables?\s+[IVX]*\.?\d+(\.\d+)?-\d+/g)) {
      warn('HYGIENE', `${where}: untagged table reference → {@table …}: ${snippet(str, m.index, m.index + m[0].length)}`);
   }
}

/**
 * Replace tag text with spaces (same length, so offsets survive).
 * keepStyleContent: blank only the {@b … } syntax of style tags, keep their inner text.
 */
function blankTags(str, tags, keepStyleContent) {
   const chars = str.split('');
   const blank = (a, b) => {
      for (let i = a; i < b; i++) chars[i] = ' ';
   };
   for (const tag of tags) {
      if (keepStyleContent && STYLE_ORDER.includes(tag.name)) {
         blank(tag.start, tag.contentStart);
         blank(tag.end - 1, tag.end);
      } else {
         blank(tag.start, tag.end);
      }
   }
   return chars.join('');
}

/* ---------------------------------------------------------------- hints (possible untagged references) */

const HINT_TYPES = ['skill', 'characteristic', 'quality', 'talent', 'rule', 'archetype', 'adversary', 'spell', 'optionFeature', 'sidebar', 'gear', 'vehicle', 'setting', 'career', 'specialization'];
/* for these, a game term is capitalized in prose ("make a Stealth check"); lowercase matches are generic words */
const REQUIRE_CAPITAL = new Set(['skill', 'characteristic', 'quality', 'talent', 'archetype', 'spell', 'career', 'specialization', 'setting']);

let hintMatchers = null;
function buildHintMatchers() {
   /* packs to draw names from: destination, CRB, and packs the destination already references */
   const raw = lib.readText(destFile);
   const referenced = new Set([destAbbrLower, 'crb']);
   for (const m of raw.matchAll(/\|\|?([A-Za-z0-9:]+)\}/g)) referenced.add(m[1].toLowerCase());
   for (const m of raw.matchAll(/"source":\s*"([^"]+)"/g)) referenced.add(m[1].toLowerCase());

   const matchers = [];
   for (const type of HINT_TYPES) {
      const map = new Map(); // lower → { name, abbr }
      for (const abbr of referenced) {
         const pack = packs.byAbbr.get(abbr);
         const names = pack?.names.get(type);
         if (!names) continue;
         for (const [lower, original] of names) {
            if (lower.length < 3 || map.has(lower)) continue;
            map.set(lower, { name: original, abbr: pack.abbrLower });
         }
      }
      if (!map.size) continue;
      const alternation = [...map.keys()]
         .sort((a, b) => b.length - a.length)
         .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
         .join('|');
      matchers.push({ type, map, re: new RegExp(`(?<![\\w'\u2019-])(?:${alternation})(?![\\w-])`, 'gi') });
   }
   return matchers;
}

function lintHints(str, where, tags, ownNames) {
   if (!hintMatchers) hintMatchers = buildHintMatchers();
   const outside = blankTags(str, tags, true);

   /* collect matches from every type, keyed by span */
   const spans = new Map();
   for (const { type, map, re } of hintMatchers) {
      for (const m of outside.matchAll(re)) {
         const lower = m[0].toLowerCase();
         if (ownNames.has(lower)) continue;
         if (REQUIRE_CAPITAL.has(type) && m[0][0] !== m[0][0].toUpperCase()) continue;
         const key = `${m.index}:${m[0].length}`;
         if (!spans.has(key)) spans.set(key, { start: m.index, end: m.index + m[0].length, text: m[0], targets: [] });
         spans.get(key).targets.push({ type, ...map.get(lower) });
      }
   }

   /* drop matches nested inside a longer match ("Xxcha" inside "Xxcha Kingdom") */
   const all = [...spans.values()];
   const kept = all.filter(s => !all.some(o => o !== s && o.start <= s.start && o.end >= s.end && (o.end - o.start) > (s.end - s.start)));

   for (const s of kept.sort((a, b) => a.start - b.start)) {
      const options = s.targets.map(t => {
         const needsSource = t.abbr !== destAbbrLower && t.abbr !== 'crb';
         const caseNote = s.text === t.name ? '' : ` [name "${t.name}"]`;
         return `{@${t.type} ${s.text}${needsSource ? `||${t.abbr}` : ''}}${caseNote}`;
      });
      hint('HINTS', `${where}: ${options.join(' OR ')}: ${snippet(str, s.start, s.end)}`);
   }
}

/* ---------------------------------------------------------------- run */

const groupsToLint = allMode ? dest : staged;
let itemCount = 0;
for (const [group, items] of Object.entries(groupsToLint)) {
   if (!Array.isArray(items)) continue;
   for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      itemCount++;
      const label = `${group}[${JSON.stringify(item.name ?? '?')}]`;

      if (item.page === undefined && !['adversaryAbility', 'archetypeAbility', 'spellEffects', 'book', 'adventure'].includes(group)) {
         warn('SCHEMA', `${label}: no "page"`);
      }

      const ownNames = new Set();
      if (typeof item.name === 'string') {
         ownNames.add(item.name.toLowerCase());
         ownNames.add(item.name.replace(/\s*\(.*\)\s*$/, '').toLowerCase());
      }

      walkStrings(item, [], (str, pathArr) => {
         const where = `${label}.${fmtPath(pathArr)}`;
         const tags = lintTags(str, where);
         if (isProse(pathArr)) {
            lintHygiene(str, where, tags);
            if (wantHints) lintHints(str, where, tags, ownNames);
         } else if (/[\u2018\u2019\u201C\u201D]/.test(str)) {
            warn('HYGIENE', `${where}: curly quote → use straight quotes`);
         }
      });

      for (const ref of structuredRefs(group, item)) {
         const r = resolveStructuredRef(ref.type, ref.name, ref.source, ref.opts);
         if (r.ok) continue;
         if (ref.opts.lenient && (lib.packHas(destPack, ref.type, ref.name) || lib.packHas(crbPack, ref.type, ref.name))) continue;
         error('REFS', `${label}.${ref.where}: ${r.error}`);
      }

      /* adversary skills: the characteristic must be the skill's linked characteristic */
      if (group === 'adversary') {
         (Array.isArray(item.skills) ? item.skills : []).forEach((s, i) => {
            if (!s || typeof s.name !== 'string' || typeof s.characteristic !== 'string') return;
            const pack = s.source ? packs.byAbbr.get(String(s.source).toLowerCase()) : destPack;
            const skill = (pack?.data?.skill || []).find(x => x.name?.toLowerCase() === s.name.toLowerCase());
            const linked = skill?.characteristic?.toLowerCase();
            if (linked && linked !== s.characteristic.toLowerCase()) {
               warn('REFS', `${label}.skills[${i}]: ${s.name} uses "${s.characteristic}", but the skill's characteristic is "${linked}"`);
            }
         });
      }
   }
}

/* ---------------------------------------------------------------- report */

const target = stagedFile ? `${lib.relative(stagedFile).startsWith('..') ? stagedFile : lib.relative(stagedFile)} → ` : '';
console.log(`check: ${target}${lib.relative(destFile)} (${destAbbr}) — ${itemCount} item(s)${allMode ? ' [--all]' : ''}`);
for (const section of Object.keys(out)) {
   const lines = out[section];
   const errs = lines.filter(l => l.startsWith('ERROR')).length;
   const status = section in counts ? (errs ? `${errs} error(s)` : 'OK') : `${lines.length} note(s)`;
   const extra = section in counts && lines.length > errs ? `, ${lines.length - errs} warning/hint(s)` : '';
   console.log(`\n== ${section}: ${status}${extra}`);
   if (section === 'HINTS' && !wantHints) {
      console.log('   (skipped)');
      continue;
   }
   for (const line of lines.slice(0, MAX)) console.log(`   ${line}`);
   if (lines.length > MAX) console.log(`   … ${lines.length - MAX} more (use --max)`);
}

const failed = counts.SCHEMA + counts.TAGS + counts.REFS;
console.log(`\n${failed ? `FAILED: ${failed} error(s)` : 'PASSED (review warnings and hints)'}`);
process.exit(failed ? 1 : 0);
