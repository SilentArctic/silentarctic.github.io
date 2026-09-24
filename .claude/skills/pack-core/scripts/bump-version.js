#!/usr/bin/env node
/**
 * Bump a content pack's _meta.source.version after the pack changed.
 *
 *   node bump-version.js --dest <pack.json> [--dry-run]
 *
 * Rules (from the repo owner):
 *   - version date != today  → set to today's date, dropping any 4th component
 *   - version date == today  → if this exact version was already pushed (it matches the pack's version
 *                              on the remote-tracking branch), add/increment a 4th component
 *                              (2026.9.18 → 2026.9.18.1 → 2026.9.18.2); otherwise the unpushed
 *                              version already covers these changes, so leave it alone
 * Zero-padding follows the existing version's style (2026.01.30 stays padded; 2026.1.9 stays unpadded;
 * ambiguous values like 2025.12.30 default to unpadded).
 *
 * The remote-tracking ref is the branch upstream (@{u}), else origin/<current branch>, else origin/master.
 * Nothing is fetched; the local remote-tracking refs are used as-is.
 *
 * Testing overrides: --today YYYY-MM-DD, --remote-version <version|none>
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const lib = require('./lib');

const { flags } = lib.parseArgs(process.argv.slice(2), ['dry-run']);
if (!flags.dest) {
   console.error('usage: bump-version.js --dest <pack.json> [--dry-run]');
   process.exit(2);
}
const destFile = path.resolve(flags.dest);
const text = lib.readText(destFile);
const bom = text.startsWith('\uFEFF') ? 1 : 0;
const data = JSON.parse(text.slice(bom));
const current = data?._meta?.source?.version;

const VERSION_RE = /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\.(\d+))?$/;
const m = VERSION_RE.exec(String(current ?? ''));
if (!m) {
   console.error(`version "${current}" is not in YYYY.M.D[.N] form; not changing it (ask the user)`);
   process.exit(2);
}
const [, y, mo, d, n] = m;
const padded = mo.startsWith('0') || d.startsWith('0');

let today;
if (flags.today) {
   const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(flags.today);
   if (!t) {
      console.error('--today must be YYYY-MM-DD');
      process.exit(2);
   }
   today = { y: Number(t[1]), m: Number(t[2]), d: Number(t[3]) };
} else {
   const now = new Date();
   today = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}
const pad = v => (padded ? String(v).padStart(2, '0') : String(v));
const todayVersion = `${today.y}.${pad(today.m)}.${pad(today.d)}`;
const sameDate = Number(y) === today.y && Number(mo) === today.m && Number(d) === today.d;

function git(args) {
   return execFileSync('git', args, { cwd: lib.ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}

function remoteVersion() {
   if (flags['remote-version'] !== undefined) {
      return { version: flags['remote-version'] === 'none' ? null : String(flags['remote-version']), ref: '(override)' };
   }
   const rel = path.relative(lib.ROOT, destFile).split(path.sep).join('/');
   if (rel.startsWith('..')) return { version: null, ref: null, note: 'file is outside the repo' };

   const refs = [];
   try {
      refs.push(git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']));
   } catch { /* no upstream */ }
   try {
      const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
      refs.push(`origin/${branch}`);
   } catch { /* detached */ }
   refs.push('origin/master');

   for (const ref of [...new Set(refs)]) {
      try {
         git(['rev-parse', '--verify', '--quiet', `refs/remotes/${ref}`]);
      } catch {
         continue;
      }
      try {
         const remote = JSON.parse(git(['show', `${ref}:${rel}`]).replace(/^\uFEFF/, ''));
         return { version: remote?._meta?.source?.version ?? null, ref };
      } catch {
         return { version: null, ref, note: 'file not on that ref yet' };
      }
   }
   return { version: null, ref: null, note: 'no remote-tracking ref found' };
}

let next = current;
let reason;
if (!sameDate) {
   next = todayVersion;
   reason = 'new date';
} else {
   const remote = remoteVersion();
   const where = remote.ref ? ` on ${remote.ref}` : '';
   if (remote.version === current) {
      next = `${y}.${mo}.${d}.${n ? Number(n) + 1 : 1}`;
      reason = `today's version ${current} was already pushed${where}; incrementing the 4th component`;
   } else {
      reason = `today's version is not pushed yet (remote${where}: ${remote.version ?? 'none'}${remote.note ? `, ${remote.note}` : ''}); leaving it`;
   }
}

if (next === current) {
   console.log(`version: ${current} (unchanged) — ${reason}`);
   process.exit(0);
}

/* replace only the _meta.source.version value, byte-for-byte elsewhere */
const root = lib.parseWithSpans(text.slice(bom));
const versionNode = root.props.find(p => p.key === '_meta')?.value.props?.find(p => p.key === 'source')?.value.props?.find(p => p.key === 'version')?.value;
if (!versionNode) {
   console.error('could not locate _meta.source.version in the file');
   process.exit(1);
}
const start = versionNode.start + bom;
const end = versionNode.end + bom;
const result = text.slice(0, start) + JSON.stringify(next) + text.slice(end);

console.log(`version: ${current} → ${next} — ${reason}${flags['dry-run'] ? ' [dry run, not written]' : ''}`);
if (!flags['dry-run']) fs.writeFileSync(destFile, result, 'utf8');
