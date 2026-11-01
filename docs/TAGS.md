# Tag kinds (item, block, entity_type, fluid, game_event)

`src/lib/mc/tag-kinds.ts` is the single source of truth for datapack tag
folders, value syntax and metadata. `parseDatapack` and `lintProject` use it;
the Explorer/creation menu can use the same exports instead of hard-coding
folder names.

## Version folders

| Kind          | 26.3 / 1.21+         | 1.20.4 and older         |
| ------------- | -------------------- | ------------------------ |
| `function`    | `tags/function`      | `tags/functions`         |
| `item`        | `tags/item`          | `tags/items`             |
| `block`       | `tags/block`         | `tags/blocks`            |
| `entity_type` | `tags/entity_type`   | `tags/entity_types`      |
| `fluid`       | `tags/fluid`         | `tags/fluids`            |
| `game_event`  | `tags/game_event`    | `tags/game_events`       |

The folder table lives on every `VersionProfile` as `tagFolders` (and
`tagFolder` remains as the function-tag shorthand). `migrateFiles` migrates all
six folders, not just function tags.

## Exported API

```ts
type TagKind = "function" | "item" | "block" | "entity_type" | "fluid" | "game_event";

TAG_KINDS: readonly TagKind[]
TAG_KIND_META: Record<TagKind, TagKindMeta>
tagKindMeta(kind): TagKindMeta
isTagKind(value): value is TagKind

tagFolderFor(kind, version): string                 // "tags/item" | "tags/items"
tagPathFor(kind, namespace, name, version): string  // "data/ns/tags/item/ores/iron.json"
parseTagPath(path, version): TagPathInfo | null
detectTagKind(path, version): TagKind | null
tagKindForFolderName(folderName): TagKind | null

validateTagValue(kind, value): TagValueInfo
parseTagEntry(kind, entry): TagValueInfo
tagValueError(kind, value): string | null
normalizeResourceLocation(value): string | null
isValidNamespace(namespace): boolean
isValidResourcePath(path): boolean
```

`TagKindMeta` supplies `label`, `pluralLabel`, `singularFolder`,
`pluralFolder`, `description`, `valueKind`, `valueLabel`, `examples` and
`requiresFunctionTarget` (true only for functions).

`TagValueInfo` describes one entry:

- `ok`, `message?`
- `raw` (source id), `id` (normalised `namespace:path`, no leading `#`)
- `namespace`, `path`
- `reference` — the source was `#namespace:tag`
- `required` — defaults to `true`; `{ "id": "…", "required": false }` sets false

`detectTagKind` only returns a kind when the folder matches the target
version, so a legacy `tags/items` file on 26.3 is reported as the wrong folder
rather than silently accepted. Unknown vanilla tag registries (`damage_type`,
`painting_variant`, …) are ignored so they do not produce false errors.

## Parsed shape

`parseDatapack` keeps `tags` as function tags only (runtime/command
compatibility) and adds:

```ts
allTags: ParsedTag[]; // every supported kind, including functions
```

`ParsedTag` has `kind`, `id`, `namespace`, `name`, `path`, `values` and
`entries`. `values` keeps normalized ids with `#` for references. Non-function
tags never require a function to exist and never mark functions as used.

## Diagnostic codes

Parse errors are emitted by `lintProject` with the following codes (previously
every parse error was reported as `invalid-folder`):

| Code                | Meaning                                                            |
| ------------------- | ------------------------------------------------------------------ |
| `invalid-folder`    | Tag/function folder is wrong for the target version (migration).  |
| `invalid-tag-id`    | The tag file's namespace/name is not a valid resource location.   |
| `invalid-tag-json`  | The tag file is not valid JSON, or is not a JSON object.          |
| `missing-tag-values` | The tag object does not have a `values` array.                    |
| `invalid-tag-value` | A value/reference/object entry is invalid.                         |

`invalid-tag-value` errors include `valueIndex` (the index in `values`) on the
`DatapackError`. Function-tag semantics are unchanged: unknown
`unknown-function` / `unknown-function-tag` targets and `tag-cycle` still
apply, except entries with `required: false` do not report unknown targets.
