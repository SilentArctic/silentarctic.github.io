# Content-pack import workflow

Every `pack-*` skill follows this procedure. The type skill adds type-specific mapping and checks.
To import a whole book (or a large range) across all types in one run, use `/pack-core` (`SKILL.md` in this folder). It runs this workflow once per type, in dependency order.
Run commands from the repo root. Scripts live in `.claude/skills/pack-core/scripts/`.

## 0. Guardrails (always)

- **Inputs.** A PDF path, a printed page or range (`45`, `45-52`, `45,47,50-51`), and a destination JSON.
  - If the PDF path or the destination is missing, **stop**: say what's missing and do nothing else.
  - If the pages are missing, ask.
- **Stay inside the pages you were given.** Never extract content from other pages.
  - Probing a nearby page's printed page number to work out the PDF offset (step 2) is allowed. Don't use any text from probed pages.
  - An item that **starts** inside the range may be finished from the following page(s) without asking (e.g. a stat block printed on the next page). Read forward only as far as that item needs, take only that item's content, and list the extra pages in the report's page map.
  - Never start a new item that begins after the last page. An item that began before the first page is skipped and reported.
- **Write only the destination file** (through `merge.js` and `bump-version.js`, plus small Edits to its `_meta.filters`) and the ledger.
  - Every change to a pack needs a version bump (step 9), or GenesysRef won't see it.
  - Never edit `schemas/` or other packs.
  - Never edit `api/index.json` or `api/community/index.json`; CI rebuilds them.
  - Never edit the `genesysref` client.
- **The source is the priority.** Keep wording, spelling, capitalization, and numbers exactly as printed, except for obvious typos (step 3, "Typos and printing errors").
- **Schema gaps.** If something can't be represented, log it with a proposed schema change. Never edit schemas.
- **When in doubt, ask, and ask early.** Raise each question requiring the user's input as soon as you've found it, not at the end of the run. Long sessions are easier to moderate that way.
  - Good moments to ask: right after preflight (schema/convention conflicts, missing inputs), right after extraction (source errors, schema gaps, name collisions, anything ambiguous on the page), and before staging anything that depends on the answer.
  - **There's no question budget.** Every fork or point of confusion gets asked, even when that takes several AskUserQuestion calls in a row (each call holds up to 4). Never skip a question, or quietly decide it, to keep the count down.
  - Batch questions that come up together instead of interrupting per item. But don't hold a question back just to batch it with ones you haven't found yet.
  - Keep working on whatever the answer doesn't affect.
- **Keep a work ledger in every run** (single-type runs included, not only `/pack-core`). Log every decision, uncertainty, printing error, and typo fix to `WORK_LEDGER.<json>.md` *at the moment it happens*, not from memory at the end. Format in step 7.

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
   - For free-text classification fields (rule/sidebar `type`, gear `class`, optionFeature `type`/`class`), prefer values already used across the official packs (this scans `api/` only, not `api/community/`):
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
- Record the mapping, e.g. `printed 44–48 → PDF 46–50`, for the report.
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
   - A glyph it doesn't know prints as `[[glyph U+… #color]]`. Identify it on the image and log the identification as a decision (ask if it's ambiguous), so the table in `pdf-runs.js` can be extended.
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
- **Text with no text layer.** Some boxes (read-aloud, sidebars) are images. Compare every boxed area on the page image with the `pdftotext` output. When the text is missing:
  - Render a high-resolution crop (`pdftoppm -r 170 -x … -y … -W … -H …`) and type the text from it.
  - Log it as a decision ("typed from image, please proofread").
- **Normalize.** These aren't alterations:
  - Join wrapped lines.
  - Undo line-break hyphenation ("encoun- ter" → "encounter"), but keep real hyphens ("one-handed").
  - Replace ligatures with letters.
  - Curly quotes and apostrophes → straight `'` `"`.
  - Keep em dashes `—` and special letters (Æ, æ, é).
  - Remove soft hyphens and collapse whitespace.
  - When it isn't clear whether a hyphen at a line break is real, log the choice as a decision.
