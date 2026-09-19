---
name: pack-quality
description: Import or update item qualities in a GenesysRef content pack from PDF pages. Usage /pack-quality <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Item qualities → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to qualities.

## Writes

- `quality`. Read `schemas/quality_schema.json`.

## Reading a quality entry

| Printed | JSON |
|---|---|
| Name (without rank) | `name` ("Auto-Fire", "Pierce") |
| (Active) / (Passive) | `activation`: `"active"` or `"passive"` |
| What it applies to (section: weapon qualities, armor qualities, vehicle, or any) | `gearType`: `"weapon"`, `"armor"`, `"vehicle"`, or `"any"` |
| Rules text | `description` (tagged; varyingDisplay allowed) |

- If the section doesn't say what it applies to, `gearType` is a judgment call, so report it.
- If the summary table of qualities (e.g. "Table: Item Qualities") is on the pages, mention it under ℹ with `/pack-table`.

## Tagging notes

- Symbols to trigger: `spending {@symbols aa}`.
- Dice: `{@dice difficulty}`.
- Other qualities: `{@quality Blast}`.
- Status rules: `{@rule staggered}`.

## Exemplar

- CRB "Auto-Fire".
