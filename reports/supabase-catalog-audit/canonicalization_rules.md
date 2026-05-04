# Canonical identity rules

## Principle

Prefer **commercially distinct installs** without **SKU explosion**. Use estimator judgment — not naive “always one SKU = one canonical row” logic alone.

---

## Decision matrix — when to…

### A — Create **distinct** `catalog_items` rows

Different rows when combinations change **priced scope**, **regulated accessibility**, **field installation method**, **counting unit semantics**, or **supporting assemblies** materially:

| Signal | Typical split |
|--------|----------------|
| Different **counting basis** | EA locker vs LF rail vs COMPARTMENT partition |
| **Mount class** materially changes opening labor | recessed vs surface (often modifier **or** row — see §C/D) |
| **Core material/system** shifts shop fab + field hrs | painted metal vs phenolic toilet partitions |
| **Configured series** incompatible subcomponents | disparate partition hardware packs |
| **Different manufacturer SKU** controlling buyout price | Always separate rows unless **`alias_of` strategy** merges marketing duplicates |

---

### B — **Aliases only** (`catalog_item_aliases` / optional `estimator_sku_aliases`)

| Signal | Approach |
|--------|----------|
| Vendor marketing code vs distributor code | Alias with `alias_kind` / `alias_type='vendor_sku'` |
| OCR noise (`B‑6806` vs `B-6806`) | Normalization + trimmed alias rows |
| Cross-brand equivalence **approved by estimator authority** | `estimator_sku_aliases.notes` must cite rationale |
| Competitive “same SKU family” substitutions | Prefer alias + review queue — **dangerous auto** |

Avoid global alias when **sizes differ** estimator-significantly (lengths driving labor & material deltas) unless deltas live in **`catalog_item_attributes`**.

---

### C — **Attributes** on one item

| Dimension | Storage |
|-----------|---------|
| Finish family ( estimator-significant stainless uplift ) | attribute + modifier pairing |
| Mount default | `default_mounting_type` + overrides |
| Dimensional deltas with shared base SKU | `catalog_item_attributes` labor/material deltas |

---

### D — **Bundles**

| Scenario | Representation |
|---------|----------------|
| Quote repeatedly sells kit as one lump | `bundles_v1` + deterministic explosion |
| “Set” of grab bars differing only by length counts | EITHER multi-line bundle components OR dimensional attributes + intake multiples |

Bundles must not **double-price** embedded labor when exploded lines reuse base labor blindly — tune line generation rules if mixed.

---

### E — **Deprecation / mergers without delete**

Winner row stays **`active=1`**; losers: **`active=0`**, **`deprecated=1`**, **`deprecated_reason='merged-to:<id>'`**, populate **`duplicate_group_key`**.

---

## Minimum deterministic keys (authoritative uniqueness target)

Operational rule of thumb:

> **canonical identity key** = normalized manufacturer + canonical SKU (+ optional series token when SKU not manufacturer-assigned generic)

Maintain **ZERO tolerance** collisions on that key among **active canonical** rows (`is_canonical = 1`).
