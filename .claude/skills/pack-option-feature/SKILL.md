---
name: pack-option-feature
description: Import or update options/features (craftsmanship, materials, traits, ice, heroic abilities, services…) in a GenesysRef content pack from PDF pages. Usage /pack-option-feature <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Options & features → content pack

**Recommended effort:** medium (rules text needs judgment (ranked or not, tags, references) but has no image stat blocks).

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md` (skip a file only if its full text is still in your context, e.g. earlier in a `/pack-core` run; re-read it after any context summary), and follow the workflow step by step. This file only adds what's specific to option/features.

## Writes

- `optionFeature`. Read `schemas/optionFeature_schema.json`.
- Possibly `_meta.filters.optionFeatureType` / `_meta.filters.optionFeatureClass` (workflow step 8).

Option/features are the catch-all for customization rules that aren't gear, talents, or qualities: craftsmanship, materials, item traits, species traits, ice/icebreakers, heroic abilities, services…

| Printed | JSON |
|---|---|
| Name | `name` |
| Kind of option | `type`. Reuse existing values; see below. |
| Sub-kind | `class` (optional). Reuse existing values. |
| Stat-like lines shown above the text ("Program Strength: 3", "Price/Rarity: …") | `labels`: `[{ "name": "Program Strength", "description": "3" }]` |
| Rules text | `description` (tagged; varyingDisplay allowed). Bold run-in labels become `{@b Armor:}` / `{@b Weapon:}`, and label lists become `list-no-bullet`. |
| Category introduction shared by every entry (e.g. the craftsmanship intro) | `info` (it shows in a secondary tab, on each entry in the category) |

- **Existing vocabulary** (check live data with workflow §1.4):
  - `Craftmanship` (sic, as in RoT), `Material`/`Implement Material`, `Heroic Ability`/`Upgrade`, `service`
  - `ice` with `barrier`, `sentry`, `code gate`; `icebreaker`
  - `Trait - Species` with `Form`, `Physiology`, …; `Trait - Armor`, `Trait - Weapon`
- A new `type` or `class` must also be added to `_meta.filters.optionFeatureType` / `optionFeatureClass`.
- Don't use `summary` (deprecated) or `meta`.

## Consistency checks (⚠ when they fail)

- Label values that disagree with the text (e.g. a price in a label vs the prose).
- Effects that reference qualities or rules that don't resolve.

## Exemplars

- RoT "Ancient": description + `info`, `list-no-bullet` price/rarity.
- CRB "Firewall": `labels`.
