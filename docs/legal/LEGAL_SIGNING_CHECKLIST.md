# Legal Signing Checklist (15-Minute Pass)

Date: 2026-05-18
Owner: Eric
Purpose: Execute core unilateral legal/IP docs quickly and cleanly.

This is practical guidance, not legal advice.

## Documents to finalize

- docs/NOTICE.md
- docs/COPYRIGHT.md
- docs/THIRD_PARTY_LICENSES.md
- docs/CLAIMS_MATRIX.md
- docs/COUNTERPARTY_GUIDE.md

## Before signing (5 minutes)

- [ ] Confirm your legal contact email and replace TODO placeholders.
- [ ] Confirm effective date is correct in all docs.
- [ ] Confirm owner name is correct everywhere.
- [ ] Confirm no claims exceed measured evidence in:
  - docs/COMPRESSION_VALIDATION_REPORT.json
  - docs/COMPRESSION_STACK_TECHNICAL_ANALYSIS.md
  - docs/COMPRESSION_EXECUTIVE_SUMMARY.md
  - docs/COMPRESSION_RISK_FALSIFIABILITY.md

## Sign now (5 minutes)

- [ ] Sign NOTICE owner acknowledgment (optional but recommended).
- [ ] Sign COPYRIGHT owner signature block.
- [ ] Sign THIRD_PARTY_LICENSES owner sign-off.
- [ ] Sign CLAIMS_MATRIX owner sign-off.

## Save signed artifacts (3 minutes)

- [ ] Export signed copies to PDF.
- [ ] Save executed files to stuff/legal/signed/.
- [ ] Keep editable source in docs/ and stuff/.

## Integrity and audit trail (2 minutes)

- [ ] Record one-line decision note in docs with date: "Core unilateral legal docs signed by owner."
- [ ] Add a commit with message: "chore(legal): sign core unilateral policy docs".
- [ ] Keep hash/checksum list for signed PDFs (optional but recommended).

## Counterparty reminder

For these documents, no external counterparty is required.
You need a counterparty only for bilateral agreements, such as:

- customer agreements
- NDAs
- contractor agreements
- external contributor agreements
- licensing deals with another company

## Optional next step (when ready)

- [ ] Create docs/BILATERAL_AGREEMENTS_CHECKLIST.md for first customer/contractor deals.
