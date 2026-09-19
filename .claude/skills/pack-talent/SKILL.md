---
name: pack-talent
description: Import or update talents in a GenesysRef content pack from PDF pages. Usage /pack-talent <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Talents → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to talents.

## Writes

- `talent`. Read `schemas/talent_schema.json`, `schemas/talent_tags_sub_schema.json`, and `schemas/varyingDisplay_sub_schema.json`.

## Reading the book

Each talent has a bold name heading, a stat block (**Tier**, **Activation**, **Ranked**), then description paragraphs.
- Some books group talents under tier headings instead of printing a Tier line. Take the tier from the heading.
- Setting books often open a talent with an italic prerequisite sentence ("Your character must be a … or have allegiance to …").

| Printed | JSON |
|---|---|
| Name (incl. "(Improved)", "(Supreme)") | `name`, exactly as printed |
| Printed page of the heading | `page` |
| Tier: N | `tier` (integer 1–5) |
| Activation: Passive | `"passive"` |
| Activation: Active (Incidental) | `"active (incidental)"` |
| Activation: Active (Incidental, Out of Turn) | `"active (incidental, out of turn)"` |
| Activation: Active (Maneuver) | `"active (maneuver)"` |
| Activation: Active (Action) | `"active (action)"` |
| Ranked: Yes / No | `ranked: true / false` |
| Description paragraphs | `description`: one tagged string per paragraph |
| Italic prerequisite sentence | Keep it in `description` as `{@i …}` with the archetype/rule tags inside. Also list the names in `prerequisites`: `["Gashlai", "N'orr", "Yin Brotherhood"]` |

- Any other activation wording, or a tier outside 1–5, is a ⚠ schema gap. Propose the closest value and ask.
- **`tags`** (filter tags): pick from the enum in `talent_tags_sub_schema.json`. Tags exist to *find* talents, so be generous and include every tag that applies.
  - **Area:** `general` goes on almost every talent that isn't purely combat. Add `combat` and/or `social` as well when the talent is used there.
  - **Specifics:** add every effect that applies. Mappings the curated data uses:
    - gains career skills → `career skills`
    - heals strain or wounds, or repairs hull trauma/system strain → `recovery`
    - rerolls or changes results → `result manipulation`
    - changes speed or movement → `mobility`
    - vehicles → `vehicles`
    - makes or alters a specific check → `skill check`
    - uses a different skill → `skill swap`
    - reduces penalties → `mitigation`
    - faction/species prerequisite → `allegiance`
    - story-driven use → `narrative`
  - **Before choosing,** compare with the most similar existing talents in the destination, then CRB, and mirror their tags. List your picks as a judgment call.
- **`prerequisites`:** add any name that isn't already in `_meta.filters.talentPrereqs` (EotI does this for species and factions).
- **`settings`:** omit unless the book limits the talent to specific settings that differ from the pack default.

## Tagging notes

- "per rank of <this talent>" is a self-reference, so don't tag it.
- (Improved)/(Supreme) talents usually mention the base talent → `{@talent Hard Headed}`.
- Career-skill talents: `{@skill Athletics} and {@skill Knowledge (Adventuring)} are now career skills for your character.`

## Consistency checks (⚠ when they fail)

- The Activation line should agree with the text. For example, "may use this talent as a maneuver" doesn't fit `Activation: Active (Action)`.
- "Ranked: No", yet the text scales "per rank" (or the reverse).
- An (Improved)/(Supreme) talent's tier should be higher than its base talent's.

## Exemplars

- EotI "Fires of Conviction": italic prerequisites plus `prerequisites`.
- EotI "Emergency Vacuum Training": rule and characteristic tags.
- CRB "Basic Military Training": career skills.
- RoT "Back-to-Back": dice tags.
