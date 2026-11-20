"""Validate the content and build the site into _site/.

python scripts/build.py               validate, then build
python scripts/build.py --check-only  validate only
Run scripts/fetch_hpo.py first (make build does both).
"""
import argparse
import base64
import json
import math
import os
import pathlib
import shutil
import sys

import yaml

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import checks  # noqa: E402
import content  # noqa: E402
import hpo  # noqa: E402
import review_items  # noqa: E402
import csv  # noqa: E402
import datetime  # noqa: E402

ROOT = content.ROOT
SITE = ROOT / "site"


def gene_funnels(dis_terms, dis_genes, names, item_terms):
    """Per-term disease bitsets and gene counts for the ALS and epilepsy funnels.

    ALS: genes linked to a disease record annotated with Amyotrophic lateral sclerosis (HP:0007354)
    or named as ALS; the records searched are every record linked to one of those genes.
    Epilepsy: genes linked to a record annotated with Seizure (HP:0001250) or a term beneath it.
    """
    def universe(pred):
        ds = [d for d in dis_terms if pred(d) and dis_genes.get(d)]
        return ds, set().union(*[dis_genes[d] for d in ds]) if ds else set()

    _, als_genes = universe(lambda d: "HP:0007354" in dis_terms[d]
                           or "amyotrophic lateral sclerosis" in names.get(d, "").lower())
    als_corpus = sorted(d for d in dis_terms if dis_genes.get(d) and dis_genes[d] & als_genes)
    epi_corpus, epi_genes = universe(lambda d: "HP:0001250" in dis_terms[d])
    epi_corpus = sorted(epi_corpus)

    out, kept = {}, {}
    for key, corpus, genes in (("als", als_corpus, als_genes), ("epi", epi_corpus, epi_genes)):
        genes = sorted(genes)
        gi = {g: i for i, g in enumerate(genes)}
        dg = [[gi[g] for g in sorted(dis_genes[d]) if g in gi] for d in corpus]
        bits, k = {}, {}
        for t in sorted(item_terms):
            idx = [i for i, d in enumerate(corpus) if t in dis_terms[d]]
            if not idx:
                continue
            b = bytearray((len(corpus) + 7) // 8)
            for i in idx:
                b[i >> 3] |= 1 << (i & 7)
            bits[t] = base64.b64encode(bytes(b)).decode()
            k[t] = len({g for i in idx for g in dg[i]})
        out[key] = {"genes": genes, "dg": dg, "n": len(corpus), "bits": bits,
                    "multi": [i for i, g in enumerate(dg) if len(g) > 3]}
        kept[key] = k
        kept[key + "_n"] = len(genes)
        kept[key + "_corpus"] = len(corpus)
    return out, kept


def search_index(onto, labels, plain):
    keep = onto.descendants(hpo.PHENOTYPIC_ABNORMALITY)
    rows = []
    for tid in sorted(keep):
        t = onto.terms[tid]
        if t["obs"] or not (t["lay"] or tid in plain):
            continue
        lay = [s for s in t["lay"] if s.lower() != t["name"].lower()][:4]
        rows.append([tid, t["name"], "|".join(lay)])
    return rows


def embed(template, marker, data):
    text = (SITE / template).read_text(encoding="utf-8")
    assert text.count(marker) == 1, f"{template} must contain {marker} once"
    return text.replace(marker, json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/"))



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "_site"))
    args = ap.parse_args()

    config = yaml.safe_load((ROOT / "config.yaml").read_text())
    hdir = ROOT / ".cache" / "hpo" / config["hpo_release"]
    if not (hdir / "hp.obo").exists():
        sys.exit(f"HPO files are missing from {hdir}. Run: python scripts/fetch_hpo.py")
    onto = hpo.Ontology(hdir / "hp.obo")
    files = content.load_all()

    report = checks.run(files, onto, config)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = [f"### Content checks against HPO release {onto.version}", ""]
    lines += [f"- Error: {e}" for e in report.errors] or ["- No errors."]
    lines += [f"- Note: {w}" for w in report.warnings]
    print("\n".join(lines))
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    if report.errors:
        sys.exit(1)
    if args.check_only:
        return

    bank = content.bank(files)
    plain = {}
    def collect(items):
        for it in items:
            plain.setdefault(it["h"], it["p"])
            collect(it.get("c", []))
    for s in bank["systems"]:
        collect(s["items"])
    for m in bank["epilepsy"] + bank["als"]:
        collect(m.get("items", []))

    dis_terms, names, hpoa_version = hpo.load_annotations(hdir / "phenotype.hpoa", onto)
    dis_genes = hpo.load_gene_links(hdir / "genes_to_disease.txt")
    extra = set()
    for m in bank["epilepsy"] + bank["als"]:
        for q in m.get("context", []):
            extra |= set((q.get("hpo_if") or {}).values())
    funnel, kept = gene_funnels(dis_terms, dis_genes, names, set(plain) | extra)

    cw = files["content/original/crosswalk.yaml"]
    orig = files["content/original/health-survey-2018.yaml"]
    ids = set(plain) | extra | {o[1] for o in bank["onset"]} | {"HP:0020174", "HP:0003677", "HP:0003678"}
    for sec in cw["sections"]:
        for row in sec["rows"]:
            ids |= set(row.get("redesign") or [])
    labels = {i: onto.label(i) for i in sorted(ids) if onto.label(i)}
    current = {}
    for sec in orig["detail"]:
        for row in sec["rows"]:
            h = row.get("hpo_id")
            if h and h in onto.terms:
                t = onto.terms[h]
                current[h] = t["name"] + (" (obsolete)" if t["obs"] else "")

    bank.update(labels=labels, kept=kept, hpo_version=onto.version, hpoa_version=hpoa_version,
                config={"repo_url": config.get("repo_url", ""), "site_title": config.get("site_title", "")})

    out = pathlib.Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(SITE, out, ignore=shutil.ignore_patterns("*.html"))
    (out / "index.html").write_text(embed("index.html", "/*BANK*/", bank), encoding="utf-8")
    compare = {"original": orig, "crosswalk": cw, "current_labels": current,
               "seizure": files.get("content/original/seizure-survey-v1.3.yaml"),
               "seizure_crosswalk": files.get("content/original/seizure-crosswalk.yaml")}
    for sec in (compare["seizure_crosswalk"] or {}).get("pages", []):
        for row in sec["rows"]:
            labels.update({h: onto.label(h) for h in row.get("redesign") or [] if h.startswith("HP:") and onto.label(h)})
    (out / "compare.html").write_text(
        embed("compare.html", "/*BANK*/", bank).replace("/*COMPARE*/", json.dumps(compare, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")),
        encoding="utf-8")
    stages, items = review_items.build(files, plain, labels, current)
    rq = files["content/review/open-questions.yaml"]
    dec = files["content/review/decisions.yaml"]
    built = datetime.date.today().isoformat()
    review = {"build": {"hpo": onto.version, "date": built, "hs": "GenomeConnect Health Survey (2018 supplement)",
                        "sz": (f"GenomeConnect Seizure Survey, version {compare['seizure']['version']}" if compare["seizure"] else "")},
              "decisions": dec["decisions"], "roles": dec["roles"], "notes": rq.get("notes", []),
              "questions": rq.get("questions", []), "stages": stages, "items": items,
              "config": {"repo_url": config.get("repo_url", "")}, "columns": review_items.CSV_COLUMNS}
    (out / "annotate.html").write_text(embed("annotate.html", "/*REVIEW*/", review), encoding="utf-8")
    with open(out / "review-template.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh, quoting=csv.QUOTE_ALL)
        w.writerow(review_items.CSV_COLUMNS)
        titles = {s["id"]: s["title"] for s in stages}
        for it in items:
            w.writerow(review_items.csv_row(it, titles, review["build"], {}, {}))
        for q in review["questions"]:
            w.writerow(review_items.question_row(q, review["build"], {}))
    (out / "funnel.json").write_text(json.dumps(funnel, separators=(",", ":")), encoding="utf-8")
    (out / "search.json").write_text(json.dumps(search_index(onto, labels, plain), separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    (out / ".nojekyll").write_text("")
    print(f"Built {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} with HPO {onto.version}, annotations {hpoa_version}: "
          f"{kept['als_n']} ALS genes, {kept['epi_n']} seizure-associated genes.")


if __name__ == "__main__":
    main()
