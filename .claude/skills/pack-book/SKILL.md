---
name: pack-book
description: Build a `book` item in a GenesysRef content pack, a representation of an entire source book (PDF) laid out as GenesysRef-readable entries that `_ref` existing data instead of duplicating text. Manual-only special case, never part of /pack-core. Usage /pack-book <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Book item → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

A `book` item represents the **entire source material** (an actual book/PDF) as a table of contents laid out in GenesysRef-readable entries. It is a special case: **run it manually only**, and it is **not** part of `/pack-core`.

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to book items.

## Core rule: no duplicated text

The book's content should already exist in the pack as its own items (rules, talents, gear, adversaries, tables, sidebars, …), usually imported earlier via the type skills or `/pack-core`.

- **Never copy text** that exists as an item. Use `_ref` entries to load it, so the book only carries the structure and ordering.
- Only write prose inline when no item holds it (chapter intros, connective text, read-aloud not modelled elsewhere).
- Before writing inline text, search the pack for it. If it exists, `_ref` it. If a needed item is missing, report it (suggest the right `/pack-*` skill) instead of inlining a copy.
- Verify every `_ref` resolves (`check.js`).

## Writes

- `book`. Read `schemas/book_schema.json`.
- Uses `schemas/varyingDisplay_sub_schema.json` for `chapters`.

**Adventures use `/pack-adventure`**, not this skill. If the source is an adventure, stop and suggest it.

| Printed | JSON |
|---|---|
| Title | `name` (+ `subtitle`, `releaseYear`, `credits` when printed on the pages) |
| Chapter / section headings | `chapters`: `[{ "title": "…", "entries": [ … ] }]`, nesting `{ title, entries }` for sub-sections |
| Content that exists as an item (rules, gear, adversaries, tables, sidebars…) | A `_ref` to that item, in printed order |
| Body paragraphs with no existing item | Strings (tagged), sparingly |
| Images / maps | Can't be uploaded. Leave them out and list them (the user adds `{ "type": "image", "imageUrl": … }` later). |

- **Updating an existing book item** usually means inserting or replacing chapters inside one large item.
  - Stage the whole item (the existing one with your chapter changes), and show the chapter-level diff for approval.
  - Merge with `--replace "<name>"` after approval.

## Exemplars

- EotI:MR book "The Mecatol Report" (check whether it predates the `_ref`-only approach before copying its style).
