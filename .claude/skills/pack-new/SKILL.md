---
name: pack-new
description: Create a new, empty GenesysRef content pack file (official in api/, homebrew in api/community/) with a valid _meta block. Usage /pack-new <destination-json> [pdf-path printed-pages]
argument-hint: <destination-json> [pdf-path printed-pages]
disable-model-invocation: true
---

# Create a new content pack

Arguments: `$ARGUMENTS`
- A destination JSON path (required).
- Optionally, a PDF and the printed pages holding the title/credits page. Read only those pages.

The `pack-*` import skills also follow this procedure when their destination doesn't exist yet.

## Steps

1. **Destination.**
   - Stop if no destination was given, or if the file already exists. An existing file is updated with the type skills, not recreated.
   - It must be `api/<kebab-name>.json` (official) or `api/community/<kebab-name>.json` (homebrew). For anything else, ask.
2. **Read** `schemas/meta_schema.json` and `schemas/settings_sub_schema.json`.
3. **Collect `_meta.source`:**
   - `json`: the file basename without `.json`. It must be kebab-case and unique across `api/index.json` and `api/community/index.json`.
   - `full`: the full title, cased correctly.
   - `abbreviation`: short and unique among all packs (compare case-insensitively against the index files).
     - Use `:` for title/subtitle (e.g. `EotI:MR`).
     - **No `_`** (reserved for translations).
     - Tags use it lowercased.
   - `version`: today's date as `YYYY.M.D` (unpadded, e.g. `2026.9.18`).
   - `authors`: an array.
   - Optional: `url`, `releaseDate` ("D Month YYYY", e.g. "28 April 2023"), `color` (hex, readable in light and dark themes), `convertedBy` (array), `language` (only if not English), `module` (official modules that shouldn't auto-install the CRB).
   - Take values from the given PDF pages when they're printed there. **Ask** for everything else in one batched question; never invent authors or dates.
4. **Collect the rest of `_meta`:**
   - `defaultItemSettings`: the settings items inherit, e.g. `[{ "name": "fantasy", "source": "crb" }, { "name": "Terrinoth" }]`. Use `[]` for mixed-setting books. Ask.
   - `filters` (optional): new `settings`, `magicSkills`, `optionFeatureType`, `optionFeatureClass`, or `talentPrereqs` this pack introduces. It can start empty and grow with imports.
5. **Write** the file with 3-space indentation, LF line endings, and a trailing newline. Leave item groups out; `merge.js` adds them as items arrive.
   ```json
   {
      "$schema": "https://silentarctic.github.io/schemas/schema.json",
      "_meta": {
         "source": { "version": "…", "json": "…", "full": "…", "abbreviation": "…", "authors": ["…"] },
         "defaultItemSettings": []
      }
   }
   ```
   Use expanded 3-space formatting like the existing packs, not the compact form above.
6. **Validate:** run `node .claude/skills/pack-core/scripts/check.js --dest <file> --all`. It must report SCHEMA OK.
7. **Don't touch** `api/index.json` or `api/community/index.json`. The `build-collection-index` workflow regenerates them on PRs.
8. **Report** the created file and its `_meta`, then suggest the next import command, e.g. `/pack-talent <pdf> <pages> <file>`.
