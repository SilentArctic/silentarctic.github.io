---
name: pack-rule
description: Import or update rules (rules sections, maneuvers/actions, statuses, setting entities such as factions or locations) in a GenesysRef content pack from PDF pages. Usage /pack-rule <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Rules → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to rules.

## Writes

- `rule`. Read `schemas/rule_schema.json` and `schemas/varyingDisplay_sub_schema.json`.

A rule is any named rules section that other text links to with `{@rule …}`:
- a maneuver or action
- a status effect
- an environmental hazard
- a subsystem
- a setting entity stored as a rule (EotI factions, locations, galactic threats)

| Printed | JSON |
|---|---|
| Section heading | `name`. It's what `{@rule …}` tags match, so use the heading as printed. |
| Printed page of the heading | `page` |
| Kind of rule | `type`. **Reuse existing types** (they drive filters), e.g. `maneuver`, `action`, `incidental`, `status`, `environment`, `combat`, `movement`, `vehicle`, `vehicle maneuver`, `hacking`, `fear`, `character`, `adversary`, `gear`, `great civilization`, `stellar geography`, `agenda`. A new type is a judgment call; report it. |
| Body | `description`, varyingDisplay (below) |

- **Sub-headings:** `{ "title": "Heading", "entries": [ … ] }`. Nest them for deeper levels; use `forceTitleLevel` only when the rendered level is wrong.
- **Examples:** `{ "type": "example", "title": "…", "entries": [ … ] }`.
- **Lists:** `{ "type": "list", "items": [ … ] }`.
- **Tables inside the section:** embed the table item, `{ "type": "table", "_ref": { "name": "Table I.6-9: Falling Damage" }, "columns": [], "rows": [] }`.
  - If the table item doesn't exist yet, mention it under ℹ with `/pack-table`.
- **Sidebars inside the section:** `{ "type": "sidebar", "_ref": { "name": "Flying" }, "entries": [] }`, or suggest `/pack-sidebar`.
- **Where to split:** decide how big a "rule" is from how the text will be linked. A maneuver or a status is its own rule; a long subsystem can be one rule with titled sections. Ask if unsure.

## Exemplars

- CRB rules with nested sections and `_ref` embeds.
- EotI "Arc Prime and Wren Terra": a setting entity stub.
- Browse `node -e "const d=require('./api/core-rule-book.json');console.log(d.rule.map(r=>r.name+' ['+r.type+']').join(' | '))"`.
