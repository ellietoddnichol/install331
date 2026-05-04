# Division 10 enrichment plan (thin → strong)

Prefer **thin, high-confidence** catalogs with excellent aliases + labor families vs wide junk.

## Coverage targets by category archetype

| Archetype | Need |
|-----------|------|
| **Partitions / screens / headrail** | Multi-material lines (SS, baked enamel, phenolic HDPE/LDPE hints), compartment counting UOM correctness, shorthand aliases |
| **Toilet accessories (Bobrick / Bradley / ASI)** | SKU ladders (B-xxxx), competitive alias mapping discipline, ADA labor modifiers |
| **Wall protection / crash rails** | LF vs EA discipline, splice labor nuance → modifiers |
| **Lockers / Salsbury** | Tier combos + numbering; avoid duplicate near-model rows |
| **Mailboxes / Florence / postal** | Bank math + ADA reach rows |
| **Visual display surfaces** | Mount + size variants as attributes/modifiers |

## Brands to seed intentionally

| Brand | Focus |
|-------|-------|
| **Bobrick** | Core washroom accessories baseline |
| **Bradley** | Competitive crosswalks sparingly via aliases |
| **ASI / ASI Global** | Dispenser + accessory coverage |
| **Scranton / Hadrian (if used)** | Partition shorthand sets |
| **Salsbury** | Locker numbering + clustered configurations |
| **Florence** | Mailbox modules |
| **Koala Kare** | Child care ancillary lines if scope includes |

## Artifact additions per gap

| Gap | Artefact |
|-----|----------|
| Missing synonyms | targeted `catalog_item_aliases` (+ optional `estimator_sku_aliases` when global unique) |
| Missing labor granularity | **`install_labor_family`** taxonomy rows + backlog fill |
| Missing default behaviors | **`modifiers_v1`** / `catalog_item_attributes` labor/material deltas |
| Missing assemblies | curated **`bundles_v1`** with reviewed explosion semantics |

## Non-goals

- Import full manufacturer catalogs without labor assignment owners.  
- Auto-generating hundreds of SKU rows from scraped PDF schedules without QA.
