---
name: pack-adversary
description: Import or update adversaries (and their adversary abilities) in a GenesysRef content pack from PDF pages. Usage /pack-adversary <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Adversaries → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to adversaries.

## Writes

- `adversary`. Read `schemas/adversary_schema.json`.
- `adversaryAbility` (companion group, owned by this skill). Read `schemas/ability_schema.json` and `schemas/item_tags_sub_schema.json`.

## Reading a stat block

| Printed | JSON |
|---|---|
| Name + type (Minion / Rival / Nemesis) | `name`; `type`: `"minion"`, `"rival"`, or `"nemesis"` |
| Power level icons (EPG and later books) | `powerLevels`, keys in the order **combat, social, general** |
| Brawn / Agility / Intellect / Cunning / Willpower / Presence | `characteristics` (all six, integers) |
| Soak, Wound Threshold, Strain Threshold, M/R Defense | `derived`: `soak`, `wounds`, `strain` (**nemesis only**), `defense: [melee, ranged]` |
| Skills: Brawl 2, Melee 3 … | `skills`: `[{ "name", "characteristic", "ranks", "source" }]` |
| Skills (group only): … (minions) | Same, **without `ranks`** |
| Talents: Adversary 1 (…), Knack for It (…) | `talents`: see below |
| Abilities: Silhouette 2, Flyer (…), named abilities | `abilities`: see below |
| Equipment | Weapons go in `weapons`; everything else goes in `gear` strings |
| Spells section (magic users) | `spells`: `{ "skills": [{name, source}], "spells": [{ "name", "description" }] }` |
| Motivations (Desire / Fear / Strength / Flaw) | `motivations`: `[{ "name": "Desire", "description": "Belonging" }]` |
| Flavor text | `description`: strings (the Homebrew Builder doesn't support advanced text) |

- **Skills:**
  - `characteristic` is the skill's linked characteristic, lowercase. Look it up from the skill item:
    ```bash
    node -e "for (const f of ['core-rule-book','<dest-basename>']) { const d=require('./api/'+f+'.json'); (d.skill||[]).forEach(s=>console.log(s.name,'→',s.characteristic)) }"
    ```
  - Add `"source": "crb"` (or another pack) whenever the skill isn't in the destination. Structured refs keep explicit sources.
- **Talents:**
  - A destination talent is a plain string: `"Ccrysusian Methodology"`.
  - A talent from another pack is an object: `{ "name": "Adversary 1", "source": "crb" }`. The rank goes in the name.
  - Drop the printed parenthetical summary. If it contradicts the actual talent, raise a ⚠.
  - **Knack for It** and **Natural** are the exception: printed on an adversary, they name specific skills (eg. "remove {@dice setback|2} from Driving, Operating, and Piloting checks"), which the core talents leave to the player's choice. Write them as abilities instead (see "Knack for It 2" on SotB "Tenma Driver Clone"), with the specific skills in the text.
- **Abilities:** each becomes a string reference to an `adversaryAbility` item.
  - If an ability with that name exists in **any** pack **and** the text matches, reference it by name. Include the rank: `"Silhouette 2"`, `"Terrifying 2"` (the base items are "Silhouette" and "Terrifying").
  - If it's new, stage an `adversaryAbility` item: `{ "name", "description": [tagged strings], "tags": [...] }`. Then reference it by name.
  - If a same-named ability exists elsewhere with **different** text, ask. The name collision is ambiguous.
  - Pick `tags` from the enum:
    - area: `combat`, `social`, `general`, `magic`
    - activation: `passive` or `active`
    - timing: `action`, `maneuver`, `incidental`, `incidental (out of turn)`
    - frequency: `session`, `encounter`
    - function: e.g. `results spend`, `skill check modifier`, `movement`
  - Look at EotI abilities for examples. Be generous with function tags, as with talents. Mappings the curated data uses:
    - affects several characters at once (an area, "all characters within …") → `crowd control`
    - spends a maneuver as part of the effect → `maneuver` as well
    - purely story or flavor effects (communication, secrets) → `narrative`
    - area follows the effect, not the stat block: a disruption usable anywhere is `general`, not `combat`
  - **Ability text that names its own adversary** ("in a direction of the elder Titan's choosing"): the curated data rewrites it as "this character's" so the ability reads as reusable. That's a wording change, so propose it as a judgment call and apply it only when approved.
  - Printed ability text is a parenthetical, so its nested `[…]` brackets become `(…)`, the first letter is capitalized, and a period is added (see "Viral Infection", "Fling Aside").
- **Weapons:** `{ "name", "skill": {name, source}, "damage", "critical", "range", "qualities": [{name, ranks, source}], "details" }`.
  - Always use this table format (one field per stat). Never put the printed profile in a `description` string; that form is deprecated.
  - `name` is as printed, in sentence case ("Concealed mango-thumper").
  - `damage` is the printed **total** (an integer).
  - `range` is capitalized: `"Engaged"` … `"Strategic"`.
  - Quality ranks go in `ranks`.
  - Extra text goes in `details`.
  - Critical printed "—" or missing → ⚠ (the schema requires an integer). Ask.
- **Other equipment:** `gear` strings. Text after a colon isn't bolded, so the convention is `"{@gear Echo Garment|Echo robes}: +1 soak"`. Tag the item when a matching gear item exists.
  - Setting-flavored names often map to a generic catalog item (EotI tags "Ember suit" as `{@gear Sealed environmental suit|Ember suit}`). Before leaving equipment untagged, search the destination's adversary `gear` strings and prose for the same name and reuse the mapping:
    ```bash
    node -e "const d=require('./api/<pack>.json'); for (const a of d.adversary) for (const g of a.gear||[]) if (/<name>/i.test(g)) console.log(a.name, '→', g)"
    ```
  - No mapping and no obvious catalog match → leave it untagged and list it as a judgment call.
- **Variants:**
  - The base profile gets `hasVariants: true`.
  - Each variant is a full entry named `"Base (Variant)"` with `variant: true`: modifications applied to the stats, plus the modification text in `description` (see EotI "Combat Pilot (Argent Flight)").
  - If the book prints only the modifications, confirm this convention with the user before expanding them.
- Named unique characters get `npc: true`.
- Don't add the deprecated `tags` field to adversaries.

## Consistency checks (⚠ when they fail)

- A minion with skill ranks, a rival or minion with strain, or a nemesis without strain.
- Defense should be exactly two integers.
- Weapon damage should match the printed profile (e.g. a Brawn-based weapon: Brawn + base).
- Talents and abilities used in the text but missing from the lists, or the reverse.
- The skill characteristic should match the skill item (`check.js` warns under REFS).
- A skill's `source` must be the pack that actually holds it. EotI has its own `Knowledge (…)` skills, so they take no source.
- Power levels: read them from the page image (the red, blue, and green badges are combat, social, general). pdftotext and pdf-runs.js can scramble their order.
- Abilities keep the printed order.

## Exemplars

- EotI "Vassal System Governor": nemesis, powerLevels, talents, gear string.
- EotI "Brother of Yin": minion.
- EotI "Combat Pilot" and "Combat Pilot (Argent Flight)": variants.
- EotI adversaryAbility "Ad Hominem Attack": tags.
- CRB adversaryAbility "Silhouette": a ranked ability.
