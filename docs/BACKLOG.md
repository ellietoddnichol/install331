# Product / tech backlog

Track these as separate tickets or PRs.

| Priority | Item |
|----------|------|
| Intake / PDF | Wire external PDF extraction providers using service credentials ([`src/server/services/intake/pdfParser.ts`](../src/server/services/intake/pdfParser.ts) — TODO in source). |
| UX | Takeoff / estimate density and quantity-field behavior — revisit after current workspace changes ship. |
| Display | Tune [`formatClientProposalItemDisplay`](../src/shared/utils/proposalDocument.ts) for non-extinguisher catalog lines if titles still read like raw SKUs. |
| Ops | Verify Cloud Run secrets for Gemini and Google Sheets; keep service keys out of the repo. |
