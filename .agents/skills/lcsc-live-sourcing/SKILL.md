---
name: lcsc-live-sourcing
description: Live LCSC and JLCPCB component search, real-time stock/pricing enrichment, datasheet PDF resolution, and assembly BOM verification using the zero-auth jlcsearch API and LCSC direct product detail endpoint.
sources:
  - https://github.com/tscircuit/jlcsearch
  - https://docs.tscircuit.com/web-apis/jlcsearch-api
  - https://github.com/hashgraph-online/awesome-codex-plugins/blob/main/plugins/aklofas/kicad-happy/skills/lcsc/SKILL.md
  - https://github.com/hashgraph-online/awesome-codex-plugins/blob/main/plugins/aklofas/kicad-happy/skills/jlcpcb/SKILL.md
  - https://github.com/hashgraph-online/awesome-codex-plugins/blob/main/plugins/aklofas/kicad-happy/skills/bom/SKILL.md
---

# LCSC & JLCPCB Live Sourcing Skill

## 1. Zero-Auth Live API Architecture
Never require an LLM API key just to search LCSC parts, check stock, or fetch pricing! Always proxy live requests through the backend (`server.ts`) to avoid browser CORS, apply rate-limit spacing (`>= 300–500 ms` between upstream calls), and cache responses cleanly.

### A. Keyword & Parametric Discovery (`jlcsearch.tscircuit.com`)
- **General Search**: `GET https://jlcsearch.tscircuit.com/api/search?q=<query>&limit=25`
  - Returns `{"components": [{ lcsc, mfr, package, is_basic, is_preferred, description, stock, price }]}`.
  - Note (2026-09+ format): `full=true` no longer returns an `extra` block; `lcsc` is numeric (prepend `"C"` for `Cxxxxx`).
- **Category Parametric Endpoints** (`{"<category>": [...]}` with `price1`, `in_stock`, `package`, `is_basic`, `is_preferred`, and JSON-stringified `attributes`):
  - `/mosfets/list.json` (or `/transistors/list.json`)
  - `/capacitors/list.json`
  - `/resistors/list.json`
  - `/inductors/list.json`
  - `/diodes/list.json`
  - `/voltage_regulators/list.json`
  - `/microcontrollers/list.json`

### B. Direct LCSC Product Enrichment (`wmsc.lcsc.com`)
For exact `Cxxxxx` lookup, manufacturer name, full price-break ladder, datasheet PDF, and parametric attributes:
- `GET https://wmsc.lcsc.com/ftps/wm/product/detail?productCode=C2904521`
- Key `result` fields:
  - `productCode` (`C2904521`), `productModel` (MPN), `brandNameEn` (Manufacturer), `encapStandard` (Package)
  - `pdfUrl` (Direct datasheet PDF URL on `wmsc.lcsc.com` — no bot block)
  - `stockNumber` (Live stock), `productPriceList[]` (`ladder` min qty, `usdPrice`)
  - `paramVOList[]` (`paramNameEn`, `paramValueEn` — parse `Vds`, `Id`, `Rds(on)`, `Qg`, `Coss`, `Vsd`, `RthJC`)

## 2. JLCPCB Assembly Rules & BOM Validation
- **Basic Part**: `is_basic === true` -> pre-loaded on pick-and-place, **$0 feeder fee**.
- **Preferred Extended**: `is_preferred === true` -> discounted/preferred extended tier.
- **Extended Part**: `$3.00` unique feeder setup fee per BOM line item (economic vs standard assembly rules).
- **Mandatory JLCPCB BOM CSV Headers**: `Comment`, `Designator`, `Footprint`, `LCSC Part #` (exact header spelling).

## 3. Hybrid AI Datasheet Enrichment (Optional Enhancement)
Only invoke an LLM when a selected LCSC MOSFET/diode lacks dynamic switching parameters (`Coss_er_pF`, `Coss_tr_pF`, `Qrr_nC`, `Qgd_nC`, `Rg_int_Ohm`, `tr_ns`, `tf_ns`) in `paramVOList`, passing the retrieved `pdfUrl`/attributes so no part numbers or stock counts are ever hallucinated.
