"""Validate the content and build the site into _site/.

python scripts/build.py               validate, then build
python scripts/build.py --check-only  validate only
Run scripts/fetch_hpo.py first (make build does both).
"""
import argparse
import html
import re
import json
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


GROUPING = re.compile(r"^(Abnormal|Abnormality|Aplasia/Hypoplasia|Morphological|Functional)\b", re.I)


def drill_index(onto, dis_terms, plain, max_children=30, max_depth=4):
    """More specific choices for every survey term, taken from HPO.

    For each term in the survey, list its child terms that are used in at least one disease annotation,
    most used first, and repeat for those children. Each entry is [plain wording, HPO label, child ids];
    plain wording is the survey's own wording, or HPO's first layperson synonym, or empty when HPO has none.
    """
    use = {}
    for terms in dis_terms.values():
        for t in terms:
            use[t] = use.get(t, 0) + 1
    out, frontier = {}, [(t, 0) for t in sorted(plain)]
    while frontier:
        tid, depth = frontier.pop()
        if tid in out:
            continue
        t = onto.terms[tid]
        kids = []
        if depth < max_depth:
            # Grouping terms such as "Abnormality of head size" are not findings a person can choose,
            # so each is replaced by its own children.
            stack, seen = list(onto._kids.get(tid, [])), set()
            while stack:
                k = stack.pop()
                if k in seen or onto.terms[k]["obs"] or not use.get(k):
                    continue
                seen.add(k)
                if GROUPING.match(onto.terms[k]["name"]) and k not in plain:
                    stack.extend(onto._kids.get(k, []))
                else:
                    kids.append(k)
            kids = sorted(kids, key=lambda k: (-use[k], onto.terms[k]["name"]))[:max_children]
        lay = next((x for x in t["lay"] if x.lower() != t["name"].lower()), "")
        out[tid] = [plain.get(tid, lay), t["name"], kids]
        frontier.extend((k, depth + 1) for k in kids)
    return out


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


NOTICE = ""


def embed(template, marker, data):
    text = (SITE / template).read_text(encoding="utf-8")
    banner = f'<div class="notice" role="note"><div class="wrap">{html.escape(NOTICE)}</div></div>' if NOTICE else ""
    text = text.replace("<!--NOTICE-->", banner)
    assert text.count(marker) == 1, f"{template} must contain {marker} once"
    return text.replace(marker, json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/"))



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "_site"))
    args = ap.parse_args()

    config = yaml.safe_load((ROOT / "config.yaml").read_text())
    global NOTICE
    NOTICE = (config.get("notice") or "").strip()
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
    for m in bank["seizures"]:
        collect(m.get("items", []))

    dis_terms, names, hpoa_version = hpo.load_annotations(hdir / "phenotype.hpoa", onto)
    extra = set()
    for m in bank["seizures"]:
        for q in m.get("context", []):
            extra |= set((q.get("hpo_if") or {}).values())
    drill = drill_index(onto, dis_terms, plain)

    cw = files["content/original/crosswalk.yaml"]
    orig = files["content/original/health-survey-2018.yaml"]
    ids = set(plain) | extra | {o[2] for o in bank["onset"]["options"]} | {"HP:0020174"}
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

    mapping_release = content.load_mapping()[2]
    bank.update(labels=labels, hpo_version=onto.version, hpoa_version=hpoa_version, mapping=mapping_release,
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
    pc = files["content/notes/proposed-changes.yaml"]
    sec_title = {s["key"]: s["heading"] for s in orig["detail"]}
    printed = {(s["key"], r["answer"]): r.get("hpo_as_printed", "No term printed") for s in orig["detail"] for r in s["rows"]}
    term_rows = [{"section": sec_title.get(sec["section"], sec["section"]), "original": row["original"],
                  "printed": printed.get((sec["section"], row["original"]), ""),
                  "proposed": "; ".join(f"{labels.get(h, h)} ({h})" for h in row.get("redesign") or []) or "Not asked",
                  "note": row.get("note", "")}
                 for sec in cw["sections"] for row in sec["rows"] if row["change"] in ("corrected", "retired", "refined", "merged")]
    szc = compare["seizure_crosswalk"] or {}
    sz_titles = {p["key"]: p["title"] for p in (compare["seizure"] or {}).get("pages", [])}
    seizure_rows = [{"page": sz_titles.get(pg["page"], pg["page"]), "original": str(row["original"]).split(": ", 1)[-1],
                     "label": szc.get("change_types", {}).get(row["change"], row["change"]), "note": row.get("note", "")}
                    for pg in szc.get("pages", []) for row in pg["rows"] if row["change"] in ("corrected", "split", "merged")]
    changes = {"intro": pc["intro"], "sections": pc["sections"], "sources": pc["sources"], "term_rows": term_rows,
               "seizure_rows": seizure_rows, "hpo_version": onto.version}
    (out / "changes.html").write_text(embed("changes.html", "/*CHANGES*/", changes), encoding="utf-8")
    (out / "drill.json").write_text(json.dumps(drill, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    (out / "search.json").write_text(json.dumps(search_index(onto, labels, plain), separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    by_term, mondo, release = content.load_mapping()
    omop = {"release": release, "terms": {
        tid: [rows[0]["hpo_concept_id"], rows[0]["match"], rows[0]["via_hpo_id"],
              [[r["omop_concept_id"], r["omop_concept_name"], r["omop_domain"], r["omop_vocabulary"], r["value_as_concept_id"]]
               for r in rows if r["omop_concept_id"]]]
        for tid, rows in by_term.items()}}
    (out / "omop.json").write_text(json.dumps(omop, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    (out / "mondo.json").write_text(json.dumps(mondo, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    (out / ".nojekyll").write_text("")
    print(f"Built {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} with HPO {onto.version}, annotations {hpoa_version}: "
          f"{len(plain)} survey terms, {len(drill)} terms reachable through more specific choices.")


if __name__ == "__main__":
    main()
