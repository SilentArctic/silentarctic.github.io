---
name: pack-setting
description: Import or update settings (setting overview, lore, codex, character options) in a GenesysRef content pack from PDF pages. Usage /pack-setting <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Settings → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to settings.

## Writes

- `setting`. Read `schemas/setting_schema.json` and `schemas/varyingDisplay_sub_schema.json`.
- Possibly `_meta.filters.settings` (add the setting name if it's new).

| Printed | JSON |
|---|---|
| Setting name | `name`. It must match what `settings` arrays and `defaultItemSettings` use for this pack. |
| Short overview | `summary` (plain string array, tagged) |
| Setting history, themes, lore sections | `lore` (varyingDisplay with titled sections) |
| Important people, places, items, factions | `codex` (varyingDisplay) |
| Recommended archetypes, careers, skills, gear, and talents for the setting | `characterOptions` (varyingDisplay, often tables of `{@archetype …}`, `{@career …}`, `{@gear …}` tags) |

- In a setting book, the "setting" item is often just a pointer, e.g. EotI: `summary: ["See {@title Twilight Imperium: Embers of the Imperium} for more information on the Twilight Imperium setting."]`.
  - Ask how much the user wants imported before converting whole chapters.
- Tag every referenced item that exists (see `check.js` REFS). Items from other packs need `||abbr` (not CRB).

## Exemplars

- CRB "Science Fiction", "Space Opera": full lore and characterOptions.
- EotI "Twilight Imperium": pointer only.
