---
name: pack-core
description: Import a whole book (or a large page range) into a GenesysRef content pack across every item type in one run. It surveys the pages once, asks every question up front, then runs each /pack-* type skill in dependency order, pausing for review after each type. Usage /pack-core <pdf-path> <printed-pages|all> <destination-json>
argument-hint: <pdf-path> <printed-pages|all> <destination-json>
disable-model-invocation: true
---

# Whole-book import

Arguments: `$ARGUMENTS` (PDF path, printed page range or `all`, destination JSON).

This skill orchestrates the type skills; it doesn't replace them.
- **First**, read `workflow.md` and `tagging.md` in this folder. Its guardrails apply throughout: stay in range, write only the destination, the source is the priority, no question budget, decision ledger.
- For each type, follow that type's `SKILL.md` exactly as if it had been invoked on its own.

Worked example: BOOST 6 (Space Fantasy), 27 printed pages, 82 items in 12 groups.

## 1. Preflight

- Workflow step 1 (PDF, destination, `_meta`, existing names).
- Workflow step 2: map printed pages to PDF pages for the whole range.
- Create the ledger `WORK_LEDGER.<json>.md` at the repo root (format in workflow step 7: sections Decisions, Uncertainties, Printing errors, Typos; needs-attention items first, auto-resolved last). Number D1…, U1…, E1…, T1…, continuing across all types.

## 2. Survey (page by page, once)

Extract every page once into `<scratchpad>/<dest-basename>/`, and reuse these files for the rest of the run:
- `pdftotext` per page, both plain and `-layout`
- `pdf-runs.js` for the whole range, with `--render`

Then read every page (text **and** image) and build an inventory:

| Item | Type → skill | Printed page | Author/byline | References (what it mentions) | Notes |
|---|---|---|---|---|---|

On the survey pass, also flag each of these as it comes up:
- **Boxes with no text layer:** compare each boxed area on the image with the text output.
- **Items without a byline** (in credited packs such as BOOST).
- **Glyphs `pdf-runs.js` can't decode.**
- **Content that doesn't fit an existing type**, such as locations, gazettes, or mixed chapters.
- **Name inconsistencies between sections** (a stat block vs. the prose, a table vs. the text).
- **Typos and printing errors.** Start the ledger now.

Show the inventory to the user as a table: counts per type, plus the list of items.

## 3. Questions (all of them, before staging)

- Ask every fork the survey found: classification, structure and outlines (adventure, book, setting), schema gaps, name collisions, unprinted values, ambiguous glyphs, missing bylines, and differing text for same-named items.
- **There's no limit.** Use as many AskUserQuestion calls as needed (up to 4 questions each). Give a recommended option first.
- Put outlines (adventure chapters, setting lore) in `preview` fields so the user approves the structure itself.
- Record each answer in the ledger as a decision ("asked: …").
- Anything that only shows up later is asked when found. Never decide it silently.

## 4. Import type by type, in dependency order

Stage, tag, check, and merge one type at a time. Merging each type before the next means `check.js` resolves every link at the moment it's written.

1. `skill`
2. `quality`
3. `rule`
4. `talent`
5. `spell`
6. `gear` (all gear sections of the book together)
7. `optionFeature`
8. `archetype` (+ `archetypeAbility`)
9. `career`
10. `specialization`
11. `adversary` (+ `adversaryAbility`)
12. `vehicle`
13. `table`
14. `sidebar`
15. `setting`
16. `adventure` (+ `reprint-check.js`)

`book` items are never part of this run: they are a manual-only special case (`/pack-book`). Skip types the book doesn't have. If a rule's text links to gear or talents, move `rule` after them: whatever an item links to is imported before it.

For each type:
1. Read that type's `SKILL.md`, schema, and exemplars (workflow step 1.3–1.4).
2. Stage to `<scratchpad>/pack/<dest-basename>.<n>-<type>.staged.json`. A small generator script is fine for repetitive items.
3. Tag, run `check.js`, judge each hint, and do the `merge.js --dry-run` preview (workflow steps 5–7).
4. **Pause for review.** Show that type's report:
   - Items added, and update candidates.
   - Print only the short summary and counts (workflow step 7) and point to `WORK_LEDGER.<json>.md`, which holds that type's new entries.
   - Wait for the user's reply ("fix E3", "change D2", "ok").
   - Apply the fixes, then merge.
   - If the user asked to run straight through without pauses, skip the wait. The tables are still shown.
5. Update `_meta.filters` if needed (workflow step 8).

## 5. Finish

- Run `bump-version.js` **once**, after the last merge.
- Run a final `check.js` against the whole pack. Two SCHEMA errors about `$schema` and `_meta` "is not an array" are expected when the pack itself is checked as a staging file.
- **Final summary:**
  - Items per group.
  - The page map.
  - The version line.
  - The ledger's counts and the path to `WORK_LEDGER.<json>.md`, which stays complete. Delete it once the user has settled it.
  - Content left out (images, tables not imported) with the skill that would handle it.
- Don't commit unless asked.

## Why this order (BOOST 6 retrospective)

Page by page, forward links are everywhere:
- Weapons (p.1) use qualities (p.2) and a skill (p.3).
- Careers' starting gear (pp.21–23) comes before the gear (pp.23–25).
- An adventure (pp.10–18) comes before its adversaries (pp.18–20) and ships (pp.26–27).

In dependency order, none of those links broke.

The cost is that decisions pile up between stops. The per-type pause and the ledger exist because the single end-of-run report of that first attempt left out about 20 decisions.
