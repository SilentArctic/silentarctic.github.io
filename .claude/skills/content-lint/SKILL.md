---
name: content-lint
description: Lint a GenesysRef content pack for data errors, and optionally compare it against its source PDF for text and stat discrepancies. Usage /content-lint <pack-json> [pdf-path] [printed-pages]
argument-hint: <pack-json> [pdf-path] [printed-pages]
disable-model-invocation: true
---

# Content lint

Arguments: `$ARGUMENTS`
1. **Pack** (required): `api/<name>.json` or `api/community/<name>.json`. If it's missing or doesn't exist, **stop** and say so.
2. **PDF** (optional): the source book. Given → also run the PDF comparison (step 3). Not given → quick scan only.
3. **Printed pages** (optional, PDF mode only): e.g. `241-243` or `50,52-55`. Limits the comparison to items whose `page` is in the range. Without pages, the whole pack is compared.

Run commands from the repo root. Scripts are in `.claude/skills/pack-core/scripts/`. Use the conventions in `.claude/skills/pack-core/tagging.md` when judging tags.

## Guardrails

- **Report first, fix only what the user approves.** Nothing is changed without approval, including obvious typos.
- **Write only the pack**, and only through `patch.js` and `bump-version.js`. Never edit `schemas/`, other packs, `api/index.json`, or the `genesysref` client.
- **The book is the priority, but it isn't perfect.** A typo in the book is a ⚠ source error, not a data fix.
- **Stay inside the given pages.** Reading page numbers to confirm the offset is fine; don't use content from pages outside the range.
- **Every change needs a version bump** (step 6). The index only rebuilds when the version changes, and GenesysRef won't see the fix otherwise.
- **When in doubt, ask.**

## 1. Preflight

```bash
node -e "const d=require('./<pack>'); console.log(JSON.stringify(d._meta.source,null,1)); for (const [g,v] of Object.entries(d)) if (Array.isArray(v)) console.log(g, v.length)"
```

Note the abbreviation, version, and group sizes. In PDF mode, check the PDF exists.

## 2. Quick scan (always)

```bash
node .claude/skills/pack-core/scripts/check.js --dest <pack> --all --max 9999
```

Sort the output into these buckets. Each finding gets its item, field, the problem, and a proposed fix.

