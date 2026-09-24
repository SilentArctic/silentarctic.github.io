---
name: pack-gear
description: Import or update gear (weapons, armor, gear, attachments, cybernetics, implements, magic items…) in a GenesysRef content pack from PDF pages. Usage /pack-gear <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Gear → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to gear.

## Writes

- `gear`. Read `schemas/gear_schema.json`. Its `allOf` blocks add type-specific fields, so read them.

## Reading the book

Stats usually sit in a **table** (e.g. "Table 2-2: Ranged Weapons"). Descriptions sit in the prose that follows. You need both.
- If an item starts inside the range and its table or prose continues on a following page, read forward to finish it (workflow boundary rule). If the part you need lies *before* the range, stop and ask.
- The book's summary table itself is a separate `table` item. Mention it under ℹ with `/pack-table`.

| Printed | JSON |
|---|---|
| Section (Weapons, Armor, Gear, Attachments, Cybernetics…) | `type`: `weapon`, `armor`, `gear`, `attachment`, `cybernetic`, `implement`, `alchemy`, `artifact`, `magic`, `mount`, `treasure`, or `g-mod` |
| Table subtitle row / category | `class`, lowercase. Reuse existing values (see workflow §1.4): e.g. `beam`, `plasma`, `civilian`, `military`, `storage`, `medical` |
| Price "450" / "450 (R)" | `price: 450`; `(R)` → `restricted: true` |
| Price "—" or not for sale | `"n/a"` or `"priceless"`. Ask if unclear. |
| Rarity | `rarity` (integer; `null` only when printed as none) |
| Encum | `encumbrance` (integer; negative for capacity boosts like backpacks, following the schema) |
| HP | `hardPoints` |
| Description prose | `description` (tagged; varyingDisplay allowed) |

Fields by type (see the schema `allOf`):

- **Weapon:**
  - `skill`: `{ "name": "Ranged (Light)", "source": "crb" }`
  - `damage`: a string. Use `"+2"` when the book prints Brawn-added damage (+N); otherwise the number, following the destination's style (EotI uses `"4"`).
  - `critical` (integer); `range` (`"Engaged"` … `"Strategic"`); `encumbrance`; `hardPoints`
  - `special`: `[{ "name": "Pierce", "value": 2, "source": "crb" }]`. Note the key is **`value`**, not ranks.
- **Armor:**
  - `defense` (integer); `soak` is a **string** (`"+1"`); `encumbrance`; `hardPoints`
  - `special`: same shape as weapons (`value`).
- **Attachment:**
  - `hardPoints` (required); `class` is `"weapon"` or `"armor"`.
  - `qualities`: `[{ "name": "Breach", "ranks": 2, "source": "crb" }]`. Note the key is **`ranks`**.
  - `modifiers` when stats change.
  - Description as a `list-no-bullet` with `{@b Use With:}`, `{@b Modifiers:}`, `{@b Hard Points Required:}` lines (see EotI "Anti-Armor").
- **Implement:** `damage` (string, e.g. `"+2"`) and `encumbrance`.
- **Other types:** `encumbrance` is optional.
- **`modifiers`:** `[{ "name": "Brawn", "type": "characteristic", "value": "+1" }]`. Use it when the item grants flat stat or skill changes (cybernetics, attachments).
  - Types: `characteristic`, `skill`, `derived`, `own stat`.

## Tagging notes

- Quality mentions in prose: `{@quality Cumbersome|Cumbersome 3}`.
- Weapon skills: `{@skill Ranged (Heavy)}`.
- Tables: `{@table 2-1: Cultural Manufacturing Differences}`.

## Consistency checks (⚠ when they fail)

- Table stats vs prose (damage, qualities, price) disagree.
- Qualities in the table that don't exist as quality items.
- `(R)` on some rows but not others where the prose says restricted.

## Exemplars

- EotI "Beam Pistol": weapon.
- EotI "Dignitary's Garb": armor.
- EotI "Gravpad": gear.
- EotI "Anti-Armor": attachment.
- CRB "Cybereyes": modifiers.
