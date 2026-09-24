---
name: pack-specialization
description: Import or update specializations (talent trees) in a GenesysRef content pack from PDF pages. Usage /pack-specialization <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Specializations → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to specializations.

## Writes

- `specialization`. Read `schemas/specialization_schema.json`.

## Reading a specialization

| Printed | JSON |
|---|---|
| Name | `name` |
| Career it belongs to | `career`: `{ "name": "Fighter Pilot", "source": "crb" }` |
| Bonus career skills | `skills`: `[{ "name": "cool", "source": "crb" }, …]` |
| Talent tree, rows 1–5, up to 4 per row | `talents.row1` … `talents.row5`: `[{ "name", "source", "right", "down" }]` |
| Descriptive text | `description` (strings, tagged) |

- **The tree is read visually** with the Read tool; text extraction loses the connecting lines.
  - `right: true` means a connector runs from this talent to the talent on its right.
  - `down: true` means a connector runs to the talent directly below.
  - Omit false flags.
  - If any connector is unclear, **ask**. Don't guess.
- Talent names must match talent items exactly. Include `source` for talents outside the destination.
  - The same talent can appear more than once in a tree; that's normal.
- Tree cells that show a talent's cost or tier are layout, not data.

## Consistency checks (⚠ when they fail)

- A row with more than 4 talents, or a talent name that doesn't resolve (`check.js` REFS).
- Connectors that leave a talent unreachable from row 1. That's usually a misread, so re-check the image.

## Exemplar

- EPG "Daredevil Pilot".
