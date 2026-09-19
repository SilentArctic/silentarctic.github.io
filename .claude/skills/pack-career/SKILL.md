---
name: pack-career
description: Import or update careers in a GenesysRef content pack from PDF pages. Usage /pack-career <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Careers → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to careers.

## Writes

- `career`. Read `schemas/career_schema.json`.
- `startingGear.selections` is new and still evolving. Check the schema on disk against the destination's recent careers, and ask if they disagree.

## Reading a career page

| Printed | JSON |
|---|---|
| Name | `name` |
| Career description paragraphs | `description` (string array, tagged) |
| "… counts the following skills as career skills: …" sentence | Keep it in `description`, with every skill tagged: `{@skill Knowledge (Lore)}`, `{@skill Athletics}` |
| The same skill list | `skills`: `[{ "name": "Athletics", "source": "crb" }, { "name": "Knowledge (Lore)" }]`. Omit `source` only for destination skills. |
| Starting Gear intro line | `startingGear.description` |
| Starting gear list items | `startingGear.gear`: one tagged string per printed line, e.g. `"A {@gear holy icon} {@i or} {@gear shield} and {@gear leather armor}"`, `"1d100 silver coins"` |
| The same list, structured | `startingGear.selections`, following the schema and recent careers (see below) |
| Suggested talents (if printed) | `usefulTalents`: `{ "description": [...], "talents": [{ "tier", "name", "source" }] }` |

- **`selections`:**
  - A fixed item: `{ "name": "mace" }`, plus `quantity` if more than one.
  - Either/or choices: an array of option arrays, `[[{holy icon}], [{shield}, {leather armor}]]`.
  - Money: `{ "name": "1d100 silver coins", "money": true, "formula": "1d100" }`.
  - Names must match gear item names. Add `source` when the item isn't in the destination.
- An "or" printed in italics between options → `{@i or}`.
- Gear with a quantity or a different printed form → `{@gear torches (3)|3 torches}`, `{@gear waterskin (empty)|waterskin}`.
- **Traits and other option/features** in starting gear (e.g. SotC weapon traits) → `{@optionFeature Name}`. Never `{@trait}`.

## Consistency checks (⚠ when they fail)

- The career-skills sentence and `skills` should list the same skills (usually 8).
- Starting-gear items should exist as gear. Missing ones are left untagged and reported.
- The "choose N career skills to rank" wording should be the standard one; flag deviations.

## Exemplars

- RoT "Disciple": complete, with selections.
- EotI "Captain".
