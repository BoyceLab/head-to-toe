"""Pull the small part of the Athena vocabulary files needed to map survey HPO terms to OMOP.

Run this from the folder that holds the Athena files (CONCEPT.csv and the rest):

    python extract_athena.py

It only reads the Athena files. It writes a new subfolder, h2t_extract, with a few small files:
  hpo_concepts.csv, mondo_concepts.csv   every HPO and Mondo concept
  relationships.csv                      every relationship that starts from an HPO or Mondo concept
  target_concepts.csv                    the concepts those relationships point to, plus standard SNOMED
                                         and OMOP Extension concepts in the Condition, Observation and
                                         Measurement domains (for name matching)
  synonyms.csv                           English synonyms for the concepts above
  vocabulary.csv                         a copy of VOCABULARY.csv, which records the release

Uses only the Python standard library. Expect it to take several minutes; the files are large.
"""
import csv
import os
import shutil
import sys
import time

csv.field_size_limit(10**9)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "h2t_extract")
SOURCE_VOCABS = {"HPO", "Mondo"}
NAME_MATCH_VOCABS = {"SNOMED", "OMOP Extension"}
NAME_MATCH_DOMAINS = {"Condition", "Observation", "Measurement"}
ENGLISH = "4180186"


def rows(name):
    path = os.path.join(HERE, name)
    if not os.path.exists(path):
        sys.exit(f"Cannot find {name} in {HERE}. Put this script in the folder with the Athena files.")
    with open(path, encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh, delimiter="\t", quoting=csv.QUOTE_NONE)
        header = next(reader)
        yield header
        for i, row in enumerate(reader, 1):
            if i % 5_000_000 == 0:
                print(f"    {name}: {i:,} rows read", flush=True)
            yield row


def writer(name, header):
    fh = open(os.path.join(OUT, name), "w", encoding="utf-8", newline="")
    w = csv.writer(fh, delimiter="\t", quoting=csv.QUOTE_NONE, escapechar="\\", lineterminator="\n")
    w.writerow(header)
    return fh, w


def main():
    start = time.time()
    os.makedirs(OUT, exist_ok=True)

    print("Step 1 of 4: reading CONCEPT.csv")
    it = rows("CONCEPT.csv")
    header = next(it)
    c = {name: i for i, name in enumerate(header)}
    f_hpo, w_hpo = writer("hpo_concepts.csv", header)
    f_mondo, w_mondo = writer("mondo_concepts.csv", header)
    f_tgt, w_tgt = writer("target_concepts.csv", header)
    source_ids, written = set(), set()
    counts = {"HPO": 0, "Mondo": 0, "name-match": 0}
    for row in it:
        vocab = row[c["vocabulary_id"]]
        if vocab in SOURCE_VOCABS:
            (w_hpo if vocab == "HPO" else w_mondo).writerow(row)
            source_ids.add(row[c["concept_id"]])
            counts[vocab] += 1
        elif (vocab in NAME_MATCH_VOCABS and row[c["standard_concept"]] == "S"
              and row[c["domain_id"]] in NAME_MATCH_DOMAINS and not row[c["invalid_reason"]]):
            w_tgt.writerow(row)
            written.add(row[c["concept_id"]])
            counts["name-match"] += 1
    f_hpo.close()
    f_mondo.close()
    print(f"    HPO concepts: {counts['HPO']:,}; Mondo concepts: {counts['Mondo']:,}; "
          f"standard concepts kept for name matching: {counts['name-match']:,}")
    if not counts["HPO"]:
        sys.exit("No HPO concepts were found. Check that HPO was selected in the Athena download.")

    print("Step 2 of 4: reading CONCEPT_RELATIONSHIP.csv")
    it = rows("CONCEPT_RELATIONSHIP.csv")
    header_r = next(it)
    r = {name: i for i, name in enumerate(header_r)}
    f_rel, w_rel = writer("relationships.csv", header_r)
    targets, n_rel = set(), 0
    for row in it:
        if row[r["concept_id_1"]] in source_ids:
            w_rel.writerow(row)
            targets.add(row[r["concept_id_2"]])
            n_rel += 1
    f_rel.close()
    print(f"    relationships kept: {n_rel:,}")

    print("Step 3 of 4: reading CONCEPT.csv again for the concepts those relationships point to")
    need = targets - source_ids - written
    it = rows("CONCEPT.csv")
    next(it)
    extra = 0
    for row in it:
        if row[c["concept_id"]] in need:
            w_tgt.writerow(row)
            written.add(row[c["concept_id"]])
            extra += 1
    f_tgt.close()
    print(f"    more target concepts added: {extra:,}")

    print("Step 4 of 4: reading CONCEPT_SYNONYM.csv")
    it = rows("CONCEPT_SYNONYM.csv")
    header_s = next(it)
    s = {name: i for i, name in enumerate(header_s)}
    f_syn, w_syn = writer("synonyms.csv", header_s)
    keep, n_syn = source_ids | written, 0
    for row in it:
        if row[s["concept_id"]] in keep and row[s["language_concept_id"]] == ENGLISH:
            w_syn.writerow(row)
            n_syn += 1
    f_syn.close()
    print(f"    synonyms kept: {n_syn:,}")

    shutil.copyfile(os.path.join(HERE, "VOCABULARY.csv"), os.path.join(OUT, "vocabulary.csv"))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"Done in {time.time() - start:.0f} seconds. Wrote {total / 1e6:.0f} MB to {OUT}")


if __name__ == "__main__":
    main()
