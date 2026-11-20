# Changelog

## 0.2.0 (November 2026)

- Exposure history pages: places lived, jobs, military service, activities, and smoking, each with ages and coded to ECTO (release 2026-07-28), with a search across ECTO exposure classes. Exported beside the Phenopacket and as OMOP rows.

- Mapping from every selectable HPO term to an OMOP standard concept, built from Athena release v5.0 29-AUG-26, with a note on pull requests for survey terms that have no row or no concept.
- OMOP rows export on the review page, beside the Phenopacket.
- Silent, captioned walk-through video of the review process on the home page, with a transcript.
- `scripts/narrow_example.py` shows how a list of findings narrows the genes in the HPO disease annotations.
- Search on the Anything else page covers every HPO term used in a disease annotation, not only terms with layperson synonyms, and matches simple plurals.
- `content/survey/search-aids.yaml` adds plain labels and search words, first drafted for the ALS Phenotype Funnel; they also give plain wording to more specific choices that had none.
- Download the record as a Phenopacket JSON file from the review page.
- Mondo name lookup on the diagnosis question; the chosen term is recorded as the disease in the Phenopacket.

## 0.1.0 (November 2026)

- First public version of the redesigned survey: specific features in plain language with more specific choices from HPO, timing choices that follow the person's age, and current HPO terms.
- Before and after page comparing the 2018 GenomeConnect Health Survey with the redesign, row by row.
- GenomeConnect Seizure Survey (version 1.3) reworked into follow-up questions shown when Seizures is answered Yes, with its own comparison.
- Annotation page for reviewing every item of both original surveys, with download, reload, and a Colab notebook that combines reviewers' files.
- Content checks on every pull request and publishing to GitHub Pages.
- HPO release pinned at v2026-09-01; disease annotations dated 2026-09-02.
