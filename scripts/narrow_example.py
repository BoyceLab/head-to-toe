"""Show how a list of findings narrows the genes in the HPO disease annotations.

For each HPO term in turn, count the genes that have at least one disease record annotated with every
term so far (a record annotated with a more specific term counts). Counts describe the pinned HPO
release. They are not diagnoses or probabilities, and a gene is missed when its records lack a term.

Usage: python scripts/fetch_hpo.py && python scripts/narrow_example.py HP:0012469 HP:0001249 HP:0001252 HP:0003186
"""
import collections
import pathlib
import sys

import yaml

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import content  # noqa: E402
import hpo  # noqa: E402


def main():
    terms = sys.argv[1:]
    if not terms:
        sys.exit(__doc__)
    tag = yaml.safe_load((content.ROOT / "config.yaml").read_text())["hpo_release"]
    hdir = content.ROOT / ".cache" / "hpo" / tag
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
    print(f"HPO release {onto.version}")
    so_far = []
    for t in terms:
        if t not in onto.terms:
            sys.exit(f"{t} is not in this HPO release.")
        so_far.append(t)
        left = sorted({g for d in prop if genes.get(d) and all(x in prop[d] for x in so_far) for g in genes[d]})
        print(f"  + {t} {onto.label(t)}: {len(left)} genes" + (": " + ", ".join(left) if len(left) <= 12 else ""))


if __name__ == "__main__":
    main()