| Bucket | Source | Typical examples |
|---|---|---|
| Broken tags | TAGS errors | `{@charactieristic`, `{@sybmols d}`, `{@dice bosot}`, unclosed tags, illegal nesting |
| Broken references | REFS errors | a tag or structured ref that resolves nowhere, a wrong `source`, `{@difficulty Easy\|fear}` (fear isn't a skill) |
| Data consistency | REFS warnings | an adversary skill's characteristic ≠ the skill's; a minion with skill ranks; a rival with strain; a nemesis without strain; defense not `[melee, ranged]` |
| Text hygiene | HYGIENE | unbalanced `()`/`[]` (e.g. "Rulebook))."), double spaces, curly quotes, untagged difficulties or tables |
| Schema | SCHEMA errors | Schemas are mid-migration. Compare with other packs before calling something an error, and never propose schema edits as fixes. Mention these separately. |

- Leave `--hints` (untagged mentions) off unless the user asks. It's noisy on a whole pack.
- For a proposed tag fix, look at how the same thing is tagged elsewhere in the pack and follow that.

## 3. PDF comparison (only with a PDF)

```bash
node .claude/skills/pack-core/scripts/pdf-compare.js --dest <pack> --pdf "<pdf>" [--pages <printed pages>] [--group <group>]… > "<scratchpad>/lint/<pack>-compare.txt"
```

- The script detects the printed → PDF page offset from item names and prints it. Confirm it against one page folio (`pdftotext -layout -f N -l N "<pdf>" - | tail -n 3`). Pass `--offset` if it's wrong.
- **Report kinds:**
  - `PAGE`: the item's name isn't on its printed page. It suggests where the name appears.
  - `TEXT`: word-level differences in prose fields. `(text is on p.X)` means the text was found away from the item's page.
  - `STATS`: adversary Skills/Talents/Abilities lines that differ from the data (names, ranks, order).
  - `MISS` section: prose not found anywhere in the book. Identical strings are grouped.
- The comparison ignores case, dice and symbol glyphs, quotes, dash style, and a trailing period. Tags are rendered to plain text first.

**Verify every finding before reporting it.** The script gives leads, not verdicts.
- Read the book text: `pdftotext -enc UTF-8 -f N -l N "<pdf>" -`.
- For anything visual (stat numbers, symbols, layout, which column a word belongs to), render and view the page: `node .claude/skills/pack-core/scripts/pdf-runs.js "<pdf>" N N --render "<scratchpad>/lint/pages"`.

Classify each finding:

| Class | Meaning | Action |
|---|---|---|
| **Data error** | The data differs from the book, and the book is right | Propose a fix that matches the book |
| **Source error** | The book has a typo or mistake ("Biochemcial Toxin", "on a 8–10") | ⚠ Report it. The data stays as it is unless the user says otherwise |
| **Convention** | Differences the curated data makes on purpose | Don't report (list below) |
| **Extraction noise** | pdftotext artifacts: interleaved columns, split words, sidebars mixed into prose | Drop it |

**Conventions (not errors):**
- **Ability text:** adversary abilities and similar rewrite the printed parenthetical as a sentence. The first letter is capitalized, a period is added, and nested `[…]` become `(…)`.
- **"This character":** ability text replaces the adversary's own name ("the elder Titan's choosing" → "this character's choosing").
- **Variants** (`variant: true`, and "Base (Variant)" names) are built from the base profile plus the printed modifications, so their text and stats won't match a printed block.
- **Curator-added text** that isn't in the book: lists of variant links, "This weapon may be modified with {@table 2-1: …}.", "Some examples include:", table/stat titles, and cross-reference notes.
  - These show up under MISS. Only report one if it looks wrong, e.g. a misspelled title like "Sol F5 Hurrican Mk5".
- **Tag displays:** tags may shorten or reword the display text (`{@rule Naalu Collective|Collective's}`). Compare what renders, not the tag name.
- **Dashes:** en dashes vs hyphens in number ranges.

**Beyond the script (page-scoped runs only):** for items in the given pages, also compare the numbers the script can't read against the page image:
- characteristics and derived stats
- power levels
- weapon profiles (damage, critical, range, qualities and ranks)
- vehicle and gear stat lines

For a whole-book run, offer this as a follow-up for specific pages instead.

## 4. Report, then ask

```
## Content lint — <pack> [vs <pdf> pp. <range>]
Page map: PDF = printed + 1 (confirmed on p.241)
Data errors (N):
  1. adversary "Elder Titan" skills: Knowledge (Science) 3 → 4 (book p.241)
  2. …
Broken tags / references (N): …
Data consistency (N): …
Text hygiene (N): …
⚠ Source errors, data left as is (N): p.243 "Biochemcial Toxin" (book typo; data has "Biochemical Toxin")
ℹ Schema (pre-existing, not fixed here): …
ℹ Not checked: …
```

- Number the findings so the user can pick them.
- Ask which ones to fix: all, by bucket, or by number. Use AskUserQuestion when the choice fits its options; otherwise ask in plain text.
- If there are no findings, say so, and say what was and wasn't checked.

## 5. Fix (approved items only)

Write the approved fixes as operations in `<scratchpad>/lint/fixes.json`, then preview:

```bash
node .claude/skills/pack-core/scripts/patch.js "<scratchpad>/lint/fixes.json" --dest <pack> --dry-run
```

| Fix | Operation |
|---|---|
| Change a value | `{ "group": "adversary", "name": "Elder Titan", "path": "skills[6].ranks", "set": 4 }` |
| Remove a property | `{ "group": "adversary", "name": "Naalu Exploiter", "path": "skills[4].source", "delete": true }` |
| Reorder or replace an array | `{ "group": "adversary", "name": "Empyrean Observer", "path": "abilities", "set": ["EM Flood", "Flyer", "Radiowave Communications", "Spaceworthy"] }` |
| Small text fix | `{ "group": "adversaryAbility", "name": "Swat", "path": "description[0]", "find": "Rulebook)).", "replace": "Rulebook)." }` (`find` must occur exactly once in that string) |
| Rewrite a paragraph | `{ "group": "talent", "name": "…", "path": "description[0]", "set": "…full new text…" }` |

- Look up array indexes from the item itself, never from memory: `node -e "…console.log(JSON.stringify(d.<group>.find(i=>i.name==='X').<field>,null,1))"`.
- `patch.js` keeps the file's formatting and line endings. It refuses to write if any untouched item would change, if an operation's result doesn't verify, or if new schema errors would appear.
- Then run it without `--dry-run`.

## 6. Version

```bash
node .claude/skills/pack-core/scripts/bump-version.js --dest <pack>
```

Run this once after any successful write. It may leave the version alone if today's version hasn't been pushed yet; quote its output line.

## 7. Confirm and summarize

- Re-run the step 2 check (and step 3 with the same scope) and confirm the fixed findings are gone.
- Summarize: what was fixed, what was left and why (source errors, declined, schema), and the version line.
- Suggest `git diff <pack>`. Don't commit unless asked.
