---
name: pack-vehicle
description: Import or update vehicles in a GenesysRef content pack from PDF pages. Usage /pack-vehicle <pdf-path> <printed-pages> <destination-json>
argument-hint: <pdf-path> <printed-pages> <destination-json>
disable-model-invocation: true
---

# Vehicles → content pack

Arguments: `$ARGUMENTS` (PDF path, printed page or range, destination JSON).

**First**, read `.claude/skills/pack-core/workflow.md` and `.claude/skills/pack-core/tagging.md`, and follow the workflow step by step. This file only adds what's specific to vehicles.

## Writes

- `vehicle`. Read `schemas/vehicle_schema.json`.

## Reading a vehicle profile

| Printed | JSON |
|---|---|
| Name | `name` |
| Silhouette | `silhouette` |
| Speed | `maxSpeed` |
| Handling (+1 / –2) | `handling` (signed integer) |
| Defense | `defense` |
| Armor | `armor` |
| Hull Trauma Threshold | `htt` |
| System Strain Threshold | `sst` |
| Control skill (printed, or implied by the vehicle class) | `controlSkill`: `{ "name": "Driving", "source": "crb" }`. If not printed, it's a judgment call (Driving for ground, Piloting for air/space, Operating for large ships), so report it. |
| Crew | `complement` (string, as printed: `"1 driver, 1 gunner"`) |
| Passengers | `passengers` (string or integer, as printed) |
| Consumables | `consumables` (string: `"12 hours"`) |
| Encumbrance Capacity | `encumbranceCapacity` (string or integer, as printed) |
| FTL range / speed (space settings) | `ftlRange` (`None`/`Short`/`Medium`/`Long`/`Extreme`), `ftlSpeed` (`none`/`slow`/`average`/`fast`/`very fast`) |
| Price "17,000 (R)" / Rarity | `price: 17000`, `restricted: true`, `rarity` |
| Weapons lines | `weapons`: `[{ "name", "fireArc", "skill": {name, source}, "damage", "critical", "range", "qualities": [{name, ranks, source}], "details" }]` |
| Named special rules | `abilities`: `[{ "name", "description" }]` (description is a single tagged string) |
| Flavor text | `description` (strings) |

- **Weapons always use the table format** (see EotI "Cruiser"): one field per stat. Never write the deprecated `{ "name", "description": "Fire Arc Forward; Damage 3; …" }` form.
  - `skill` is always set. If the book doesn't print one, use `{ "name": "Gunnery", "source": "crb" }` (the CRB default for vehicle weapons) and report it.
  - `range` drops the printed brackets: `[Medium]` → `"Medium"`.
  - Damage or Critical printed "–": omit the field.
  - Anything in the profile that isn't a stat or quality ("the difficulty for this check is always …", a conditional fire arc) goes in `details` as a sentence.
- Weapon `name` is as printed, including counts and mounts ("1 turret-mounted assault cannon").
- `fireArc` is as printed ("All", "Forward, Left, and Right").
- Vehicle weapon quality ranks go in `ranks`.
- **Variants** follow the adversary convention: the base gets `hasVariants: true`; each variant is a full entry `"Base (Variant)"` with `variant: true`.
- Printed stats with no schema field (sensor range, max altitude, hard points, manufacturer…) are a ⚠ schema gap.
  - See how EotI handled similar vehicles, and ask before putting them in `description`.

## Consistency checks (⚠ when they fail)

- A `(R)` price without `restricted`, or `ftlRange`/`ftlSpeed` values outside the enums.
- Weapon qualities that don't exist as quality items.

## Exemplar

- EotI "Rambler".
