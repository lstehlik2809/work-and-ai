# Description matching validation

Local revision, September 10, 2026. This revision has not been deployed.

The supplied people-analytics description now returns **Data Scientists first and Industrial–Organizational Psychologists second**. Actual browser inference confirms the same ordering for the original and two variants. The change corrects how lexical evidence and semantic similarity are combined for longer descriptions; the pinned model, occupation corpus, vectors and published metrics are unchanged.

## Test sets and results

There are 42 authored cases across six files, including mixed-role descriptions, unrelated professions, negative controls and a short-query boundary diagnostic. These are source-grounded examples, not representative ground truth or a general accuracy estimate.

| Set | Cases | Final result | Interpretation |
| --- | ---: | --- | --- |
| [Development](matching-v2-development.json) | 12 | 12/12 specified checks | Includes the user example, variants, pure roles, SEO, an electrician and negative controls |
| [First reserved set](matching-v2-reserved.json) | 4 | 4/4 | Exposed after an earlier failed run; now regression checks |
| [Replacement set](matching-v2-replacement-check.json) | 4 | 4/4 | Exposed after another failed run; now regression checks |
| [Broad occupational audit](matching-v2-occupational-audit.json) | 16 | 10/14 correct first occupation; 12/14 in shortlist; 2/2 abstain | Same top-one count as baseline; no previously correct first match lost |
| [Fresh occupational audit](matching-v2-fresh-occupational-audit.json) | 4 | 3/4 correct first occupation; 4/4 in shortlist | Withheld until final code freeze; baseline 2/4 first and in shortlist; no previously correct first match lost |
| [Boundary diagnostic](matching-v2-boundary.json) | 2 | 0/2 correct first occupation, baseline and final | Known 11/12-informative-term electrician failure; retained without changing expected labels |

The broad audit's raw result is **FAIL**: four first-match errors and a vague-query state mismatch. The fresh audit's raw result is **FAIL** because the veterinarian ranks second. They are diagnostic results, not hidden passing checks. When the intended occupation appears, its supporting O*NET role is correct in all 12 broad-audit and four fresh-audit occurrences. This does not mean every alternative is appropriate.

## Other professions: paired comparison

“Position” is the intended canonical occupation's position in the final shortlist, which contains at most three choices. Displayed titles below use the supporting O*NET role.

| Case | Expected occupation | Previous first suggestion | Final first suggestion | Position |
| --- | --- | --- | --- | --- |
| AUD-01 | Registered nurses | Home Health Aides | Personal Care Aides | Absent |
| AUD-02 | Dental hygienists | Dentists, General | Dentists, General | 2 |
| AUD-03 | Elementary school teachers, except special education | Elementary School Teachers, Except Special Education | Elementary School Teachers, Except Special Education | 1 |
| AUD-04 | Secondary school teachers, except special and career/technical education | Secondary School Teachers, Except Special and Career/Technical Education | Secondary School Teachers, Except Special and Career/Technical Education | 1 |
| AUD-05 | Plumbers, pipefitters, and steamfitters | Plumbers, Pipefitters, and Steamfitters | Plumbers, Pipefitters, and Steamfitters | 1 |
| AUD-06 | Heating, air conditioning, and refrigeration mechanics and installers | Heating, Air Conditioning, and Refrigeration Mechanics and Installers | Heating, Air Conditioning, and Refrigeration Mechanics and Installers | 1 |
| AUD-07 | Civil engineers | Architects, Except Landscape and Naval | Architects, Except Landscape and Naval | 3 |
| AUD-08 | Mechanical engineers | Mechanical Engineers | Mechanical Engineers | 1 |
| AUD-09 | Accountants and auditors | Accountants and Auditors | Accountants and Auditors | 1 |
| AUD-10 | Cooks, restaurant | Cooks, Restaurant | Cooks, Restaurant | 1 |
| AUD-11 | Paralegals and legal assistants | Paralegals and Legal Assistants | Paralegals and Legal Assistants | 1 |
| AUD-12 | Secretaries and administrative assistants, except legal, medical, and executive | Secretaries and Administrative Assistants, Except Legal, Medical, and Executive | Secretaries and Administrative Assistants, Except Legal, Medical, and Executive | 1 |
| AUD-13 | Logisticians | No suggestion | Production, Planning, and Expediting Clerks | Absent |
| AUD-14 | Shipping, receiving, and inventory clerks | Shipping, Receiving, and Inventory Clerks | Shipping, Receiving, and Inventory Clerks | 1 |
| AUD-15 | No occupational suggestion | No suggestion | No suggestion | Abstained |
| AUD-16 | No occupational suggestion | No suggestion | No suggestion | Abstained |

