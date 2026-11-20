"""Map every HPO term a person can choose in the survey to an OMOP standard concept.

python scripts/build_omop_mapping.py "C:/path/to/athena/h2t_extract"

This is run by a maintainer, not by the site build. It needs the small extract that
scripts/extract_athena.py writes from an Athena vocabulary download (https://athena.ohdsi.org).
Athena files stay out of the repository. The script writes:

  content/mappings/hpo-omop.csv        one row per survey term and target concept
  content/mappings/mondo-terms.csv     Mondo names and Athena concept ids for the diagnosis lookup
  content/mappings/release.yaml        the vocabulary versions the two files came from

How a term is matched, in order:
  athena_map    Athena has its own "Maps to" link from the HPO term to a standard concept.
  name_match    No Athena link; the HPO label or an exact synonym equals the name or a synonym of a
                standard SNOMED concept. Proposed by this script, so it needs a person's review.
  broader       No match for the term itself; the nearest HPO parent that has one is used.
  none          No match on the term or any parent below "Phenotypic abnormality".
  reviewed      A person chose the concept in content/mappings/overrides.yaml, which wins over the rest.

The column names_agree says whether the HPO label or an exact synonym equals a name of the target
concept. A "no" on an athena_map row is the place to look for a change in meaning, for example a
finding that Athena maps to a diagnosis.
"""
import collections
import csv
import datetime
import pathlib
import re
import sys

import yaml

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build  # noqa: E402
import content  # noqa: E402
import hpo  # noqa: E402

ROOT = content.ROOT
OUT = ROOT / "content" / "mappings"
STOP = {"HP:0000001", hpo.PHENOTYPIC_ABNORMALITY}
DOMAIN_ORDER = {"Condition": 0, "Observation": 1, "Measurement": 2}
COLUMNS = ["hpo_id", "hpo_label", "where_used", "in_athena", "hpo_concept_id", "match", "names_agree",
           "via_hpo_id", "via_hpo_label", "steps_up", "omop_concept_id", "omop_concept_name", "omop_domain",
           "omop_vocabulary", "omop_concept_code", "value_as_concept_id", "value_as_concept_name"]


def rows(path):
    with open(path, encoding="utf-8", newline="") as fh:
        yield from csv.DictReader(fh, delimiter="\t", quoting=csv.QUOTE_NONE)


def norm(s):
    s = re.sub(r"\s*\((disorder|finding|morphologic abnormality|observable entity|situation|procedure|"
               r"qualifier value|body structure|event|regime/therapy|context-dependent category)\)\s*$", "", s.strip(), flags=re.I)
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


SMALL = {"the", "of", "a", "an", "in", "finding", "disorder"}


def loose(s):
    """Word set that ignores small words and a final s, so 'Neoplasm of the liver' equals 'Neoplasm of liver'."""
    return frozenset(w[:-1] if len(w) > 3 and w.endswith("s") else w for w in norm(s).split() if w not in SMALL)


