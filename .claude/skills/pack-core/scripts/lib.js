/**
 * Shared helpers for the pack-* skills: repo discovery, pack loading,
 * name indexes, schema validation, and reference-type metadata.
 */
const fs = require('fs');
const path = require('path');

/* walk up from this file until we find the repo root (has schemas/index.js and api/) */
function findRepoRoot(start = __dirname) {
   let dir = start;
   for (;;) {
      if (fs.existsSync(path.join(dir, 'schemas', 'index.js')) && fs.existsSync(path.join(dir, 'api'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error('Could not find the genesysref-api repo root (schemas/index.js).');
      dir = parent;
   }
}

const ROOT = findRepoRoot();

function readText(file) {
   return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
   return JSON.parse(readText(file).replace(/^\uFEFF/, ''));
}

/* item groups whose names can be targets of reference tags */
const REF_TYPES = [
   'adversary', 'adversaryAbility', 'archetype', 'archetypeAbility', 'book', 'career',
   'characteristic', 'gear', 'optionFeature', 'rule', 'setting', 'sidebar', 'skill',
   'specialization', 'spell', 'table', 'talent', 'quality', 'vehicle',
];

/* tags that are not references; `trait` is a legacy reference tag with no item group */
const STYLE_TAGS = ['title', 'code', 'b', 'i', 's', 'u']; // processing order in replaceTags/index.ts
const OTHER_TAGS = ['dice', 'symbols', 'combat', 'general', 'social', 'image', 'difficulty', 'link', 'genesysref', 'filter', 'trait'];
const KNOWN_TAGS = new Set([...STYLE_TAGS, ...OTHER_TAGS, ...REF_TYPES]);

const DICE_NAMES = {
   boost: 'boost', blue: 'boost', b: 'boost',
   setback: 'setback', black: 'setback', k: 'setback',
   ability: 'ability', green: 'ability', g: 'ability',
   difficulty: 'difficulty', purple: 'difficulty', p: 'difficulty',
   proficiency: 'proficiency', yellow: 'proficiency', y: 'proficiency',
   challenge: 'challenge', red: 'challenge', r: 'challenge',
};

const DIFFICULTIES = ['simple', 'easy', 'average', 'hard', 'daunting', 'formidable'];

/* every pack file in api/ and api/community/ */
function listPackFiles() {
   const files = [];
   for (const dir of ['api', path.join('api', 'community')]) {
      const abs = path.join(ROOT, dir);
      for (const f of fs.readdirSync(abs)) {
         if (f.endsWith('.json') && f !== 'index.json') files.push(path.join(abs, f));
      }
   }
   return files;
}

/**
 * Load every pack. `overrides` maps an absolute file path to in-memory data
 * (used to swap in a destination that includes staged items).
 * Returns { byAbbr: Map<abbrLower, pack>, byFile: Map<absPath, pack> }.
 */
function loadPacks(overrides = {}) {
   const byAbbr = new Map();
   const byFile = new Map();
   const normalizedOverrides = {};
   for (const [k, v] of Object.entries(overrides)) normalizedOverrides[path.resolve(k)] = v;

   for (const file of listPackFiles()) {
      let data;
      try {
         data = normalizedOverrides[path.resolve(file)] || readJson(file);
      } catch (error) {
         console.error(`warning: could not parse ${path.relative(ROOT, file)}: ${error.message}`);
         continue;
      }
      const abbr = data?._meta?.source?.abbreviation;
      if (!abbr) continue;
      const pack = { file, abbr, abbrLower: abbr.toLowerCase(), data, names: buildNameIndex(data) };
      byAbbr.set(pack.abbrLower, pack);
      byFile.set(path.resolve(file), pack);
   }

   /* a destination that doesn't exist on disk yet (new pack) */
   for (const [file, data] of Object.entries(normalizedOverrides)) {
      if (byFile.has(file)) continue;
      const abbr = data?._meta?.source?.abbreviation;
      if (!abbr) continue;
      const pack = { file, abbr, abbrLower: abbr.toLowerCase(), data, names: buildNameIndex(data) };
      byAbbr.set(pack.abbrLower, pack);
      byFile.set(file, pack);
   }

   return { byAbbr, byFile };
}

/* Map<group, Map<lowerName, originalName>> */
function buildNameIndex(data) {
   const index = new Map();
   for (const [group, items] of Object.entries(data)) {
      if (!Array.isArray(items)) continue;
      const names = new Map();
      for (const item of items) {
         if (item && typeof item.name === 'string') names.set(item.name.trim().toLowerCase(), item.name);
      }
      index.set(group, names);
   }
   return index;
}

/* does `pack` contain an item of `type` named `name`? (tables are stored with a "Table " prefix) */
function packHas(pack, type, name) {
   if (!pack) return false;
   const names = pack.names.get(type);
   if (!names) return false;
   const lower = name.trim().toLowerCase();
   if (type === 'table') return names.has(`table ${lower}`) || names.has(lower);
   return names.has(lower);
}

/* list of pack abbreviations (original case) that contain type/name */
function whereIs(packs, type, name) {
   const found = [];
   for (const pack of packs.byAbbr.values()) {
      if (packHas(pack, type, name)) found.push(pack.abbr);
   }
   return found;
}

/* schema validation, configured exactly like __tests__/collectionSchema.test.js */
function makeValidator() {
   const AJV = require(require.resolve('ajv', { paths: [ROOT] }));
   const schemas = require(path.join(ROOT, 'schemas'));
   return collection => {
      const ajv = new AJV({ schemas: Object.values(schemas), allErrors: true });
      const valid = ajv.validate(schemas.schema, collection);
      return { valid, errors: ajv.errors || [] };
   };
}

/**
 * Turn ajv's `.group[3].description[0]` into `group["Item Name"].description[0]`
 * so errors survive index shifts and are readable.
 */
function describeDataPath(collection, dataPath) {
   const match = /^\.([A-Za-z$_]+)\[(\d+)\](.*)$/.exec(dataPath || '');
   if (!match) return dataPath || '(root)';
   const [, group, index, rest] = match;
   const item = collection?.[group]?.[Number(index)];
   const label = item && typeof item.name === 'string' ? JSON.stringify(item.name) : `#${index}`;
   return `${group}[${label}]${rest}`;
}

/* stable, de-duplicated error keys ("group[name]path: message") */
function schemaErrorKeys(collection, errors) {
   const keys = new Set();
   for (const e of errors) {
      const params = e.params && Object.keys(e.params).length ? ` ${JSON.stringify(e.params)}` : '';
      keys.add(`${describeDataPath(collection, e.dataPath)}: ${e.message}${params}`);
   }
   return keys;
}

/* collapse ajv's oneOf/anyOf noise into a short per-item listing */
function formatSchemaErrors(collection, errors, max = 60) {
   const keys = [...schemaErrorKeys(collection, errors)];
   const lines = keys.slice(0, max);
   if (keys.length > max) lines.push(`… ${keys.length - max} more`);
   return lines;
}

/**
 * Parse CLI args: positionals plus --flag / --flag value. Repeated flags
 * accumulate into arrays.
 */
function parseArgs(argv, booleanFlags = []) {
   const positional = [];
   const flags = {};
   for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg.startsWith('--')) {
         positional.push(arg);
         continue;
      }
      const eq = arg.indexOf('=');
      let key = arg.slice(2);
      let value;
      if (eq !== -1) {
         key = arg.slice(2, eq);
         value = arg.slice(eq + 1);
      } else if (booleanFlags.includes(key)) {
         value = true;
      } else {
         value = argv[i + 1];
         i++;
      }
      if (flags[key] === undefined) flags[key] = value;
      else flags[key] = [].concat(flags[key], value);
   }
   return { positional, flags };
}

/**
 * Parse JSON text into a tree of nodes carrying [start, end) offsets, so callers can splice
 * the original text without reformatting it.
 */
function parseWithSpans(src) {
   let i = 0;
   const ws = () => {
      while (i < src.length && /\s/.test(src[i])) i++;
   };
   const fail = msg => {
      throw new Error(`${msg} at offset ${i}`);
   };
   function string() {
      const start = i;
      i++;
      while (src[i] !== '"') {
         if (i >= src.length) fail('unterminated string');
         if (src[i] === '\\') i++;
         i++;
      }
      i++;
      return { type: 'string', start, end: i, value: JSON.parse(src.slice(start, i)) };
   }
   function value() {
      ws();
      const start = i;
      const c = src[i];
      if (c === '{') {
         i++;
         const props = [];
         ws();
         if (src[i] === '}') {
            i++;
            return { type: 'object', start, end: i, props };
         }
         for (;;) {
            ws();
            if (src[i] !== '"') fail('expected key');
            const key = string();
            ws();
            if (src[i] !== ':') fail('expected ":"');
            i++;
            const v = value();
            props.push({ key: key.value, keyStart: key.start, value: v });
            ws();
            if (src[i] === ',') {
               i++;
               continue;
            }
            if (src[i] === '}') {
               i++;
               break;
            }
            fail('expected "," or "}"');
         }
         return { type: 'object', start, end: i, props };
      }
      if (c === '[') {
         i++;
         const elements = [];
         ws();
         if (src[i] === ']') {
            i++;
            return { type: 'array', start, end: i, elements };
         }
         for (;;) {
            elements.push(value());
            ws();
            if (src[i] === ',') {
               i++;
               continue;
            }
            if (src[i] === ']') {
               i++;
               break;
            }
            fail('expected "," or "]"');
         }
         return { type: 'array', start, end: i, elements };
      }
      if (c === '"') return string();
      const m = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(src.slice(i, i + 64));
      if (!m) fail('unexpected token');
      i += m[0].length;
      return { type: 'literal', start, end: i };
   }
   const root = value();
   return root;
}

/* whitespace between the start of the line and `offset` (empty string if non-whitespace precedes it) */
function lineIndent(src, offset) {
   const lineStart = src.lastIndexOf('\n', offset - 1) + 1;
   const lead = src.slice(lineStart, offset);
   return /^[ \t]*$/.test(lead) ? lead : null;
}

function relative(file) {
   return path.relative(ROOT, file).split(path.sep).join('/');
}

module.exports = {
   ROOT,
   REF_TYPES,
   STYLE_TAGS,
   OTHER_TAGS,
   KNOWN_TAGS,
   DICE_NAMES,
   DIFFICULTIES,
   readText,
   readJson,
   listPackFiles,
   loadPacks,
   buildNameIndex,
   packHas,
   whereIs,
   makeValidator,
   describeDataPath,
   schemaErrorKeys,
   formatSchemaErrors,
   parseArgs,
   parseWithSpans,
   lineIndent,
   relative,
};
