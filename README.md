# Head-to-toe health survey, redesigned

> **Prototype for discussion only.** This survey has not been peer reviewed, has not been tested or validated with patients, families, or clinicians, and is not endorsed by ClinGen or GenomeConnect. It is not for clinical use or for collecting research data. Do not enter real personal or health information.

A proposed replacement for the ClinGen GenomeConnect Health Survey, for children and adults, built so that anyone can propose changes through pull requests or suggestion forms.

The original survey stops at general answers, which are of limited help in rare and poorly understood conditions. This one asks for specific features in plain language, such as a broad forehead or inverted nipples, and stores them as specific Human Phenotype Ontology (HPO) terms.

- **The survey:** `index.html` on the published site.
- **Summary of changes:** `changes.html` lists every proposed change on one page, with its rationale and what the rationale rests on: a published source, an analysis of HPO data that `scripts/coverage_example.py` reproduces, or design judgment still to be tested.
- **Before and after:** `compare.html` sets each part of the 2018 Health Survey, and each question of the GenomeConnect Seizure Survey, beside its redesign, with a label on every row saying what changed.
- **Review the original surveys:** `annotate.html` lets a reviewer mark every original item as *Keep all of it*, *Keep some of it*, *Reject it*, or *Not sure*, add comments, answer open questions, and download the review as CSV or JSON.

Every feature can be answered Yes, No, or Not sure. A Yes opens more specific choices, when it started in choices that fit the person's age, and whether it is present now. The review page builds a record shaped like a GA4GH (Global Alliance for Genomics and Health) Phenopacket, with findings answered No recorded as excluded.

**Age.** The age bands on the first page assume the program collects date of birth, or exact age, another way, for example at enrollment. The bands are used here to choose which questions and timing choices to offer, and are not recommended as a study's only record of age.

## How the repository is organized

| Path | What it holds |
|---|---|
| `content/survey/systems/` | One file per body-system page of the head-to-toe screen, in page order |
| `content/survey/followups/` | Follow-up questions shown when Seizures is answered Yes |
| `content/survey/search-aids.yaml` | Plain labels and search words for HPO terms that have no good layperson synonym, used by the search and by the more specific choices |
| `content/survey/family.yaml`, `onset.yaml` | Family history conditions, and the timing choices offered to each age band |
| `content/review/` | The decision choices and reviewer roles for the annotation page, and its notes and open questions |
| `notebooks/combine_reviews.ipynb` | The Colab notebook that combines reviewers' files, with invented sample files in `notebooks/sample_reviews/` |
| `content/mappings/` | The HPO to OMOP mapping, the Mondo term list for the diagnosis lookup, reviewer overrides, and the vocabulary releases they came from |
| `content/notes/proposed-changes.yaml` | The Summary of changes page: each change, its rationale, and its sources |
| `content/notes/design-notes.yaml` | The text of the Design notes page: changes, corrections, open questions, sources |
| `content/original/` | The 2018 Health Survey as transcribed from the published supplement, the Seizure Survey (version 1.3), and a crosswalk for each that maps every original answer or question to the redesign |
| `site/` | Page templates, styles, and scripts |
| `scripts/` | Download of the HPO release, checks, and the build |
| `config.yaml` | The pinned HPO release, the repository address, and the wording rules |

Survey content lives in YAML files that can be edited in the GitHub web editor. The page code reads them through the build, so a wording change never touches HTML or JavaScript.

## How a change reaches the site

1. Someone opens a suggestion form, or edits a file under `content/` and opens a pull request. [CONTRIBUTING.md](CONTRIBUTING.md) explains both.
2. The **Check content** workflow runs on the pull request. It downloads the pinned HPO release and reports, in the run summary:
   - any HPO term that is missing or obsolete, with its replacement when HPO names one
   - any break in the wording rules in `config.yaml`, such as an em dash or "dataset"
   - any original survey answer left without a row in the crosswalk
   - any Yes or No left without quotes, which YAML reads as true or false
3. The same run builds the site and attaches it as a downloadable preview named `site-preview`.
4. After review and merge into `main`, the **Publish site** workflow rebuilds the site and publishes it to GitHub Pages.

## First-time setup

These steps create the repository and turn on publishing. Replace the owner and name if you choose different ones, and update `repo_url` in `config.yaml` to match.

```bash
unzip head-to-toe-survey.zip
cd head-to-toe-survey
git init -b main
git add .
git commit -m "Initial import of the head-to-toe survey redesign"
gh repo create BoyceLab/head-to-toe --public --source . --push
```

Then, in the repository on GitHub:

- **Settings > Pages > Build and deployment > Source:** choose **GitHub Actions**. The first push to `main` publishes the site.
- **Settings > Branches:** add a rule for `main` that requires the **Check content** status to pass before merging, so nothing reaches the site without the checks.
- **Issues > Labels:** add `wording`, `new-item`, `mapping`, and `original-survey` so the suggestion forms label what they create.

## Running a review of the original surveys

