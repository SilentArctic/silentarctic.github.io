---
name: pack-sidebar
description: Import or update sidebars (boxed text) in a GenesysRef content pack from PDF pages. Usage /pack-sidebar <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Sidebars → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to sidebars.

## Writes

- `sidebar`. Read `schemas/sidebar_schema.json` and `schemas/varyingDisplay_sub_schema.json`.

Sidebars are the boxed or shaded text blocks with their own title. Find them visually; in text extraction they interleave with the main columns.

| Printed | JSON |
|---|---|
| Box title | `name`, as printed |
| Page the box is on | `page` |
| Topic | `type`. Reuse existing values: `combat`, `gear`, `vehicle`, `movement`, `environment`, `character`, `adversary`, `computers`, `hacking`, `magic`, `travel`, `agenda`. Lowercase. |
| Box text | `description` (tagged; varyingDisplay allowed) |

- Don't add `summary` (deprecated).
- A sidebar that continues onto another page is one item. If it runs past the range, finish it from the following page(s) (workflow boundary rule).
- Rules and items that embed this sidebar use `{ "type": "sidebar", "_ref": { "name": "<name>" }, "entries": [] }`. Mention any such embedding opportunities under ℹ.

## Exemplar

- CRB "Cool or Vigilance?": skill and rule tags throughout.
