# Content-pack import workflow

Every `pack-*` skill follows this procedure. The type skill adds type-specific mapping and checks.
Run commands from the repo root. Scripts live in `.claude/skills/pack-core/scripts/`.

## 0. Guardrails (always)

- **Inputs.** A PDF path, a printed page or range (`45`, `45-52`, `45,47,50-51`), and a destination JSON.
  - If the PDF path or the destination is missing, **stop**: say what's missing and do nothing else.
  - If the pages are missing, ask.
- **Stay inside the pages you were given.** Never extract content from other pages.
  - The one exception is probing a nearby page's printed page number to work out the PDF offset (step 2). Don't use any text from probed pages.
  - If an item runs past the range, stop and ask before reading further.
- **Write only the destination file**, through `merge.js` and `bump-version.js`, plus small Edits to its `_meta.filters`.
  - Every change to a pack needs a version bump (step 9), or GenesysRef won't see it.
  - Never edit `schemas/` or other packs.
  - Never edit `api/index.json` or `api/community/index.json`; CI rebuilds them.
  - Never edit the `genesysref` client.
- **The source is the priority.**
  - Keep wording, spelling, capitalization, and numbers exactly as printed.
  - Typos, errors, and inconsistencies become ⚠ warnings with a proposed fix. Change them only after the user approves.
- **Schema gaps.** If something can't be represented, warn with a proposed schema change. Never edit schemas.
- **When in doubt, ask.** Batch questions (AskUserQuestion, up to 4 at a time) instead of interrupting per item.

## 1. Preflight

1. Check the PDF exists.
   - The destination must be `api/<name>.json` (official) or `api/community/<name>.json` (homebrew).
   - If the destination doesn't exist, confirm with the user, then follow `.claude/skills/pack-new/SKILL.md` before continuing.
2. Read the destination's `_meta` and existing names. Packs are up to 1 MB, so don't Read the whole file:
   ```bash
   node -e "const d=require('./api/<pack>.json'); console.log(JSON.stringify(d._meta,null,1)); for (const g of ['<group>']) console.log(g+':', (d[g]||[]).map(i=>i.name).join(' | '))"
   ```
   - The lowercase `abbreviation` is the pack's default tag source.
   - `defaultItemSettings` is what items inherit.
3. Read the schema files the type skill lists, plus `schemas/varyingDisplay_sub_schema.json` for any description-like field. Schemas change often, so always read them, never rely on memory.
4. Study conventions from live data.
   - Look at the exemplars the type skill names, plus the 2–3 most recent items of the same group in the destination: key order, casing, vocabulary, and how similar text was tagged. Print one item with `node -e "…console.log(JSON.stringify(d.<group>.find(i=>i.name==='X'),null,3))"`.
   - For free-text classification fields (rule/sidebar `type`, gear `class`, optionFeature `type`/`class`), prefer values already used across packs:
     ```bash
     node -e "const fs=require('fs');const v=new Set();for(const f of fs.readdirSync('api').filter(f=>f.endsWith('.json')&&f!=='index.json'))for(const i of JSON.parse(fs.readFileSync('api/'+f,'utf8')).<group>||[])v.add(i.<field>);console.log([...v].join(' | '))"
     ```
   - If existing items in the destination disagree with the schema (the schemas are mid-migration in places), point it out and ask which pattern to follow before staging.

## 2. Page mapping (printed → PDF index)

- The user gives printed page numbers. The Read tool and `pdftotext` use PDF page indexes.
- Find the offset by reading printed page numbers (folios):
  ```bash
  pdftotext -layout -f N -l N "<pdf>" - | grep -av "Order #" | grep -av '^\s*$' | tail -n 3
  ```
  Try `N = P`, `P+1`, `P+2`, … (or `P-1`, …) until the folio equals `P`. Then confirm by viewing that PDF page with the Read tool.
