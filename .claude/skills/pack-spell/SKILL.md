---
name: pack-spell
description: Import or update magic spells (and setting spell-effect changes) in a GenesysRef content pack from PDF pages. Usage /pack-spell <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Spells → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to spells.

## Writes

- `spell`. Read `schemas/spell_schema.json`.
- `spellEffects`: setting-specific additions or removals to existing spells' effect lists. Read `schemas/spell_effects_schema.json`.

## Reading a spell (magic action) entry

| Printed | JSON |
|---|---|
| Spell name (Attack, Augment, Barrier…) | `name` |
| Concentration: Yes / No | `concentration: true / false` |
| Base difficulty (e.g. "Easy (◆)") | `difficulty`, lowercase: `"easy"` |
| Default range | `range`, capitalized: `"Short"` (or `""` if none; see the enum) |
| Which magic skills can cast it | `skills`: `[{ "name": "Arcana", "source": "crb" }]`. Omit `source` for destination skills. |
| Narrative-use text | `narrative` (tagged strings) |
| Structured-use text | `structured` (tagged strings) |
| "Additional Effects" table rows | `additionalEffects`: `[{ "name", "description": [..], "difficultyMod", "difficultyUpgrade"? }]` |

- **`difficultyMod`:** the integer number of difficulty increases the effect adds ("+1 difficulty" → `1`, "+2 difficulty" → `2`).
- **`difficultyUpgrade`:** used when the effect *upgrades* the difficulty instead.
- **The effects table** is part of the spell. The same table may also exist as a `table` item; if so, mention it under ℹ with `/pack-table`, and reference it in the text with `{@table …}`.
- **`spellEffects` entries:** `{ "spell": "Attack", "add": [{ name, description, difficultyMod }], "remove": ["Effect name"] }`. Use them when a setting book changes a CRB spell's effects rather than defining a new spell.

## Tagging notes

- Difficulty mentions: `{@difficulty easy}`.
- Qualities in effects: `{@quality Blast}`.
- Skills: `{@skill Knowledge}`.
- Symbols: `{@symbols t}`.

## Consistency checks (⚠ when they fail)

- Effect difficulty text vs `difficultyMod`, and a base difficulty in the text that differs from the header.

## Exemplar

- CRB "Attack".
