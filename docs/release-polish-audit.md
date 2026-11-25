# Hesabu release polish audit

## Scope
This pass keeps the current interface and visual identity. It focuses on the writing system, typography consistency, reading rhythm, product metadata and repeated explanations.

## Changes made
- Standardised visible navigation terminology: the sidebar now says **Payments**, matching the page title and mobile navigation.
- Renamed the inventory page heading to **Stock**, matching the primary navigation label used by everyday shop owners.
- Shortened the public hero, demo explanation, feature introduction and workflow descriptions so the value is clear on a quick scan.
- Shortened the demo banner and sale-entry privacy helper without removing the important information.
- Simplified the stock-replenishment explanation and the accounting-report disclaimer.
- Removed the generic footer caveat that repeated the integration limitations already explained in the trust section.
- Updated page title, search description and social-sharing copy to describe the actual product in plain language.
- Standardised headings and key numeric typography on the already-loaded DM Sans family. The older stylesheet referenced Inter in several components even though Inter was not loaded, creating a fallback mismatch.
- Added consistent paragraph measure, line-height and text wrapping for long descriptions, helper text and empty states.

## Writing rules to keep
1. Lead with the task or business outcome, not internal product language.
2. Prefer short sentences and one idea per paragraph.
3. Use **Payments** and **Stock** consistently in navigation and page headings.
4. Explain a limitation where the user makes a decision; do not repeat the same disclaimer in several places.
5. Keep accounting terms where precision matters, then explain them in plain language.
6. Never describe a simulated payment as a real payment or a manual record as an automated integration.
7. Avoid claims of eTIMS certification, automatic M-Pesa reconciliation, automatic WhatsApp delivery or AI bookkeeping until those capabilities are implemented and verified.

## Deliberately unchanged
- The core workspace layout, colours, illustrations and navigation structure.
- Financial terminology inside ledgers where changing it would reduce accounting accuracy.
- The current integration boundaries and security disclosures.

## Release checks
The release still requires a passing test/build, a fresh preview inspection, production target verification and a post-deploy smoke check. This document is an editorial record, not a substitute for those checks.
