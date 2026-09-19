# Tagging guide

PDFs never show tags. You decide what becomes a `{@…}` tag, and that decision is most of the work. Wrong or missing tags
mean broken links, missing popovers, or plain text where dice and symbols should render.

- Source of truth for rendering: `genesysref/src/utils/replaceTags/` (`index.ts`, `replacerConstants.ts`, `replacers/`).
- User-facing guide: `genesysref/src/data/guides/tags.json`.

## 1. How tags render (why the syntax rules exist)

- **Processing order.** `replaceTags` runs regexes in this order: dice → symbols → combat/general/social → image → difficulty → link → genesysref → filter → **reference tags** → title → code → b → i → s → u → escape.
- **Reference tags** are `{@type name|display|source}`.
  - The name, display, and source can't contain `|`, `{`, `}`, `<` or `>`.
  - A reference tag cannot contain another tag.
- **Style tags** (`b`, `i`, `s`, `u`, `title`, `code`) may wrap anything processed *before* them:
  - ✓ `{@i Your character must be a {@archetype Gashlai} or have allegiance to the {@rule Yin Brotherhood} to benefit from this talent.}`
  - ✓ `{@i … {@b …} …}`: b is processed before i.
  - ✗ `{@b … {@i …} …}` breaks, and so does nesting a style tag inside itself.
- **Lookup rules** (popovers and links): `type + lowercase name + lowercase source`.
  - An unsourced reference tries the **current pack first, then CRB**.
- **Escape:** `{/@b x}` renders literally as `{@b x}`. It's only for documentation.

## 2. Tag reference

| Tag | Syntax | Example → renders |
|---|---|---|
| bold / italic / strike / underline | `{@b text}` `{@i text}` `{@s text}` `{@u text}` | `{@b Use With:}` |
| title | `{@title text}` | `{@title Genesys}`, `{@title Twilight Imperium: Embers of the Imperium}`. Use it for game and book titles. |
| code | `{@code text}` | Rare; docs only. |
| dice | `{@dice name\|count\|upgrades}` | `{@dice boost}`, `{@dice setback\|2}`, `{@dice ability\|3\|1}` (1 of the 3 upgraded to proficiency) |
| symbols | `{@symbols letters}` | `{@symbols aa}`, `{@symbols saa}`, `{@symbols aa or t}`. `a` advantage, `s` success, `t` triumph, `h` threat, `f` failure, `d` despair |
| difficulty | `{@difficulty level\|skill\|upgrades\|source}` | `{@difficulty average\|melee}`, `{@difficulty hard\|\|1}`, `{@difficulty easy\|verse\|\|rot}` |
| power level | `{@combat n}` `{@social n}` `{@general n}` | `{@combat 3}` |
| reference | `{@type name\|display\|source}` | `{@skill Stealth}`, `{@quality Breach\|Breach 2}`, `{@talent Finesse\|\|rot}` |
| external link | `{@link url\|display}` | Only for URLs printed in the source. |
| internal link / filter | `{@genesysref …}` `{@filter …}` | Don't generate these unless asked. |

- **Dice** names are always the full lowercase names: `boost`, `setback`, `ability`, `difficulty`, `proficiency`, `challenge`.
- **Symbols:** `{@symbols aa} or {@symbols t}` and `{@symbols aa or t}` are both used. Match the destination's existing style.
- **Reference types:** `adversary`, `adversaryAbility`, `archetype`, `archetypeAbility`, `book`, `career`, `characteristic`, `gear`, `optionFeature`, `quality`, `rule`, `setting`, `sidebar`, `skill`, `specialization`, `spell`, `table`, `talent`, `vehicle`.
- **Never** generate `{@trait}`. It's legacy and has no item group; use `{@optionFeature …}`.

## 3. Reference rules

1. **Name.** Use the exact `name` of the target item (matching is case-insensitive).
   - The name slot is also what displays. Keep the source's casing when only the case differs: `{@rule vacuum}` shows "vacuum".
   - When the printed words differ (plural, rank, possessive, shortened, reworded), put the printed words in **display**:
     - `{@quality Breach|Breach 2}`
     - `{@rule concealment (darkness, smoke, and intervening terrain)|darkness}`
     - `{@gear torches (3)|3 torches}`
     - `{@gear dignitary's garb|Ambassadorial clothing}`