- **Typos and printing errors.**
  - **Fix obvious typos** without asking, use the corrected text in the data, and log each as a typo (T#): missing or extra apostrophes, missing plurals or plurals that shouldn't be, misspellings, missing words, and established words spelled one way in most places and differently in a few.
  - **Don't fix** anything else: numbers, stat values, names, capitalization that might be intentional, wording or grammar choices, and stray spacing inside quotes. Keep them as printed and log them as printing errors (E#) with a proposed fix. They're corrected only when the user approves.
- **Don't add content that isn't printed** (lists, summaries, values copied from another item) without asking. If the user approves, log it as a decision.
- **Boundaries:** see the guardrail "Stay inside the pages you were given". Report pages read past the range and items skipped at the start.
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
| **SCHEMA / TAGS / REFS** errors | Fix all of them. If a fix needs a schema change or a missing target item, log it (schema gap → D or U with the proposed change). |
| **HYGIENE** | Fix normalization leftovers. A genuine source issue is logged as T# or E# (step 3). |
| **HINTS** | Possible untagged references. Judge **each one** against `tagging.md`, and tag it only if the text means that game entity. Never apply hints blindly. |

Re-run until there are no errors.

A reference to something that doesn't exist in any pack yet (e.g. gear on a page not imported yet) stays **untagged by default**. Log it as a decision with a `[ ] Tag now` alternative, so it resolves once imported.

## 7. Report, then decide (before merging)

Preview first:

```bash
node .claude/skills/pack-core/scripts/merge.js "<staged>" --dest <dest> --dry-run
```

This shows insert positions, existing items that would need `--replace`, field diffs, and whether any *new* schema errors would be introduced.

Report in chat with only: the page map, Add/Update lists, ℹ other content, and counts per ledger section with the ledger path. Everything else lives in the ledger.

```
## <Type> import — <pdf file> pp. <range> → <dest>
Page map: printed 44–48 → PDF 46–50
Add (N): Name, Name, …
Update (N, needs approval): Name — description[1], tier …
ℹ Other content on these pages: sidebar "Flying" p.46 → /pack-sidebar; Table 2-3 p.47 → /pack-table
Ledger: WORK_LEDGER.<json>.md — 3 decisions (1 needs attention), 2 uncertainties, 4 printing errors, 6 typos
```

- Ask in chat only about things that first appear at this step, such as updates to existing items shown by the dry run. Ask them all (several AskUserQuestion calls if needed) and wait.
- Otherwise merge straight away (steps 8–9).
- When the user later says which boxes are ticked (or replies "fix E3, change D2, undo T4, undo D9"): apply them in staging, re-run step 6, merge with `--replace` for the affected items, then bump the version once.

### The ledger file

`WORK_LEDGER.<json>.md` at the repo root, where `<json>` is the destination's `_meta.source.json` (e.g. `WORK_LEDGER.book-of-online-sourced-triumphs-6-space-fantasy.md`), so different sources never collide. Create it if missing, otherwise append. **Delete it once the user has settled it** (never commit it). Numbers continue across types and runs (D1…, U1…, E1…, T1…).

A ⚠ anywhere in the `pack-*` skills means a needs-attention ledger entry.

- **Sections, in this order:** `## Decisions`, `## Uncertainties`, `## Printing errors`, `## Typos`. Omit empty sections.
  - Decision: a choice made, with or without asking (tagging, structure, schema gap, unprinted value, a link, the user's answer to a question).
  - Uncertainty: you couldn't tell what's right (a misread glyph, a possible source error, a judgment you'd want a second opinion on).
  - Printing error: wrong in the source but not an obvious typo (values, names, wording); kept as printed.
  - Typo: obvious typo, fixed.
- **Needs attention vs. auto-resolved.** In Decisions, Uncertainties, and Printing errors, put entries under `### Needs attention` first, then `### Auto-resolved`. Auto-resolved means settled with nothing left to weigh (routine tagging, a question the user already answered). Everything with a real open alternative needs attention. Typos are always auto-resolved, so that section has no subheadings.
- **Every entry has** a number, a Location, and checkbox lines: alternatives for needs-attention D/U, `Fix ->` for E, and `Undo?` (restores the printed or default state) on every auto-resolved entry, including all typos. A checked box is the user's reply; leave every box unchecked.

```
- D37: Unmatched items left unlinked: security tunic, tailored tunic
  - Location:
    - adversary > Yortin Fleinn > gear
    - adversary > Anju > gear
  - Alternatives:
    - [ ] Link tailored tunic -> Ship's Suit (Tailored)

- E35: Flare pistol printed as Pierce 2; the gear item has Pierce 1
  - Location:
    - adversary > Sharan Joels > weapons
  - Kept: as printed
  - [ ] Fix -> Pierce 1

- T24: "weapons dawn"
  - Location:
    - adventure > The Sapphire Lily > chapters > Encounter 2
  - Fixed: "drawn"
  - [ ] Undo?
```

- **Location is a pseudo-path, one bullet per place**: `group > item name > field`, then chapter or section titles for nested text (`adventure > The Sapphire Lily > chapters > Scene 2`). Not the printed page number; put the page in the text only when it matters.
- The ledger is complete. Never shorten it to "about 15 typos".

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

Keep it as short as the step 7 report:
- Items added and updated (names), the page map, and the version output line (or why it didn't change).
- The ledger path and how many entries still need attention.
- Next steps, e.g. `/pack-sidebar … 46 …` for content found but not imported.
- Suggest reviewing with `git diff <dest>`. Don't commit unless asked.
