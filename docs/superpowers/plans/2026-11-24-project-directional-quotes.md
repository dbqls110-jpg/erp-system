# Project sales and purchase quotations

1. Test filename classification, declared totals, and item extraction with non-production fixtures.
2. Analyze labeled sales and purchase files separately. Keep the existing internal quote fallback. Persist cost details with each quote and its upload recovery record, and block a second automatic sales quote.
3. Render line items under the matching purchase card. Test replay and preservation of prior amounts when parsing fails. Validate the supplied PDF, type-check, and run the project tests before requesting any deployment.
