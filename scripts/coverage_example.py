"""Reproduce the coverage figures quoted on the Summary of changes page.

For the HPO disease records linked to a gene, count the annotated features that can be chosen exactly
in the original Health Survey and in this survey, and show how far two findings narrow the list of
seizure-associated genes. Counts describe the pinned HPO release, not diagnoses or probabilities.

Usage: python scripts/fetch_hpo.py && python scripts/coverage_example.py [GENE]
"""
import collections
import csv
import pathlib
import sys

import yaml

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build  # noqa: E402
import content  # noqa: E402
import hpo  # noqa: E402

ROOT = content.ROOT


def main():
    gene = sys.argv[1] if len(sys.argv) > 1 else "SLC35A2"
    tag = yaml.safe_load((ROOT / "config.yaml").read_text())["hpo_release"]
    hdir = ROOT / ".cache" / "hpo" / tag
    onto = hpo.Ontology(hdir / "hp.obo")
    direct = collections.defaultdict(set)
    with open(hdir / "phenotype.hpoa", encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or line.startswith("database_id"):
                continue
            f = line.rstrip("\n").split("\t")
            if f[2] != "NOT" and f[10] == "P" and f[3] in onto.terms and not onto.terms[f[3]]["obs"]:
                direct[f[0]].add(f[3])
    prop = {d: set().union(*[onto.ancestors(t) for t in ts]) for d, ts in direct.items()}
    genes = hpo.load_gene_links(hdir / "genes_to_disease.txt")

    files = content.load_all()
    orig = files["content/original/health-survey-2018.yaml"]
    original = {r["hpo_id"] for s in orig["detail"] for r in s["rows"]
                if r.get("hpo_id") in onto.terms and not onto.terms[r["hpo_id"]]["obs"]}
    plain = {}
    for p, f in files.items():
        if p.startswith("content/survey/systems/"):
            plain.update({it["hpo"]: it["plain"] for it, _ in content.walk_items(f["items"])})
        elif p.startswith("content/survey/followups/"):
            for s in f["steps"]:
                plain.update({it["hpo"]: it["plain"] for it, _ in content.walk_items(s.get("items"))})
    redesign = set(build.drill_index(onto, prop, plain))

    records = [d for d in direct if gene in genes.get(d, ())]
    terms = set().union(*[direct[d] for d in records]) if records else set()
    print(f"HPO release {onto.version}. {gene}: {len(records)} disease record(s), {len(terms)} annotated features.")
    print(f"  can be chosen exactly in the original survey: {len(terms & original)}")
    print(f"  can be chosen exactly in this survey:         {len(terms & redesign)}")

    universe = [d for d in prop if "HP:0001250" in prop[d] and genes.get(d)]

    def narrow(ts):
        return {g for d in universe if all(t in prop[d] for t in ts) for g in genes[d]}

    print(f"Seizure-associated genes: {len(narrow([]))}")
    print(f"  with hypotonia (HP:0001252): {len(narrow(['HP:0001252']))}")
    both = narrow(["HP:0001252", "HP:0003186"])
    print(f"  with hypotonia and inverted nipples (HP:0003186): {len(both)}; {gene} included: {gene in both}")
    ann = [(d, t) for d in universe for t in direct[d]]
    print(f"Share of annotations on seizure-associated records that can be chosen exactly: "
          f"original {sum(t in original for _, t in ann) / len(ann):.0%}, this survey {sum(t in redesign for _, t in ann) / len(ann):.0%}")


if __name__ == "__main__":
    main()
