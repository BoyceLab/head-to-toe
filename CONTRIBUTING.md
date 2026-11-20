# Contributing

Suggestions are welcome from families, people living with epilepsy or ALS, clinicians, genetic counselors, informaticians, and anyone else who uses or studies patient-reported phenotypes.

## Two ways to suggest a change

**Without editing files.** Open a suggestion form under **Issues > New issue**:

- **Suggest clearer wording** for a question, item, or help line
- **Suggest a feature to add** to a body-system page
- **Report a term mapping problem** when an item maps to the wrong, too general, or obsolete HPO term
- **Share an original survey for comparison**, such as the GenomeConnect seizure survey

A maintainer turns each suggestion into a pull request and links it back to the form.

**By editing a file.** Open the file under `content/` on GitHub, choose the pencil icon, make the change, and choose **Propose changes**. GitHub creates a branch and a pull request for you. The checks run automatically and report anything that needs fixing in the run summary.

## Survey items

Each item in a body-system file looks like this:

```yaml
- hpo: HP:0000365
  plain: Hearing loss
  description: Optional help line in everyday words.
  more_specific:
    - hpo: HP:0000407
      plain: Hearing loss from the inner ear or hearing nerve
```

| Field | Required | What it does |
|---|---|---|
| `hpo` | yes | The HPO term the answer is stored as. It must be current in the pinned release. |
| `plain` | yes | The wording a respondent sees. Everyday words; the clinical name appears automatically beneath it. |
| `description` | no | One help line. |
| `more_specific` | no | Choices offered after a Yes. Use more specific HPO terms beneath the item's own term. |
| `show_when` | no | Limits who sees the item. One of `childhood` (all ages; adults see "as a child"), `school` (age 5 and older), `teen` (age 12 and older), `adult`, `female`, `male`, `femaleteen`. Sex-based rules show the item whenever sex is not known or is intersex. |
| `from_a_report` | no | `true` for findings that come from a test or a doctor, such as an MRI or EEG result. |
| `opens_followup` | no | `seizures`. A Yes adds the seizure follow-up questions. |
| `asks_frequency` | no | `true` for seizure types. A Yes also asks how often it happens now, from `frequency_options` in the seizure follow-up. |

A term that appears in more than one file shares one answer in the survey. Within one file, each term appears once.

The longer list of more specific choices under each Yes is not written by hand. The build takes it from HPO: the child terms of each item that are used in at least one disease annotation, shown under HPO's layperson synonym where one exists. To give one of those terms better plain wording, add it under `more_specific`.

`content/survey/onset.yaml` sets the choices for when a feature started, and which choices each age band sees.

## Follow-up questions

Questions that are not phenotype findings, such as treatments or seizure counts, sit under `questions` in a step of `content/survey/followups/seizures.yaml`:

```yaml
- key: sz_triggers
  question: Have any of these been noticed to make a seizure more likely? Choose any that fit.
  type: multi            # single, multi, onset (age bands), or text
  options: [Lack of sleep, Flashing lights or patterns, Not sure]
  hpo_by_answer:         # optional: store some answers as HPO terms too
    Flashing lights or patterns: HP:0020216
  show_when: sz_tried:Seizure medicines   # optional; see below
```

`show_when` takes a question key and an answer: `key:answer`, `key:first|second` for any of several answers, or `key:!first|second` for any answer other than those. A multi question can add `per_choice`, a list of follow-up questions asked for each option chosen, where `X` in the question text becomes the option's name.

## Wording placeholders

Questions and help text can use placeholders that change with who is answering:

| Placeholder | Answering about themselves | Parent | Caregiver | After a death |
|---|---|---|---|---|
| `{you}` | you | your child | the person you care for | your family member |
| `{your}` | your | your child's | their | your family member's |
| `{HasHad}` | Have you had | Has your child had | Has the person you care for had | Did your family member have |
| `{have_has}` | have | has | has | had |
| `{were_was}` | were | was | was | was |
| `{is_are}` / `{Is_Are}` | are / Are | is / Is | is / Is | was / Was |

Write instructions to the person filling out the survey as "you" without braces.

## Wording rules

The checks enforce the rules listed under `style_rules` in `config.yaml`. Beyond those, the project follows a few habits:

- Plain words first. Use the clinical term only in the `hpo` field or in a "Doctors may call this" line.
- Describe what a person can notice or what a report says. Avoid statements that something is always or never true.
- Write "data set" and "data are", "rare disease" and "real world" without hyphens, and American spelling.
- Use generic categories rather than real organization names in questions and examples.
- Put Yes and No in quotes in YAML (`'Yes'`), or YAML reads them as true and false.

## The original surveys and the crosswalks

`content/original/health-survey-2018.yaml` is a transcription of the 2018 supplement as printed, including its errors. Do not correct it. Record each original answer's fate in `content/original/crosswalk.yaml`:

```yaml
- original: Fainting
  change: corrected
  redesign: [HP:0001279]
  note: Printed with HP:0001626, the top-level cardiovascular term.
```

The `change` values and what the Before and after page shows for each are listed under `change_types` in the same file. When an item is added that replaces or refines an original answer, update the crosswalk in the same pull request.

The seizure survey works the same way through `seizure-crosswalk.yaml`, keyed by page and question. A redesign target there can be an HPO term, `q:` followed by a seizure follow-up question key, or `page:` followed by `you`, `testing`, `family`, `more`, or `review`. The checks confirm that every original question has a row.

## Review notes and questions

`content/review/open-questions.yaml` holds the notes shown at the start of the annotation page and the open questions reviewers can comment on. A question about one original item goes on that item's crosswalk row as `question_for_reviewers`, and appears under the item in a shaded box. Give each open question an `id` that does not change once reviews begin, since the combining notebook groups comments by it.

## Review

Each pull request needs passing checks and a review from a maintainer. For changes to clinical meaning, such as a new term mapping or a new item, the review asks for a source or a short rationale in the pull request.