1. Send reviewers the address of `annotate.html` on the published site. Each reviewer works in their own browser; answers are kept on their device until they download them. Nothing is sent to a server.
2. Each reviewer downloads a CSV or JSON file from the last stage of the page and sends it to the review lead. A reviewer can load the file back into the page later to keep going. Reviewers who prefer a spreadsheet can fill in `review-template.csv`, linked from the same stage, using the decision codes `keep_all`, `keep_some`, `reject`, and `unsure`.
3. The review lead opens the notebook in Colab, chooses **Runtime > Run all**, and uploads every file when asked: [open combine_reviews.ipynb in Colab](https://colab.research.google.com/github/BoyceLab/head-to-toe/blob/main/notebooks/combine_reviews.ipynb). The link works once the repository is public; for a private repository, upload the notebook to Colab directly.
4. The notebook reports, for every item, how reviewers split, whether they reached consensus at the threshold set in its first cell, pairwise agreement, and every comment. It lists items that need discussion, summarizes each section, gathers comments on the open questions, and writes an Excel workbook and CSV files in an identified version and a version with reviewer names replaced by codes.

Item ids such as `HS.eyes.coloboma` stay the same from one build to the next, so files from different reviewers line up. To change the decision choices, edit `content/review/decisions.yaml` before reviews begin, and keep the codes the same once they have. If the notebook source changes, edit `scripts/make_notebook.py` and run `python scripts/make_notebook.py` to rewrite the notebook.

## Building locally

Requires Python 3.10 or newer.

```bash
pip install -r requirements.txt
make check   # download the pinned HPO release and run the checks
make serve   # build into _site/ and serve it at http://localhost:8000
```

The pages read `drill.json` and `search.json` from beside them, so open them through a local server rather than by double-clicking the file.

## What the build computes

- **Term labels** for every HPO identifier in the content, from the pinned release, so labels stay current when the release changes.
- **More specific choices** for every survey term: its HPO child terms that are used in at least one disease annotation, most used first, under HPO's layperson synonym where one exists.
- **A search index** of HPO terms that have layperson synonyms, for the plain-language search near the end of the survey.

## Moving to a newer HPO release

Change `hpo_release` in `config.yaml` to the new tag (for example `v2026-12-01`), run `make check`, and fix what it reports. Retired terms report their replacement where HPO names one. Record the move in [CHANGELOG.md](CHANGELOG.md).

## Links to OMOP and Mondo

Each HPO term a person can choose has a row in `content/mappings/hpo-omop.csv` naming an OMOP standard concept. The review page uses it to export answers as rows for the OMOP Common Data Model, with the HPO term as the source code. The diagnosis question offers matching names from `content/mappings/mondo-terms.csv`.

The `match` column says how each concept was chosen:

| match | Meaning |
|---|---|
| `athena_map` | Athena has its own "Maps to" link from the HPO term. |
| `name_match` | No Athena link; the HPO label or an exact synonym equals a standard SNOMED concept name. Proposed by the script and needs review. |
| `broader` | Nothing for the term itself, so the nearest HPO parent with a match is used. `via_hpo_id` and `steps_up` show which parent. |
| `reviewed` | A person chose the concept in `content/mappings/overrides.yaml`. |
| `none` | No standard concept found. The export lists the term with target concept 0. |

`names_agree` is `no` when Athena's target has a different name from the HPO term. Those rows are the place to look for a change in meaning, for example a finding mapped to a diagnosis.

To rebuild the mapping after changing survey terms, the HPO release, or the Athena release:

1. Download the vocabularies from [Athena](https://athena.ohdsi.org) (HPO, Mondo, SNOMED, OMOP Extension) to a folder outside this repository.
2. Copy `scripts/extract_athena.py` into that folder and run it there. It writes a small subfolder, `h2t_extract`.
3. Run `python scripts/build_omop_mapping.py "path/to/h2t_extract"` from the repository.
4. Review the changes to `content/mappings/` and upload them.

Athena files and the extract stay out of the repository. The mapping file includes SNOMED concept names and codes for the mapped terms; confirm that your SNOMED license terms allow publishing them before the repository is public, or remove the `omop_concept_name` and `omop_concept_code` columns.

Mondo terms in Athena have no links to standard concepts in the release used here, so a chosen diagnosis is exported with its Mondo code and target concept 0. The export sets `type_concept_id` to 32865, which we understand to be OMOP's "Patient self-report" type concept; check it against your own vocabulary before loading.

## The seizure survey

`content/original/seizure-survey-v1.3.yaml` transcribes the GenomeConnect Seizure Survey, version 1.3, and `seizure-crosswalk.yaml` maps each of its questions to the seizure follow-up. The Before and after page shows the comparison when both files are present, and the build works without them.

Before making this repository public, confirm that GenomeConnect permits publishing the transcription. If it does not, delete those two files; the survey and the Health Survey comparison are unaffected.

To add another instrument as a comparison, use the **Share an original survey for comparison** form first so permission to transcribe it can be checked.

## Credits and licenses

- The original survey is the GenomeConnect Health Survey, published as supplementary information to Savatt JM, et al. ClinGen's GenomeConnect Registry Enables Patient-Centered Data Sharing. *Human Mutation*. 2018. [PMC6188701](https://pmc.ncbi.nlm.nih.gov/articles/PMC6188701/). The transcription in `content/original/health-survey-2018.yaml` is included for comparison and commentary, credited to its authors, and is not covered by this repository's licenses.
- This project uses the Human Phenotype Ontology, release pinned in `config.yaml`. See the [HPO license](https://hpo.jax.org/license) and cite: Gargano MA, et al. The Human Phenotype Ontology in 2024: phenotypes around the world. *Nucleic Acids Research*. 2024;52(D1):D1333-D1346. HPO files are downloaded at build time and are not stored in this repository.
- The files in `content/mappings/` are derived from the OHDSI Athena vocabularies and hold concept names from SNOMED CT and Mondo. They are not covered by this repository's licenses; the terms of those vocabularies apply.
- Code (`site/`, `scripts/`, workflows) is under the MIT License in [LICENSE](LICENSE). Survey content and notes written for this project (`content/`, except `content/original/health-survey-2018.yaml`) are under Creative Commons Attribution 4.0, described in [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
