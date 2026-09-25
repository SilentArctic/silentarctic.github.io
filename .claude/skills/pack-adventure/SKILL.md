---
name: pack-adventure
description: Import or update adventures (playable scenarios with encounters, read-aloud text, NPCs) in a GenesysRef content pack from PDF pages, referencing existing items instead of reprinting them. Usage /pack-adventure <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Adventures → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to adventures.

## Writes

- `adventure`. Read `schemas/adventure_schema.json` and `schemas/varyingDisplay_sub_schema.json` (for `chapters`).
- Nothing else directly. Stat blocks, tables, sidebars, rules, and item profiles on the pages belong to their own type skills (see "Referenced content").
- Sourcebook or lore reading, rather than a playable scenario, goes to `/pack-book`.

## Never reprint

An adventure shows other items; it never copies them. Everything that exists (or will exist) as its own item is shown through a tag or a `_ref`:

| Printed in the adventure | In `chapters` |
|---|---|
| Adversary stat block | A single string `"{@adversary Name}"` in the entries of the section it's printed in, at the spot where it's printed. **Never give an adversary its own heading**, even when the book prints its name as a heading ("Emily Jenson (Wraith, Nemesis)"): drop that heading. No copied profile or flavor text. |
| Captioned table ("Table 1-1: …") | `{ "type": "table", "_ref": { "name": "Table 1-1: …" }, "columns": [], "rows": [] }` |
| Titled sidebar (boxed text with its own title) | `{ "type": "sidebar", "_ref": { "name": "…" }, "entries": [] }` |
| Rules section that is a rule item (a status, hazard, subsystem) | `{ "type": "rule", "_ref": { "name": "…" }, "description": [] }` |
| Gear, vehicle, talent, quality, spell profile or description | A tag at the mention (`{@gear Six Shooter}`, `{@vehicle Carriage|coach}`); the profile isn't copied. |
| Any other mention of an existing item | The normal tag (`tagging.md`). |