def survey_terms(files, onto, hdir):
    """HPO ids a person can reach, with where each is used: survey (written in the content files),
    drill (offered as a more specific choice), or search (found only through the search box)."""
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
    used = {t: "survey" for t in plain}
    for m in bank["seizures"]:
        for q in m.get("context", []):
            for h in (q.get("hpo_if") or {}).values():
                used.setdefault(h, "survey")
    dis_terms, _, _ = hpo.load_annotations(hdir / "phenotype.hpoa", onto)
    aids = content.search_aids(files)
    for t in build.drill_index(onto, dis_terms, plain, aids=aids):
        used.setdefault(t, "drill")
    for row in build.search_index(onto, {}, plain, set().union(*dis_terms.values()), aids):
        used.setdefault(row[0], "search")
    return used


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    ex = pathlib.Path(sys.argv[1])
    config = yaml.safe_load((ROOT / "config.yaml").read_text())
    hdir = ROOT / ".cache" / "hpo" / config["hpo_release"]
    onto = hpo.Ontology(hdir / "hp.obo")
    used = survey_terms(content.load_all(), onto, hdir)

    a_hpo = {r["concept_code"].replace("_", ":"): r for r in rows(ex / "hpo_concepts.csv")}
    by_id = {r["concept_id"]: r for r in a_hpo.values()}
    targets = {r["concept_id"]: r for r in rows(ex / "target_concepts.csv")}
    maps, values = collections.defaultdict(list), collections.defaultdict(list)
    for r in rows(ex / "relationships.csv"):
        if r["invalid_reason"] or r["concept_id_1"] not in by_id or r["concept_id_2"] not in targets:
            continue
        if r["relationship_id"] == "Maps to":
            maps[r["concept_id_1"]].append(r["concept_id_2"])
        elif r["relationship_id"] == "Maps to value":
            values[r["concept_id_1"]].append(r["concept_id_2"])

    names = collections.defaultdict(set)      # normalized name -> standard SNOMED concept ids
    tnames = collections.defaultdict(set)     # concept id -> normalized names
    for cid, r in targets.items():
        tnames[cid].add(norm(r["concept_name"]))
        if r["vocabulary_id"] == "SNOMED" and r["standard_concept"] == "S" and not r["invalid_reason"] \
                and r["domain_id"] in DOMAIN_ORDER:
            names[norm(r["concept_name"])].add(cid)
    for r in rows(ex / "synonyms.csv"):
        cid = r["concept_id"]
        if cid in targets:
            n = norm(r["concept_synonym_name"])
            tnames[cid].add(n)
            t = targets[cid]
            if t["vocabulary_id"] == "SNOMED" and t["standard_concept"] == "S" and not t["invalid_reason"] \
                    and t["domain_id"] in DOMAIN_ORDER:
                names[n].add(cid)

    over = {}
    opath = OUT / "overrides.yaml"
    if opath.exists():
        for o in (yaml.safe_load(opath.read_text(encoding="utf-8")) or {}).get("overrides") or []:
            cid = str(o.get("omop_concept_id") or "")
            if cid and cid not in targets:
                sys.exit(f"overrides.yaml: concept {cid} for {o['hpo_id']} is not a standard concept in this Athena extract.")
            over[o["hpo_id"]] = cid

    def own_names(tid):
        t = onto.terms[tid]
        return {norm(t["name"])} | {norm(s) for s in t["exact"]}

    def direct(tid):
        """(match, [concept ids]) for the term itself, without looking at parents."""
        a = a_hpo.get(tid)
        if a and not a["invalid_reason"] and maps.get(a["concept_id"]):
            return "athena_map", sorted(set(maps[a["concept_id"]]))
        hits = set()
        for n in own_names(tid):
            hits |= names.get(n, set())
        if hits:
            best = min(DOMAIN_ORDER[targets[c]["domain_id"]] for c in hits)
            return "name_match", sorted(c for c in hits if DOMAIN_ORDER[targets[c]["domain_id"]] == best)[:3]
        return None, []

    out, counts = [], collections.Counter()
    for tid in sorted(used):
        t = onto.terms[tid]
        a = a_hpo.get(tid)
        base = {"hpo_id": tid, "hpo_label": t["name"], "where_used": used[tid],
                "in_athena": "yes" if a and not a["invalid_reason"] else "no",
                "hpo_concept_id": a["concept_id"] if a else ""}
        match, cids = direct(tid)
        via, steps = tid, 0
        if tid in over:
            match, cids = ("reviewed", [over[tid]]) if over[tid] else ("none", [])
        elif not match:
            level, seen = set(t["is_a"]), {tid}
            while level and not match:
                steps += 1
                found = []
                for p in sorted(level):
                    if p in STOP:
                        continue
                    m, c = direct(p)
                    if m:
                        found.append((p, c))
                if found:
                    match, (via, cids) = "broader", found[0]
                    break
                seen |= level
                level = {g for p in level for g in onto.terms[p]["is_a"]} - seen - STOP
        if not match or match == "none":
            match, cids, via, steps = "none", [], "", ""
        counts[(used[tid], match)] += 1
        vals = values.get(a["concept_id"], []) if a and match == "athena_map" else []
        mine = own_names(tid)
        mine_loose = {loose(n) for n in mine}
        for cid in cids or [""]:
            c = targets.get(cid, {})
            v = targets.get(vals[0], {}) if vals else {}
            out.append({**base, "match": match,
                        "names_agree": ("yes" if mine_loose & {loose(n) for n in tnames[cid]} else "no") if match in ("athena_map", "name_match") else "",
                        "via_hpo_id": via if match == "broader" else "", "via_hpo_label": onto.label(via) if match == "broader" else "",
                        "steps_up": steps if match == "broader" else "",
                        "omop_concept_id": cid, "omop_concept_name": c.get("concept_name", ""), "omop_domain": c.get("domain_id", ""),
                        "omop_vocabulary": c.get("vocabulary_id", ""), "omop_concept_code": c.get("concept_code", ""),
                        "value_as_concept_id": v.get("concept_id", ""), "value_as_concept_name": v.get("concept_name", "")})

    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "hpo-omop.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(out)
    mondo = sorted((r for r in rows(ex / "mondo_concepts.csv") if not r["invalid_reason"] and r["domain_id"] == "Condition"),
                   key=lambda r: r["concept_name"].lower())
    with open(OUT / "mondo-terms.csv", "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["mondo_id", "name", "athena_concept_id"])
        for r in mondo:
            w.writerow([r["concept_code"].replace("_", ":"), r["concept_name"], r["concept_id"]])
    vocab = {r["vocabulary_id"]: r["vocabulary_version"] for r in rows(ex / "vocabulary.csv")}
    release = {"athena_release": vocab.get("None", ""), "generated": datetime.date.today().isoformat(),
               "survey_hpo_release": onto.version,
               "vocabulary_versions": {k: vocab.get(k, "") for k in ("HPO", "Mondo", "SNOMED", "OMOP Extension")}}
    (OUT / "release.yaml").write_text(
        "# Written by scripts/build_omop_mapping.py. Do not edit by hand.\n" + yaml.safe_dump(release, sort_keys=False), encoding="utf-8")
    for k, v in sorted(counts.items()):
        print(f"{k[0]:7} {k[1]:20} {v}")
    print(f"Mondo terms: {len(mondo)}")


if __name__ == "__main__":
    main()