2. **Source.**
   - **Omit it** when the target is in the destination pack or in CRB (the fallback covers it).
   - Add `||abbr` (lowercase) for any **other** pack: `{@skill Verse||rot}`, `{@talent Finesse||rot}`. Abbreviations come from `api/index.json` and `api/community/index.json`.
   - Add `||crb` only when the destination has a same-named item that would shadow the CRB one you mean. `check.js` hints at these cases.
   - Older data is full of `||crb` from before the fallback existed. Don't add new ones, and don't strip old ones.
3. **Tables.** Leave out the `Table ` prefix, because the app adds it back.
   - The item `Table 2-1: Cultural Manufacturing Differences` is tagged `{@table 2-1: Cultural Manufacturing Differences}` and renders as "Table 2-1: Cultural Manufacturing Differences".
   - A short in-text reference: `see {@table 2-1: Cultural Manufacturing Differences|Table 2-1}`.
   - (A `_ref` embed is different: it uses the item's full name, *with* "Table ".)
4. **Ranks** go in the display. The name stays the base item:
   - `{@quality Pierce|Pierce 2}`
   - `{@talent Adversary|Adversary 2}`
5. **The target must exist.** `check.js` REFS verifies this.
   - If nothing by that name exists in any pack, leave the text untagged and report it (see workflow step 6).
   - Staged items count as existing, so new items can reference each other.
6. **Pick the right type** when a name exists in several groups. Go by meaning.
   - In EotI, "Winnu" is both a species (`archetype`) and a faction (`rule`):
     - "must be a Winnu" → archetype
     - "allegiance to the Winnu" → rule
   - A skill vs a talent vs a quality with the same word: use the one the sentence talks about.

## 4. Converting printed symbols

`pdf-runs.js` decodes the Genesys symbol font for you. `pdftotext` shows the same glyphs only as private-use characters.

| Glyph code | Symbol | Tag |
|---|---|---|
| U+F22B0 | failure | `f` |
| U+F22B1 | threat | `h` |
| U+F22B2 | despair | `d` |
| U+F22B3 | success | `s` |
| U+F22B4 | advantage | `a` |
| U+F22B5 | triumph | `t` |

- **Dice:** one glyph per shape; the fill color decides which die:
  - U+F22B7 diamond: purple = difficulty, green = ability
  - U+F22B8 square: light blue = boost, black = setback
  - U+F22BB hexagon: red = challenge, yellow = proficiency
- **Colored dice are also drawn with a dark outline glyph** at the same spot. `pdf-runs.js` drops these duplicates. Never count them as extra dice, or as setback dice.
- **Where the table was confirmed:** visually in Embers of the Imperium. Other books may use different codes, so check the first symbols of a new book against its page image. Anything unknown prints as `[[glyph …]]`.
- **What the printed icons look like:**

| Printed | Looks like | Tag |
|---|---|---|
| boost die | light-blue square | `{@dice boost}` |
| setback die | black square | `{@dice setback}` |
| ability die | green diamond | `{@dice ability}` |
| difficulty die | purple diamond | `{@dice difficulty}` |
| proficiency die | yellow hexagon | `{@dice proficiency}` |
| challenge die | red hexagon | `{@dice challenge}` |
| success / advantage / triumph / failure / threat / despair | result symbols | `{@symbols s}` / `a` / `t` / `f` / `h` / `d` |

- Several identical dice use a count: `{@dice setback|2}`.
- A run of mixed symbols goes in one tag: `{@symbols saa}`.
- If a glyph is ambiguous on the page, **ask**. Never guess.

## 5. Difficulty phrases

The difficulty tag renders **"Average (◆◆) Skill check"**, including the bold and the word *check*. So the tag replaces the entire printed phrase:

| Printed | Tagged |
|---|---|
| make an Average (◆◆) Melee check | `make an {@difficulty average\|melee}` |
| an Average (◆◆) check | `an {@difficulty average} check` (no skill → no "check" rendered) |
| a Hard (◆◆◆) Discipline or Cool check | `a {@difficulty hard\|Discipline or Cool}` (multi-skill; renders unlinked) |
| a Hard check with one die upgraded | `a {@difficulty hard\|\|1} check` |
| `pdf-runs.js`: `a {@b Hard (}{@dice challenge}{@dice difficulty\|2}{@b ) Stealth check}` | `a {@difficulty hard\|stealth\|1}` (each red hexagon is one upgrade) |
| an Easy (◆) Verse check (skill from RoT, destination isn't RoT) | `an {@difficulty easy\|verse\|\|rot}` |
| an Average (◆◆) fear check | `an {@difficulty average} {@rule fear} check`. Fear isn't a skill, so never put it in the skill slot. |
| an opposed Deception versus Discipline check | `an opposed {@skill Deception} versus {@skill Discipline} check` |

## 6. What to tag (every occurrence in prose, not just the first)

- **Skills**, by exact name: `{@skill Knowledge (Lore)}`, `{@skill Ranged (Light)}`, `{@skill Astrocartography}`.
  - Tag when the text means the skill ("a Stealth check", "ranks in Leadership", "gains Perception as a career skill").
- **Characteristics**: `{@characteristic Brawn}` in rules text ("twice their Brawn").
- **Item qualities** when the text means the quality ("gains the Blast quality", "Pierce 2"): `{@quality Blast}`.
- **Talents** named in other items' text: `{@talent Hard Headed}`.
- **Gear** that's a specific catalog item ("a sealed environmental suit (see page 117)"): `{@gear sealed environmental suit}`.
  - Also named gear in starting-gear lists and adversary equipment.
- **Rules.** Tag when a rule item exists (check.js resolves it):
  - status effects: staggered, disoriented, immobilized
  - environments: vacuum, fire, falling
  - named maneuvers and actions: Aim, Assist, Concentrate, Guarded Stance…
  - `{@rule determine Initiative}`
  - setting entities stored as rules: factions, locations, organizations
- **Tables** named in text ("see Table 2-1").
- **Archetypes/species**, **adversaries**, **spells** ("the Attack spell"), **option/features** (craftsmanship, materials, traits, ice, heroic abilities), **sidebars** ("see the Flying sidebar"), and **settings**, when the text refers to them as game entities.
- **Shortened names** after the full one: "the Naalu Collective … the Collective's purpose" → `{@rule Naalu Collective|Collective's}`; "the Titans" → `{@rule Titans of Ul|Titans}`. `check.js` hints only find full names, so look for these yourself:
  ```bash
  node -e "const d=require('./api/<pack>.json'); for (const g of ['rule','archetype']) for (const i of d[g]||[]) if (/<word>/i.test(i.name)) console.log(g, '→', i.name)"
  ```
- **Every die, symbol, and difficulty.**
- **Formatting:**
  - Bold runs → `{@b}`.
  - Italic runs → `{@i}`, e.g. prerequisite sentences and emphasized words.
  - Game and book titles → `{@title}`.

## 7. What not to tag

- **Self-references:** the item's own name inside its own text ("per rank of Apothecary" in Apothecary).
- **Structured fields.** Names, stats, `source`, and similar fields are data, not prose.
- **Generic phrases** with no single target:
  - "knowledge skill check", "social skill", "combat check", "magic skill"
  - "melee combat", "ranged attacks"
  - "maneuver", "action", "Story Point", "strain", "wounds", "soak", "defense", "XP", "encounter", "session"
- **Page references** ("see page 89", "page 89 of the Core Rulebook") stay plain text.
- **Ordinary English** that only happens to match a name:
  - "remain cool", "a charm bracelet", "stun damage" (a damage kind), "discipline" (as a trait), "a rope" when no rope is meant as the catalog item.
  - `check.js` marks likely cases, but you decide.

## 8. Structure inside descriptions

Use structure only where the field's schema is varyingDisplay. Plain string arrays can't hold objects.

| Printed | Structure |
|---|---|
| Sub-heading and its paragraphs | `{ "title": "Heading", "entries": [ … ] }` |
| Bulleted list | `{ "type": "list", "items": [ … ] }` |
| Label/value lines ("Use With:", "Modifiers:") | `{ "type": "list-no-bullet", "items": ["{@b Use With:} …", "{@b Modifiers:} …"] }` |
| Worked example | `{ "type": "example", "title": "…", "entries": [ … ] }` |
| Boxed sidebar | `{ "type": "sidebar", "title": "…", "entries": [ … ] }` |
| Read-aloud text | `{ "type": "read-aloud", "entries": [ … ] }` |
| Embedded existing sidebar | `{ "type": "sidebar", "_ref": { "name": "Flying" }, "entries": [] }` |
| Embedded existing table | `{ "type": "table", "_ref": { "name": "Table I.6-9: Falling Damage" }, "columns": [], "rows": [] }` |
| Inline table | A table object (see `/pack-table` for column/row conventions). |

## 9. Judgment calls

- When a mention could reasonably go either way, choose by meaning. List the choice under "ℹ Judgment calls" in the report.
- If the same uncertainty repeats across many items (e.g. "is 'fear' always the rule?"), ask once and apply the answer consistently.