- Watch for two-page spreads (one PDF page holding two printed pages) and unnumbered pages (chapter openers). Infer those from their neighbors.
- Record the mapping, e.g. `printed 44–48 → PDF 46–50`, for the report. In the EotI PDF, the PDF page is the printed page + 1.
- **Tools** (use the Bash tool):
  - `pdftotext` (Git Bash ships xpdf's).
  - Poppler (`pdftohtml`, `pdftoppm`), installed with `winget install oschwartz10612.Poppler`.
  - `pdf-runs.js` finds Poppler by itself (PATH, `POPPLER_BIN`, or the winget package folder).
  - The Read tool can only open PDF pages when `pdftoppm` is on the PATH of the running session, so render PNGs instead (below).
  - If Poppler is missing, say so and ask before installing anything.
- **Ignore the purchase watermark** on every page (e.g. "Name (Order #12345)"). Never copy it into data or reports.

## 3. Extract (10 pages or fewer per chunk)

Use all three sources for every page.

1. **Wording:** `pdftotext -enc UTF-8 -f N -l M "<pdf>" -`.
   - This gives reading order and is best for prose.
   - Add `-layout` for stat blocks and tables (keeps columns aligned).
   - Use `-raw` if two columns interleave.
   - Symbol glyphs come out as private-use characters here; don't use them.
2. **Formatting and symbols:** `node .claude/skills/pack-core/scripts/pdf-runs.js "<pdf>" N M --render "<scratchpad>/pack/pages"`.
   - Italic and bold runs come out as `{@i …}` / `{@b …}`. Headings and stat labels show as bold too.
   - Result symbols come out as `{@symbols …}`, and dice as `{@dice …}` (die type decoded from the glyph fill color).
   - A glyph it doesn't know prints as `[[glyph U+… #color]]`. Identify it on the image and report it, so the table in `pdf-runs.js` can be extended.
   - Wording here is approximate: a line-break hyphen shows as `-|`.
   - `--render` writes page PNGs.
3. **Visual:** view the rendered PNGs with the Read tool. Use them for:
   - headings and item boundaries
   - sidebars and boxed text
   - tables and column flow
   - images
   - confirming anything `pdf-runs.js` flags or that looks odd
- **Sources of truth:**
  - Wording: `pdftotext`.
  - Italics, bold, symbols, and dice: `pdf-runs.js`.
  - Layout: the image.
  - If they disagree, trust the image and mention it.
- **Normalize.** These aren't alterations:
  - Join wrapped lines.
  - Undo line-break hyphenation ("encoun- ter" → "encounter"), but keep real hyphens ("one-handed").
  - Replace ligatures with letters.
  - Curly quotes and apostrophes → straight `'` `"`.
  - Keep em dashes `—` and special letters (Æ, æ, é).
  - Remove soft hyphens and collapse whitespace.
- **Don't fix** spelling, grammar, capitalization, numbers, or punctuation. Log them as ⚠ source errors instead.
- **Boundaries:**
  - An item that continues after the last page → stop and ask whether to read the next page.
  - An item that began before the first page → skip it and report it.
- **Other content** on these pages that belongs to other item types (a sidebar, a table, a rule section, qualities…): don't import it. List it under ℹ with the skill that handles it. The exception is a companion group the type skill says it owns (e.g. adversary abilities).
- **Images** can't be uploaded. If the item has an image, leave out `imageUrl` (and `{ "type": "image" }` entries) and mention it.

## 4. Stage

- Staging file: `<scratchpad>/pack/<dest-basename>.staged.json`.
  - `<scratchpad>` is this session's scratchpad directory from the system prompt.
  - If there isn't one, use the OS temp dir: `node -e "console.log(require('os').tmpdir())"`.
- Format: `{ "<group>": [ …items… ] }`, with one key per group written.
- Item rules:
  - Never add `id`.
  - `page` is the printed page of the item's heading.
  - Omit `settings` unless the source ties the item to settings that differ from `_meta.defaultItemSettings`. Ask if unsure.
  - Key order matches existing items (usually `name`, `page`, then the type's fields, with `description` last or near-last).
  - In a string array, each entry is one paragraph.
  - Use varyingDisplay objects (lists, titled sections, tables, sidebars, `_ref`) only in fields whose schema allows them.
- **Updating an existing item:**
  - Print the existing item, copy it into staging, and change only what the PDF shows differently.
  - `merge.js` drops fields missing from the staged item, except `id`, `settings`, `tags`, `imageUrl`, and `meta`, which keep their existing values. So carry everything else over (`modifiers`, `hasVariants`, …).

## 5. Tag

Apply `.claude/skills/pack-core/tagging.md` to every prose string. This is the bulk of the work, so be thorough and consistent.

## 6. Check

```bash
node .claude/skills/pack-core/scripts/check.js "<staged>" --dest <dest>
```

| Section | What to do |
|---|---|
| **SCHEMA / TAGS / REFS** errors | Fix all of them. If a fix needs a schema change or a missing target item, it becomes a ⚠ in the report. |
| **HYGIENE** | Fix normalization leftovers. A genuine source issue becomes a ⚠. |
| **HINTS** | Possible untagged references. Judge **each one** against `tagging.md`, and tag it only if the text means that game entity. Never apply hints blindly. |

Re-run until there are no errors.

A reference to something that doesn't exist in any pack yet (e.g. gear on a page not imported yet) stays **untagged by default**. List it under ⚠ unresolved references, and offer to tag it now so it resolves once imported.

## 7. Report, then decide (before merging)

Preview first:

```bash
node .claude/skills/pack-core/scripts/merge.js "<staged>" --dest <dest> --dry-run
```

This shows insert positions, existing items that would need `--replace`, field diffs, and whether any *new* schema errors would be introduced.

Report in this shape, and leave out empty sections:

```
## <Type> import — <pdf file> pp. <range> → <dest>
Page map: printed 44–48 → PDF 46–50
Add (N): Name, Name, …
Update (N, needs approval): Name — description[1], tier …
⚠ Source errors (kept as printed): p.45 "Name" description: "recieve" → "receive"?
⚠ Schema gaps: p.46 "Name": activation "Active (Maneuver, Once per round)" has no enum value; closest "active (maneuver)"; suggest adding …
⚠ Unresolved references: "plasma torch" (gear, not in any pack) left untagged
⚠ Page boundaries: "Name" continues on p.49 (outside range)
ℹ Other content on these pages: sidebar "Flying" p.46 → /pack-sidebar; Table 2-3 p.47 → /pack-table
ℹ Judgment calls: filter tags …; rule type "…"; tagged "Winnu" as archetype (species) not rule (faction) …
```

- If there's any ⚠, any update, or any judgment call that needs the user, ask in one batched AskUserQuestion and wait.
- Otherwise merge straight away.
- Source-error fixes are applied only when the user approves them.

## 8. Merge

```bash
node .claude/skills/pack-core/scripts/merge.js "<staged>" --dest <dest> [--replace "<approved name>"]…
```

- Use `--replace` only for items the user approved. `--replace-all` is only for when the user approved every update.
- If merge aborts on **new** schema errors, fix the staging. Use `--allow-schema-errors` only when the user explicitly approved following a pattern the schema doesn't support yet.
- Update `_meta.filters` with Edit, keeping its formatting and without duplicates, if the import introduced new:
  - `optionFeatureType` / `optionFeatureClass` values
  - `talentPrereqs`
  - `settings`
  - `magicSkills`

## 9. Version

```bash
node .claude/skills/pack-core/scripts/bump-version.js --dest <dest>
```

**Always run this after any change to a pack**, including small fixes made outside this workflow. The index only rebuilds when a pack's version changes, and GenesysRef won't pick up changes until the index rebuilds.

Run it once after the last write. It applies the owner's rules:
- A new date resets to today.
- The same date bumps a 4th number only if today's version was already pushed.

Don't edit the version by hand. Quote its output line in the summary.

## 10. Final summary

- Items added and updated (names), the page map, and the version change (or why it didn't change).
- Every warning, with its outcome: applied, kept as printed, or pending.
- Next steps, e.g. `/pack-sidebar … 46 …` for content found but not imported.
- Suggest reviewing with `git diff <dest>`. Don't commit unless asked.