- `_ref` only renders for **tables, sidebars, and rules**. The client shows a `_ref` through the target's `description` or table view, and an adversary/gear `_ref` renders nothing. Everything else is a tag.
- `_ref` names are the item's full name (tables keep "Table ").
- Add `"source"` to a `_ref` only when the target is outside the destination and CRB.
- **Text already imported elsewhere counts too.** A backstory or flavor paragraph that a type skill already stored on the adversary (or gear, vehicle…) is replaced by the tag, not repeated. `reprint-check.js` (step 6) finds these.
- **Exception: text the GM needs to run the adventure is reprinted.** If part of a referenced item's description is directly relevant to running the adventure, it's printed in the adventure too, where the book prints it and with its printed heading. That covers encounter rules, what happens in the scene, and checks the PCs make (e.g. the Ghost Carriage's "Effects of the Ghost Carriage").
  - Only background or flavor stays reference-only (e.g. Emily Jenson's backstory).
  - `reprint-check.js` flags these passages. That's expected: list them in the report as kept on purpose, with the reason.
  - When it isn't clear whether a passage is needed at the table or is just flavor, ask.
- **Adventure-specific context around a reference stays as prose.** For example: "Emily appears at medium range and attacks the nearest PC." Only the profile is referenced.
- **Keep inline** anything that isn't an item and wouldn't be linked from elsewhere:
  - small uncaptioned tables that are part of a scene (inline table object)
  - GM-advice boxes that only make sense inside this adventure (inline `{ "type": "sidebar", "title", "page", "entries" }`)
  - Whether a box is reusable (→ sidebar item + `_ref`) or adventure-only (→ inline) is a judgment call; list it, and ask if unsure.

## Referenced content (ask right after extraction)

Straight after extracting, and before staging anything:

1. Inventory every stat block, captioned table, titled sidebar, rules section, and item profile on the pages, plus the named items the prose mentions.
2. Look each up in every pack. `whereIs` also finds items in other packs:
   ```bash
   node -e "const l=require('./.claude/skills/pack-core/scripts/lib');const p=l.loadPacks();for(const [t,n] of [['adversary','Emily Jenson'],['table','Table 1-1: Weapons']])console.log(t,n,'→',l.whereIs(p,t,n).join(', ')||'MISSING')"
   ```
3. **Missing items:** ask (one batched AskUserQuestion) to import them first with the matching skill on the relevant pages: `/pack-adversary`, `/pack-table`, `/pack-sidebar`, `/pack-rule`, `/pack-gear`, `/pack-vehicle`, ….
   - On approval, run that skill fully (its own report, merge, and version bump), then continue here.
   - Items that are declined stay untagged and are reported as ⚠ unresolved references. They're never reprinted inline.
4. **Existing items whose printed text differs** from the stored item (a variant stat line, extra adventure-specific rules): ask whether to update the item through its type skill, keep the difference as adventure prose, or ignore it.

## Chapter boundaries (use judgment, ask early)

- **Where the adventure starts and ends:**
  - It starts at its title heading.
  - It ends where the next unrelated article, appendix, credits page, or adventure starts.
  - In anthologies (BOOST and the like), an adventure can sit among unrelated articles. Only its own pages belong to it; list the rest under ℹ with their skills.
- **Top-level chapters** are the adventure's largest structural divisions:
  - Acts, Parts, Episodes, numbered Encounters or Scenes.
  - Front matter (introduction, background, adventure summary, hooks) that comes before the first act.
  - Endings ("Conclusion", "Denouement", "Epilogue", "Aftermath", "Rewards").
  - Appendices or handouts printed as part of the adventure.
- **Decide the hierarchy by what the heading does, not by how it looks:**
  - Read heading size, weight, and color from `pdf-runs.js` and the page images.
  - A heading style used for acts/encounters marks a chapter. Smaller styles inside it are nested `{ title, entries }` sections.
  - When the book reuses one heading style for both structural and minor headings, go by function. For example, "Encounter 3: The Chase" is a chapter; "Hitching the Horses" is a section.
- **Front matter:**
  - When there's untitled intro text before the first heading, the first chapter takes the adventure's name as its `title` (see Inspection Tour).
  - Otherwise, use the book's own heading ("Introduction", "Background").
- **Levels:**
  - A section renders at its nesting depth: chapters at level 1, their sections at 2, and so on.
  - **Levels 1 and 2 are page-wide splits.** They draw a full-width heading with a rule under it, and the text below restarts in two columns.
    - Keep level 2 for self-contained blocks that should start a new row, e.g. an NPC profile ("Stella (Saloon Gal, Rival)") or a distinct scene.
    - A section that sits *inside* the flow of its parent would break that flow if it rendered at 2. Examples: a rules aside mid-scene, a run-in heading, or a subsection followed by more of the parent's text or tag lines. Give it `"forceTitleLevel": 3` (see "Effects of the Ghost Carriage" in BOOST:5 "Ghost Carriage").
    - Children render one level below their parent's *rendered* level: under a forced 3, they're 4 without forcing. Only force a deeper section when it too would render at 1–2 and disrupt the content.
  - Otherwise, only use `forceTitleLevel` when the rendered level would be wrong. Don't skip levels.
  - List every forced level under ℹ judgment calls.
- **Ask early.** Right after extraction, if any boundary or nesting was a judgment call, show the proposed outline and ask before staging. List chapter titles with pages, nested sections indented, plus where the adventure starts and ends.

  ```
  Weird West adventure "Ghost Carriage", pp. 4–6
  ├─ Summary (p.4) — subtitle + author, intro
  ├─ Bait (p.5)      → {@vehicle Carriage}, {@vehicle The Ghost Carriage}, chase paragraph (reprinted)
  │   ├─ Effects of the Ghost Carriage (p.6) — reprinted (needed at the table), force level 3
  │   └─ → {@adversary Emily Jenson} (no heading)
  └─ Wrap-up (p.6)
  ```

  If no boundary was a judgment call, list the outline under ℹ judgment calls instead.

## Reading the book

| Printed | JSON |
|---|---|
| Adventure title | `name`, as printed |
| Chapter / section heading | `{ "title": "…", "page": N, "entries": [ … ] }`. **Every titled section** gets the printed `page` of its heading, chapters and nested sections alike. |
| Body paragraphs | Strings, one per paragraph (tagged) |
| Read-aloud / boxed player text | `{ "type": "read-aloud", "entries": [ … ] }` (add `title` only when printed) |
| Worked examples | `{ "type": "example", "title": "…", "entries": [ … ] }` |
| Bulleted / run-in lists (checks, outcomes, clues) | `{ "type": "list", "items": [ … ] }`, or `list-no-bullet` for run-in bold labels |
| Skill checks | `{@difficulty average|Perception}`, `{@difficulty hard|Vigilance or Coordination|1}`; results `{@symbols aa}` |
| Statuses and rules named in prose | `{@rule immobilized}` |
| NPCs without stat blocks | Plain prose; tag only if an item exists |
| Images, maps, handout art | Left out and listed (the user adds `{ "type": "image", "imageUrl" }` later) |

- `settings`: omit unless the adventure targets settings that differ from `_meta.defaultItemSettings`.
- An adventure item has no `page`, `description`, or `id`. Everything lives in `chapters`.
- Read-aloud boxes contain only the player-facing text. GM instructions printed next to them ("read aloud or paraphrase the following:") stay in the preceding string.

## Pack conventions

- **Subtitle and author credit go at the top of the first chapter's `entries`, above all other text.** Never put them as loose strings in `chapters`: the app only renders chapter objects properly.
  1. Subtitle, if printed: `"{@i A Mini-Adventure Encounter}"` (there's no schema field for it).
  2. Author line: `"{@b Author:} Name"`, or `"{@b Authors:} A and B"`. In BOOST packs, use the Credits names from `_meta.source.authors`.
  3. Then the chapter's own text.

  ```json
  "chapters": [
     { "title": "Summary", "page": 4, "entries": [
        "{@i A Mini-Adventure Encounter}",
        "{@b Author:} Chris Markham",
        "Travel between cities has always …"
     ] },
     …
  ]
  ```
- If the destination has no author-credit convention, follow the one it uses for books, or ask.

## Long adventures and updates

- Extract in chunks of 10 pages or fewer (workflow step 3), and stage the adventure as one item.
- **Continuing or updating an existing adventure** (e.g. a later run for the next pages):
  - Print the existing item.
  - Stage the whole item with chapters appended or changed.
  - Show a chapter-level diff (added, changed, and unchanged chapter titles).
  - Merge with `--replace "<name>"` after approval.
- A range that starts mid-chapter continues that chapter only when it's the last chapter of the existing adventure. Otherwise, skip the partial chapter and report it (workflow boundary rule).

## Checks (in addition to workflow step 6)

```bash
node .claude/skills/pack-adventure/scripts/reprint-check.js "<staged>" --dest <dest>
```

- Lists adventure sentences that already appear in another item (any group, any pack). Replace each with a tag or `_ref`. If one genuinely has to stay, say why in the report.
- Verifies that every `_ref` resolves (`check.js` skips `_ref`). It points out targets that exist only in another pack and need a `source`.
- Re-run it until it's clean.

Also ⚠ when:
- Every stat block on the pages should have a matching `{@adversary}` line, and every `{@adversary}` line should match a printed block.
- A titled section is missing `page`, or heading levels skip.
- A read-aloud box contains GM-only text.

## Exemplar

- EotI:IT "Inspection Tour": structure, read-aloud, lists, and checks.
  - Differences from it: stat blocks here are a bare `{@adversary}` line, not a titled subsection, and titled sections carry `page`.
- BOOST:5 "Ghost Carriage": subtitle and author at the top of the first chapter, and NPC sections without stat blocks.
