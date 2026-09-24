---
name: pack-book
description: Import or update long-form books or adventures (chapters of prose, read-aloud text, sidebars) in a GenesysRef content pack from PDF pages. Usage /pack-book <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Books & adventures → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to long-form content.

## Writes

- `book`. Read `schemas/book_schema.json`.
- **or** `adventure`. Read `schemas/adventure_schema.json`.
- Both use `schemas/varyingDisplay_sub_schema.json` for `chapters`.

**Ask which group** if it isn't obvious: `adventure` is playable scenario content; `book` is sourcebook or lore reading.

| Printed | JSON |
|---|---|
| Title | `name` (+ `subtitle`, `releaseYear`, `credits` for books when printed on the pages) |
| Chapter / section headings | `chapters`: `[{ "title": "…", "entries": [ … ] }]`, nesting `{ title, entries }` for sub-sections |
| Body paragraphs | Strings (tagged) |
| Boxed read-aloud text | `{ "type": "read-aloud", "entries": [ … ] }` |
| Boxed sidebars | `{ "type": "sidebar", "title": "…", "entries": [ … ] }`, or `_ref` an existing sidebar |
| Stat blocks of adversaries | Reference them (`{@adversary Name}`) and suggest `/pack-adversary` for the profiles |
| Tables | An inline table object, or `_ref` a table item |
| Images / maps | Can't be uploaded. Leave them out and list them (the user adds `{ "type": "image", "imageUrl": … }` later). |

- **Adventures** may have `settings`, e.g. `[{ "name": "Twilight Imperium", "source": "eoti" }]`.
- **Updating an existing book or adventure** usually means inserting or replacing chapters inside one large item.
  - Stage the whole item (the existing one with your chapter changes), and show the chapter-level diff for approval.
  - Merge with `--replace "<name>"` after approval.
- Long-form tagging is dense: every named adversary, gear item, skill check (`{@difficulty …}`), and symbol.

## Exemplars

- EotI:MR book "The Mecatol Report".
- EotI:IT adventure "Inspection Tour".
