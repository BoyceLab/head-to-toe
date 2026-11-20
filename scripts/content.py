"""Load the YAML content files and convert them to the compact form the pages use."""
import csv
import pathlib
import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"


def read(path):
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def load_all():
    """Every content file, keyed by its path relative to the repository root."""
    files = {}
    for p in sorted(CONTENT.rglob("*.yaml")):
        files[str(p.relative_to(ROOT))] = read(p)
    return files


def _item(it):
    o = {"h": it.get("hpo"), "p": it.get("plain")}
    if it.get("description"):
        o["d"] = it["description"]
    if it.get("show_when"):
        o["when"] = it["show_when"]
    if it.get("from_a_report"):
        o["lab"] = True
    if it.get("opens_followup"):
        o["route"] = it["opens_followup"]
    if it.get("asks_frequency"):
        o["freq"] = True
    if it.get("more_specific"):
        o["c"] = [_item(k) for k in it["more_specific"]]
    return o


def _question(q):
    o = {"k": q["key"], "q": q["question"], "type": q["type"]}
    for src, dst in (("options", "opts"), ("help", "help"), ("show_when", "show"),
                     ("hpo_by_answer", "hpo_if"), ("hpo_note", "hpo_note")):
        if q.get(src) is not None:
            o[dst] = q[src]
    if q.get("per_choice"):
        o["per"] = [{"k": p["key"], "q": p["question"], "type": p["type"], "opts": p.get("options", [])} for p in q["per_choice"]]
    return o


def _step(s):
    o = {"k": s["key"], "t": s["title"]}
    if s.get("show_when"):
        o["show"] = s["show_when"]
    if s.get("intro"):
        o["intro"] = s["intro"]
    if s.get("questions"):
        o["context"] = [_question(q) for q in s["questions"]]
    if s.get("items"):
        o["items"] = [_item(i) for i in s["items"]]
    return o


def bank(files):
    systems = [f for p, f in files.items() if p.startswith("content/survey/systems/")]
    sz = files["content/survey/followups/seizures.yaml"]
    fam = files["content/survey/family.yaml"]
    onset = files["content/survey/onset.yaml"]
    return {
        "systems": [{"k": s["key"], "t": s["title"], "stem": s["question"], "ex": s["examples"],
                     "items": [_item(i) for i in s["items"]]} for s in systems],
        "seizures": [_step(s) for s in sz["steps"]],
        "onset": {"options": [[o["key"], o["plain"], o["hpo"]] for o in onset["options"]], "by": onset["by_age_band"]},
        "family": [[c["key"], c["plain"]] for c in fam["conditions"]],
        "relatives": fam["relatives"],
        "seizure_frequency": sz.get("frequency_options", []),
        "notes": files["content/notes/design-notes.yaml"],
    }


def walk_items(items, parent=None):
    """Yield (item, parent_item) through every level of more_specific."""
    for it in items or []:
        yield it, parent
        yield from walk_items(it.get("more_specific"), it)


MAPPINGS = CONTENT / "mappings"


def load_mapping():
    """The HPO to OMOP mapping, the Mondo term list, and the release they came from.

    Returns (rows by HPO id, Mondo rows, release). Each is empty when the files are absent, so the
    survey still builds for someone who has not run scripts/build_omop_mapping.py.
    """
    by_term, mondo, release = {}, [], {}
    if (MAPPINGS / "hpo-omop.csv").exists():
        with open(MAPPINGS / "hpo-omop.csv", encoding="utf-8", newline="") as fh:
            for r in csv.DictReader(fh):
                by_term.setdefault(r["hpo_id"], []).append(r)
    if (MAPPINGS / "mondo-terms.csv").exists():
        with open(MAPPINGS / "mondo-terms.csv", encoding="utf-8", newline="") as fh:
            mondo = [[r["mondo_id"], r["name"], r["athena_concept_id"]] for r in csv.DictReader(fh)]
    if (MAPPINGS / "release.yaml").exists():
        release = read(MAPPINGS / "release.yaml") or {}
    return by_term, mondo, release


def search_aids(files):
    """HPO id -> {"plain": str, "search": [str]} from content/survey/search-aids.yaml."""
    f = files.get("content/survey/search-aids.yaml") or {}
    return {a["hpo"]: {"plain": a.get("plain", ""), "search": a.get("search") or []} for a in f.get("aids") or []}
