# 0002. Every extracted value carries a verbatim quote that code verifies against the PDF

- Status: Accepted
- Date: 2026-11-01
- Evidence: commit `75babf6`; thresholds in `src/lib/verify/quote.ts` and `src/server/rules/review.ts`

## Context

A model's confidence score is its own opinion of its own output. Something independent of the model is needed to decide which extracted values a person must look at.

The alternative considered was relying on the model's confidence alone. In the committed eval run that policy leaves 3 of 5 wrong values unflagged (`evals/results/latest.md`).

## Decision

The extraction prompt requires, for every value, a contiguous quote copied from the contract and the page it is on. `verifyQuote` normalizes both the quote and the PDF's extracted text and looks for the quote on the claimed page, adjacent pages, then the whole document. If no exact match exists it searches windows of the page for a normalized Levenshtein similarity of at least 0.90.

The review policy (`annotate`) uses the result:

- quote not found, or a value with no quote: `escalated`;
- fuzzy match below 0.95: `needs_review`;
- exact, or fuzzy at 0.95 or above, with high confidence and no anomaly: `auto_accepted`.

Approval is blocked while any field is escalated or needs review.

## Consequences

- A fabricated quote cannot reach the engine without a person seeing it.
- Every figure in the product can be traced to a clause and a page.
- PDFs with no text layer cannot be compiled. `inspectPdf` and `POST /api/extract/:contractId` reject them rather than escalate every field.
- Verification proves the quote exists, not that it supports the value. In the committed run every quote verified, so this layer caught no additional errors beyond model confidence; the remaining catches came from the statute and anomaly checks.
- Text extraction (`unpdf`) and the model's reading of the PDF can differ in whitespace and hyphenation. The normalization and the fuzzy threshold exist to absorb that.
