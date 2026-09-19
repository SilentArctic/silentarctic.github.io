---
name: pack-skill
description: Import or update skills (and characteristics) in a GenesysRef content pack from PDF pages. Usage /pack-skill <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Skills (and characteristics) → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to skills.

## Writes

- `skill`. Read `schemas/skill_schema.json`.
- `characteristic` (rare; only when the pages define characteristics). Read `schemas/characteristic_schema.json`.

## Reading a skill entry

| Printed | JSON |
|---|---|
| Name, e.g. "Knowledge (Adventuring)" | `name`, exactly as printed |
| Linked characteristic, e.g. "(Intellect)" | `characteristic`, capitalized as in existing data: `"Intellect"` |
| Section or chapter grouping | `category`: `general`, `combat`, `social`, `knowledge`, `magic`, or `other` |
| Description paragraphs | `description` (tagged; varyingDisplay allowed) |
| "Your character should use X if…" bullets | `shouldUse`: one string per bullet (tagged) |
| "Your character should not use X if…" bullets | `shouldNotUse`: one string per bullet. These usually name other skills, so tag them: `{@skill Coordination}`. |
| Magic skills: the spells the skill can cast | `spells`: `[{ "name": "Attack", "source": "crb" }]`. Only when the pages state it; otherwise ask. |

- The bullets' lead-in ("Your character should use … if:") isn't stored. The UI supplies it.
- **Characteristic entries:** `{ "name": "Brawn", "page", "description": [strings] }`.

## Consistency checks (⚠ when they fail)

- A skill name that clashes with a CRB skill of a different characteristic or category.
- `shouldNotUse` bullets should name the skill to use instead. Make sure that skill resolves.

## Exemplars

- RoT "Knowledge (Adventuring)".
- CRB "Arcana": magic skill with `spells`.
