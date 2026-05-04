# Required fields & validation thresholds

## Production-usable catalog item (active estimator-facing row)

Evaluate both **presence** (not null/blank) and **semantic validity** — script `supabase-catalog-phase-audit.ts` encodes starter rules; tighten per discipline.

### Minimum required matrix

| Field | Required when | Policy notes |
|-------|---------------|--------------|
| `id` | always | Stable key; NEVER rotate — external refs depend on it. |
| `sku` | active + canonical sellable | Allow generic internal codes only behind `item_type`/governance docs. |
| `category` | active | Normalize to curated list downstream. |
| `manufacturer` | active tangible buyout rows | generics (“VARIOUS”) only as explicit fallback taxonomy. |
| `uom` | active priced row | ENUM alignment with estimate math (EA,LF,SF…). |
| `base_material_cost` | tangible active | Zero allowed for pure labor placeholders **if tagged** (`tags`/`notes`). |
| `base_labor_minutes` | active priced row OR explicit labor strategy | Tie to `install_labor_family`/`labor_basis`. |
| `active` | always | Operational visibility flag. |
| `install_labor_family` | active install rows | Controlled vocabulary; blanks allowed only for non-installed catalog lines (explicit type). |

### Strongly encouraged

| Field | Role |
|-------|------|
| `canonical_sku` | dedupe + synonym anchor |
| `family` | intake family hint |
| `series` | model family narrowing |
| `description` | human + matcher tokens |
| `image_url` | proposal optional |
| Default modifier hooks | Sheets column / attribute-driven (`default_*` conventions if present) |

## Quality thresholds

| Threshold | Blocking? |
|-----------|-----------|
| Duplicate active rows sharing manufacturer key + SKU key | **blocking** duplicate resolution |
| `catalog_item_aliases` normalized text resolves >1 ids | **blocking** ambiguity |
| Active row missing labor + family simultaneously | **operational blocker** unless `labor_basis` documents exception |
| Labor >720 min on handheld accessory SKU | unlikely — **review flag** |
| Labor 1–5 min on partition/compartment SKU | heuristic **review flag** (see suspicious labor CSV) |
| Alias pointing to **`deprecated=1`** loser | blocking after merge |

## Enforcement surfaces

| Stage | Approach |
|-------|----------|
| **Sheets import** | `validateSheetRows` + sync abort policy (fatal vs warnings) |
| **CI nightly** | `npm run catalog:audit` fail on DUPLICATE_SKU severity high |
| **Post-sync** | insert `estimator_catalog_validation_issues` rows (`status=open`) |

## Field naming caveat

Spreadsheet/UI may expose **GenericItemName** — map to **`family`**/`description`/custom column if synced; grep `googleSheetsCatalogSync.ts` mappings when adding validations.