The following four cases were independently prepared before the final freeze and evaluated once against each version. They were not used to tune the final implementation.

| Case | Expected occupation | Previous first suggestion | Final first suggestion | Position |
| --- | --- | --- | --- | --- |
| AF-01 | Veterinarians | No suggestion | Veterinary Assistants and Laboratory Animal Caretakers | 2 |
| AF-02 | Hairdressers, hairstylists, and cosmetologists | Hairdressers, Hairstylists, and Cosmetologists | Hairdressers, Hairstylists, and Cosmetologists | 1 |
| AF-03 | Interpreters and translators | No suggestion | Interpreters and Translators | 1 |
| AF-04 | Automotive service technicians and mechanics | Automotive Service Technicians and Mechanics | Automotive Service Technicians and Mechanics | 1 |

## Remaining limitations

- The nursing example returns Personal Care Aides; the expected Registered Nurses occupation is absent. The logistics analyst example returns clerical occupations; the expected analyst is absent.
- The dental hygienist, civil engineer and veterinarian examples include the expected occupation but place it below a less suitable first suggestion.
- Some secondary suggestions add unconfirmed specializations: Boilermakers for building pipework, Fast Food Cooks for a restaurant cook, and special-education or middle-school teachers for descriptions of other teaching contexts. These options should be treated as uncertain alternatives.
- The vague broad-audit control returns no candidates, but uses the no-match state rather than the expected request-for-details state.
- Both short electrician boundary descriptions still return electronics repair occupations. In both versions, the 12-term wording produces one suggestion while the 11-term wording produces two; neither version includes Electricians. The separately authored, more specific electrician regression passes.

The boundary accuracy expectation was corrected to a diagnostic after the unchanged baseline demonstrated the same underlying failure. Expected Electricians labels and failing results remain recorded. This revision targets the reported long-description failure while preserving successful existing matches; it does not establish reliable inference across occupations.

## Verification and reproducibility

- 90/90 automated tests, TypeScript checking and production build passed.
- Real local CPU inference: 12/12 development and 8/8 exposed regression cases passed on the final engine.
- Actual Chromium/WASM: original description, expanded variant, additional mixed-role variant and Search Marketing Strategists role selection passed, including source attribution and confirmation/comparison behavior.
- All eight search-UX browser checks and all 12 full browser regression checks passed on the final production build, including close/cancellation, loading/no-results feedback, comparison, exports, privacy and worker failures.
- Historical evaluation fixtures/results, source occupations/aliases, semantic metadata/vectors and encoder configuration retain their recorded hashes.
- Final engine SHA-256: `cac4122b95f3b11cdc31e6dacc2052adc2d7d3ba56b12d0624b1a20555f10b9a`. Baseline: `2a113e27268582c320ac95ec6bee3776b93a6bb67496aaad9db3b0d72d6c762a`.

[Portable results](matching-v2-validation-results.json) preserve inputs, expected labels, candidate ordering, supporting roles, source excerpts, failures and run/fixture hashes. Full local numerical ranks are under `verification/local/matching-v2-*.json`. To reproduce a set without modifying historical records:

```sh
npx tsx scripts/evaluate-description-matching.ts data/evaluation/matching-v2-occupational-audit.json verification/local/my-occupational-audit.json
npx tsx scripts/evaluate-description-matching.ts data/evaluation/matching-v2-fresh-occupational-audit.json verification/local/my-fresh-audit.json
```

The evaluator exits nonzero when authored expectations fail; this is expected for the disclosed diagnostic misses. Browser reproduction: run a production preview, set `TEST_URL` to its app root, then run `node scripts/description-matching-browser-check.mjs`.

## Preserved development failures

The initial reserved run passed 3/4; the replacement reserved run also passed 3/4 before their respective fixes. An intermediate semantic-first experiment reduced the broad audit from 10/14 to 6/14 correct first matches. That experiment was rejected; the final implementation restores all four lost correct first matches. These earlier sets are now exposed regressions, not fresh validation. Original reports remain under `verification/local/matching-v2-reserved-first.json`, `matching-v2-replacement-first.json` and `matching-v2-audit-revised.json`; older committed release evaluations remain unchanged.
