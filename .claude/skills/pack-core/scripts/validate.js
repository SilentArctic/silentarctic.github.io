#!/usr/bin/env node
/**
 * Validate one content pack against the collection schema (same AJV setup as __tests__/collectionSchema.test.js).
 *
 *   node validate.js --dest <pack.json> [--against <git-ref> | --baseline <snapshot.json>]
 *
 * --against HEAD   also validates the pack as of that git ref and splits the errors into
 *                  "new since <ref>" and "already there", so fixes can be told apart from the schema migration.
 * --baseline <file>  same, but compares with a saved copy of the pack (e.g. a snapshot taken before a lint run).
 * Exit code: 0 when valid; 1 when there are errors (with --against/--baseline: only when there are NEW errors).
 */
const path = require('path');
const { execFileSync } = require('child_process');
const lib = require('./lib');

const { flags } = lib.parseArgs(process.argv.slice(2));
if (!flags.dest) {
   console.error('usage: validate.js --dest <pack.json> [--against <git-ref> | --baseline <snapshot.json>]');
   process.exit(2);
}
const destFile = path.resolve(flags.dest);
const pack = lib.readJson(destFile);
const validate = lib.makeValidator();
const { valid, errors } = validate(pack);
const keys = lib.schemaErrorKeys(pack, errors);

console.log(`schema: ${lib.relative(destFile)} — ${valid ? 'VALID' : `${keys.size} error(s)`}`);

const ref = flags.against || (flags.baseline && 'baseline');
if (!ref) {
   if (!valid) lib.formatSchemaErrors(pack, errors, Infinity).forEach(l => console.log(`   ${l}`));
   process.exit(valid ? 0 : 1);
}

const rel = path.relative(lib.ROOT, destFile).split(path.sep).join('/');
let baseKeys = new Set();
try {
   const text = flags.baseline ? lib.readText(path.resolve(flags.baseline)) : execFileSync('git', ['show', `${ref}:${rel}`], { cwd: lib.ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
   const base = JSON.parse(text.replace(/^\uFEFF/, ''));
   baseKeys = lib.schemaErrorKeys(base, validate(base).errors);
} catch {
   console.log(`   (no version of ${rel} at ${ref}; every error counts as new)`);
}
const fresh = [...keys].filter(k => !baseKeys.has(k));
const old = [...keys].filter(k => baseKeys.has(k));
const fixed = [...baseKeys].filter(k => !keys.has(k));
console.log(`   new since ${ref}: ${fresh.length}`);
fresh.forEach(k => console.log(`      ${k}`));
console.log(`   already there at ${ref}: ${old.length}`);
old.forEach(k => console.log(`      ${k}`));
if (fixed.length) console.log(`   no longer failing (fixed since ${ref}): ${fixed.length}`);
process.exit(fresh.length ? 1 : 0);
