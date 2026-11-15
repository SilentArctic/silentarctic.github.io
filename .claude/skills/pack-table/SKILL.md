---
name: pack-table
description: Import or update tables in a GenesysRef content pack from PDF pages. Usage /pack-table <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Tables → content pack

**Recommended effort:** high (values are read from page images and number-heavy stat blocks or tables, where a misread digit is a data error).

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md` (skip a file only if its full text is still in your context, e.g. earlier in a `/pack-core` run; re-read it after any context summary), and follow the workflow step by step. This file only adds what's specific to tables.

## Writes

- `table`. Read `schemas/table_schema.json`.

## Reading a table

Extract with `pdftotext -layout` (keeps the columns aligned) **and** view the page image. Multi-line cells, merged cells, and dice columns are only reliable visually.

| Printed | JSON |
|---|---|
| Caption "Table 2-5: Clothing and Armor" | `name`: `"Table 2-5: Clothing and Armor"` (keeps the "Table " prefix; tags leave it out) |

- **Naming:** `Table N-M: Title Case Caption`, with a hyphen even when the book prints an en or em dash. Symbols in a caption are spelled as words ("Spending Advantage and Triumph").
- **Unnumbered tables** get a number, because the client only links `{@table X}` to an item named "Table X". Use "Table N-M": N counts the book's sections or items that have tables (in book order, skipping ones without), M is the table's order within it. Log each number as a decision.

| Column headers | `columns`: `[{ "header": "Encumbrance", "value": "encum", "size": 1 }]` |
| Rows | `rows`: `[{ "<value>": "cell", … }]`, keyed by each column's `value` (or its header, case-insensitive, if no `value`) |
| Section band spanning the table | `{ "subtitle": "Clothing" }` row |
| Note above / below the table | `subtitle` / `foot` |

- **`value`:** a short lowercase key (`name`, `encum`, `hp`, `price`, `rarity`).
- **`size`:** a relative width. Give the wide text column 2–5 and the rest 1, approximating the printed proportions.
- **Cells are strings**, even numbers (`"50"`, `"+1"`, `"580 (R)"`).
  - A cell with several lines or bullet points can be an array of strings.
  - Keep "—" as printed.
- **Tag inside cells:**
  - item names (`{@gear Durable Clothing}`, `{@optionFeature Ancient}`, `{@talent …}`)
  - difficulties (`{@difficulty hard}`)
  - dice (`{@dice boost}`)
  - symbols (`{@symbols aa}`)
  - skills and qualities
- A table split across pages (with a "continued" header) is one table. If it runs past the page range, ask (boundary rule).

## Consistency checks (⚠ when they fail)

- Rows whose stats disagree with the matching item's own profile, e.g. gear table vs gear item. Report them; don't fix.
- Cells whose item names don't resolve.

## Exemplars

- SotB "Table 2-5: Clothing and Armor": subtitles, gear tags.
- CRB "Table I.5-4: Repairing Gear": difficulties.
- CRB "Table I.5-2: Rarity Modifiers": array cells.
