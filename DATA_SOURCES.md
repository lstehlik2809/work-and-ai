# Data sources and reproducible preparation

The runtime snapshot uses the BLS **2025–2035** projections and relative AI exposure categories, published **August 27, 2026**, with the **O*NET® 31.0 Database**. All 831 BLS directory line items are present. The exposure workbook also supplies growth and openings, so there is no redundant projections merge. Counts and years are read from the sources and checked, rather than treated as a fixed product requirement.

Source URLs, actual retrieval timestamps, release identifiers, licenses, raw SHA-256 digests, stored digests and sizes are in [data/source-manifest.json](data/source-manifest.json). Three original XLSX files and four losslessly gzipped CSV files are committed under `data/raw`. Only successfully parsed downloads are included. Normal site builds use committed outputs and do not fetch sources.

| Input | Official source | Purpose |
| --- | --- | --- |
| AI exposure categories XLSX | [BLS workbook](https://www.bls.gov/emp/ind-occ-matrix/ai-exposure-categories.xlsx) | Official title, code, relative exposure, growth and annual openings |
| Occupational directory XLSX | [BLS directory](https://www.bls.gov/emp/classifications-crosswalks/nem-occupational-coverage.xlsx) | Explicit `Line item` inclusion and `Summary` exclusion |
| O*NET-SOC/NEM crosswalk XLSX | [BLS crosswalk](https://www.bls.gov/emp/classifications-crosswalks/nem-onet-to-soc-crosswalk.xlsx) | Published O*NET-SOC 2019 to NEM relationships |
| Occupation data CSV | [O*NET occupation data](https://www.onetcenter.org/dl_files/database/db_31_0_csv/occupation_data.csv) | Full official role titles and descriptions |
| Job titles CSV | [O*NET job titles](https://www.onetcenter.org/dl_files/database/db_31_0_csv/job_titles.csv) | Full job titles and nonempty short titles |
| Reported titles CSV | [O*NET reported titles](https://www.onetcenter.org/dl_files/database/db_31_0_csv/sample_of_reported_titles.csv) | Reported job titles |
| Task statements CSV | [O*NET tasks](https://www.onetcenter.org/dl_files/database/db_31_0_csv/task_statements.csv) | Traceable Core task selection |

`public/data/occupations.json` implements `Snapshot` in `src/domain/types.ts`; `public/data/lexicon.json` implements `Lexicon`. The release is `bls-2025-2035_onet-31.0`. `sourceRow` is the one-based physical row in the `AI Exposure Categories` worksheet. `source` and `mappingSource` are original download URLs. Role descriptions are verbatim at O*NET role granularity; each selected task retains its published ID and update date. The lexicon contains all official BLS titles and all available mapped O*NET official, job, short and reported titles, deduplicated only on the complete title–BLS code–O*NET code tuple: 59,752 tuples. Ambiguous titles deliberately retain their relationships.

Exposure retains the source labels `Low`, `Moderate`, `High`, and `Very high`. No numerical exposure scale is produced. `growth` is the original percent change over 2025–2035. `annualOpenings` is an average number of jobs per year: the source value in **thousands of jobs** is multiplied by 1,000, preserving its rounding to the nearest hundred. Openings include replacement needs and growth; they are not net new jobs. Source missing markers become JSON `null`, never zero or a low category. This snapshot has no missing exposure values. Category counts are 213 Low and 206 each Moderate, High, and Very high.

The join uses the explicit BLS crosswalk's O*NET-SOC code and NEM Code columns. It never drops a decimal suffix or joins titles. All 996 published relationships are retained, with one record per BLS result. There are 84 BLS occupations with multiple O*NET roles and no observed one-O*NET-to-multiple-BLS relationships in this release. Isolated tests nevertheless exercise both cardinalities. The crosswalk documents the O*NET-SOC 2019 taxonomy; O*NET 31.0 uses these codes, and every mapped code resolves to an actual source description.

`broader` is a conservative presentation flag, not a join: it is true when multiple O*NET roles map to the canonical BLS occupation, or when the published O*NET and BLS titles differ after case/punctuation normalization. The latter flags differing descriptive scope conservatively; it does not assert that title differences establish a statistical subclass. The exception report records the reason and physical crosswalk row. For example, Chief Sustainability Officers (`11-1011.03`) maps to Chief executives (`11-1011`) on crosswalk row 7. There are 249 flagged relationships.

[data/exceptions.json](data/exceptions.json) records 281 excluded summary codes, all broader mappings, mapping cardinalities, 20 unmapped O*NET occupations (Legislators and 19 military occupations), missing exposure, and roles without Core tasks. Unmapped roles receive no inferred result or statistic. All BLS results have at least one sourced O*NET description. For each role, up to three published **Core** tasks are selected in ascending numeric Task ID order; there is no claim that this deterministic small sample exhausts the role. The 86 mapped roles without Core tasks receive an empty task array. Task selection is an app transformation, not task-level exposure estimation.

The [BLS methodology](https://www.bls.gov/emp/publications/ai-exposure-categories.htm) explains the relative categories and their source dates. The publication date is distinct from the underlying capability and usage evidence. Exposure can include assistance or completion of work, and does not estimate individual job loss, productivity, wage effects or automation probability. Job duties vary, and U.S. projections do not become representative of another country because the interface is in English.

## Commands

Run from the repository root with Node 24 and Python 3.10+ with `openpyxl` (verified using 3.1.5):

```sh
node scripts/data/fetch.mjs
python scripts/data/prepare.py
node scripts/data/validate.mjs
python scripts/data/reconcile.py
node --test tests/data-integrity.test.mjs
```

The first command is a deliberate optional re-acquisition step. It verifies every downloaded file against its pinned raw hash before replacing snapshots, records actual completed-download UTC timestamps, and rejects HTTP errors, unexpected formats or an upstream replacement. Node's native fetch was used because other HTTP clients encountered source access failures. Re-acquisition may change gzip bytes and retrieval times; `prepare.py` updates the corresponding output hashes. An actual new source release requires inspection of workbook headers, definitions, years, missing markers, taxonomy compatibility, all relationships and licenses before updating the pins and parser. Do not weaken a hash failure to accept new data. Then regenerate semantic assets against the new release using the separately documented semantic pipeline and run the complete release checks.

`prepare.py` verifies raw hashes, parses source files, and generates runtime data, the compact release reference, and exceptions. `validate.mjs` is a standalone Node release check: full canonical coverage, summary exclusion, metric/category/period/unit constraints, unique IDs and relationships, alias references and coverage, task provenance, source hashes, output hashes and release metadata. It does not need Python or a network during a normal build.

`reconcile.py` is a separate independent source oracle: it reads original XLSX/CSV inputs without importing the preparation code or using its generated reference. It verifies the entire 831-row population, all 996 relationships, verbatim descriptions and selected tasks, and all 59,752 aliases. [data/reconciliation-report.json](data/reconciliation-report.json) also displays 13 concrete row examples covering all categories and negative, zero and positive growth. Mutation tests reject categories, summaries, duplicate IDs, invented/malformed/nonfinite metrics, incorrect units/periods/rows, missing provenance and mappings, hidden broader labels and incomplete aliases. Separate source-consistent fixtures preserve `null` and measured zero.

## Attribution and changes

This application includes information from the **O*NET® 31.0 Database** by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). O*NET® is a trademark of USDOL/ETA. Work & AI has modified the organization of this information: it maps roles to BLS result units, selects up to three Core tasks per role, deduplicates title tuples, and supplies scope flags and app explanations. Full source descriptions and selected task text remain verbatim; the interface may display excerpts. USDOL/ETA has not approved, endorsed, or tested these modifications. See the [O*NET database license](https://www.onetcenter.org/license_db.html).

BLS data are public U.S. government information. Credit: U.S. Bureau of Labor Statistics. App mappings, flags, excerpts and interpretations should not be represented as agency findings or endorsement. Source files, this transformation description, exception report and preparation script identify the changes.
