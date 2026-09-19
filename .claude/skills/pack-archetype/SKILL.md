---
name: pack-archetype
description: Import or update archetypes/species (and their archetype abilities) in a GenesysRef content pack from PDF pages. Usage /pack-archetype <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Archetypes / species → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to archetypes.

## Writes

- `archetype`. Read `schemas/archetype_schema.json`.
- `archetypeAbility` (companion group, owned by this skill). Read `schemas/ability_schema.json` and `schemas/item_tags_sub_schema.json`.

## ⚠ This schema is mid-migration

Three shapes currently exist for `skills.skills` / `skills.choice`:
- **Schema:** `skills.skills` holds strings; `choice` is boolean, or an array of category strings / arrays of `{name, source, ranks}`.
- **EotI data:** `skills.skills` holds `{name, source, ranks}` objects.
- **CRB/EPG data:** `choice` is a flat array of `{name, source, ranks}`.

Some CRB/RoT archetypes also carry a `modifiers` field the schema doesn't have.

Before staging, compare the schema on disk with the destination's existing archetypes. If they disagree, **ask which shape to follow**.
- Merging a non-schema shape needs `--allow-schema-errors`, and only with the user's approval.
- Don't add `modifiers` unless the user asks.

## Reading an archetype page

| Printed | JSON |
|---|---|
| Name | `name`. Use `nickname` to group sub-types (e.g. "Dwarf (Dunwarr)") when the pack already does. |
| Characteristic row | `characteristics` (all six). Paired archetypes use arrays per the schema's "Archetype Pair". |
| Wound Threshold: 10 + Brawn | `wt: 10` (the base number only) |
| Strain Threshold: 10 + Willpower | `st: 10` |
| Starting Experience: 110 XP | `xp: 110` |
| Starting Skills text | `skills.description` (tagged, verbatim), plus the structured `skills` fields for the chosen shape: `ranksTotal`, `ranksEach`, `choice`, … |
| Special abilities (named) | An `archetypeAbility` item + a string reference in `abilities` |
| Unnamed extra rules ("starts the game with a sealed environmental suit") | A private ability object in `abilities`: `{ "description": ["Your character starts the game with a {@gear sealed environmental suit} (see page 117)."] }` |
| Introductory prose | `description` (strings) |
| "Why play a …" text | `why` |
| Naming conventions + example names | `names`: `{ "description": [...], "names": ["San Nerio", …] }` |

- **Abilities:**
  - Reuse an existing same-named `archetypeAbility` from any pack only if the text matches. Otherwise stage a new one: `{ name, description: [...], tags: [...] }`.
  - If the name exists elsewhere with different text, ask.
  - Pick `tags` from the enum, including `character creation modifier` when relevant.
- **Skills** in `skills.description` and in ability text get tags: `{@skill Vigilance}`.
- **Structured skill refs** keep explicit sources (`"source": "crb"`).

## Consistency checks (⚠ when they fail)

- The starting skills text should agree with `ranksTotal`/`ranksEach` and the listed skills.
- Thresholds should read "N + Characteristic". Another form is a schema/representation question, so ask.

## Exemplars

- EotI "Creuss": object skills, abilities including a private ability, `why`, `names`.
- CRB "Animalistic Alien": `choice` list.
- EPG "Sorcerer".
- EotI archetypeAbility "Adaptable".
