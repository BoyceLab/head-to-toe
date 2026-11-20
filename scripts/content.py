"""Load the YAML content files and convert them to the compact form the pages use."""
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
    if it.get("opens_module"):
        o["route"] = it["opens_module"]
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


def _example(e):
    ans = {}
    for h, a in (e.get("answers") or {}).items():
        x = {"v": a.get("answer")}
        if a.get("how_often"):
            x["freq"] = a["how_often"]
        if a.get("onset"):
            x["onset"] = a["onset"]
        if a.get("source"):
            x["src"] = a["source"]
        ans[h] = x
    return {
        "key": e["key"], "title": e["title"], "resp": e.get("respondent", ""), "age": e.get("age_band", ""),
        "sex": e.get("sex_at_birth", ""), "routes": e.get("reasons", []), "dxNamed": e.get("diagnosis_named", ""),
        "dxName": e.get("diagnosis_name", ""), "t": e.get("genetic_testing", {}), "screen": e.get("screen", {}),
        "ans": ans, "ctx": e.get("questions", {}), "ctxd": e.get("question_details", {}), "fam": e.get("family", {}), "consang": e.get("consanguinity", ""),
    }


def bank(files):
    systems = [f for p, f in files.items() if p.startswith("content/survey/systems/")]
    mods = {f["module"]: f for p, f in files.items() if p.startswith("content/survey/modules/")}
    fam = files["content/survey/family.yaml"]
    onset = files["content/survey/onset.yaml"]
    examples = [f for p, f in files.items() if p.startswith("content/examples/")]
    return {
        "systems": [{"k": s["key"], "t": s["title"], "stem": s["question"], "ex": s["examples"],
                     "items": [_item(i) for i in s["items"]]} for s in systems],
        "epilepsy": [_step(s) for s in mods["epilepsy"]["steps"]],
        "als": [_step(s) for s in mods["als"]["steps"]],
        "onset": [[o["plain"], o["hpo"]] for o in onset["onset_bands"]],
        "family": [[c["key"], c["plain"]] for c in fam["conditions"]],
        "relatives": fam["relatives"],
        "seizure_frequency": mods["epilepsy"].get("frequency_options", []),
        "examples": {e["key"]: _example(e) for e in examples},
        "notes": files["content/notes/design-notes.yaml"],
    }


def walk_items(items, parent=None):
    """Yield (item, parent_item) through every level of more_specific."""
    for it in items or []:
        yield it, parent
        yield from walk_items(it.get("more_specific"), it)
