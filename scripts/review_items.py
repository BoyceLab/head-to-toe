"""Compile the item list for the annotation page from the original surveys and their crosswalks."""
import re

INTRO_IDS = ["gender-sex", "testing-had", "testing-type", "testing-reason", "testing-copy"]
END_IDS = ["referral", "membership", "group", "comments"]
WIDE = [
    ("screen-unsure", "Body-system screen answered Yes, No, or Unsure, where only Yes opens the detail page",
     "Applies to every body-system question."),
    ("select-all", "Detail pages as select-all-that-apply lists", "Applies to every detail page."),
    ("timing-grid", "Age symptoms first appeared and age at diagnosis, asked for every checked item",
     "Single ages from before birth and 0 to 3 months through 70 and older."),
    ("other-box", "A free-text box at the end of every detail page for anything not listed", ""),
    ("yourself", "Questions written to a person answering about themselves",
     "For example: Have you had issues with your GROWTH?"),
]


def slug(text, n=48):
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return s[:n].rstrip("-")


def _targets(targets, plain, labels, qtext, pages):
    out = []
    for t in targets or []:
        if t.startswith("q:"):
            out.append("Question: " + qtext.get(t[2:], t[2:]))
        elif t.startswith("page:"):
            out.append(pages.get(t[5:], t))
        else:
            out.append(f"{plain.get(t, labels.get(t, t))} ({t} {labels.get(t, '')})".replace(" )", ")"))
    return out


def build(files, plain, labels, current):
    orig = files["content/original/health-survey-2018.yaml"]
    cw = files["content/original/crosswalk.yaml"]
    types = cw.get("change_types", {})
    sz = files.get("content/original/seizure-survey-v1.3.yaml")
    szc = files.get("content/original/seizure-crosswalk.yaml")
    mods = [f for p, f in files.items() if p.startswith("content/survey/modules/")]
    qtext = {q["key"]: q["question"].replace("{you}", "you").replace("{your}", "your").replace("{were_was}", "were").replace("{have_has}", "have")
             for m in mods for s in m.get("steps", []) for q in s.get("questions", [])}
    pages = {"you": "The Who is answering page", "testing": "The Genetic testing page", "family": "The shared Family history page",
             "more": "The Anything else page: plain-language search, then a free-text box", "review": "The Review and export page"}
    other = {o["id"]: o for o in cw.get("other_items", [])}
    systems = {f["key"]: f["title"] for p, f in files.items() if p.startswith("content/survey/systems/")}

    stages, items = [], []

    def proposal(change, note, targets, tmap=types, label=None):
        return {"change": change, "label": label or tmap.get(change, change), "note": note or "",
                "redesign": _targets(targets, plain, labels, qtext, pages)}

    def add(stage, iid, text, detail="", hpo_printed="", hpo_now="", prop=None, question=""):
        items.append({"id": iid, "stage": stage, "text": text, "detail": detail or "", "hpo_printed": hpo_printed or "",
                      "hpo_now": hpo_now or "", "proposal": prop, "question": question or ""})

    # Health Survey: opening questions
    stages.append({"id": "hs-opening", "survey": "HS", "title": "Opening questions"})
    qs = [q for sec in orig["intro"] for q in sec["questions"]]
    for iid, q in zip(INTRO_IDS, qs):
        o = other.get("intro." + iid, {})
        add("hs-opening", "HS.intro." + iid, q["question"], " / ".join(q.get("options", [])),
            prop=proposal(o.get("change", ""), o.get("note"), [], label=o.get("label")), question=o.get("question_for_reviewers"))
    # screen
    stages.append({"id": "hs-screen", "survey": "HS", "title": "Body-system screen questions"})
    for s in orig["screen"]:
        add("hs-screen", "HS.screen." + s["key"], f"{s['number']}. {s['question']}", s.get("examples", ""),
            prop=proposal("same", f"Asked as: {systems.get(s['key'], s['key'])}. Yes and Not sure both open the detail page.", [], label="Kept, reworded"))
    # detail sections
    rows_by = {(sec["section"], r["original"]): r for sec in cw["sections"] for r in sec["rows"]}
    for sec in orig["detail"]:
        sid = "hs-" + sec["key"]
        stages.append({"id": sid, "survey": "HS", "title": sec["heading"],
                       "intro": (sec["questions"][0]["question"] if sec.get("questions") else "")})
        seen = set()
        for r in sec["rows"]:
            iid = f"HS.{sec['key']}.{slug(r['answer'])}"
            k = 2
            while iid in seen:
                iid = f"HS.{sec['key']}.{slug(r['answer'])}-{k}"
                k += 1
            seen.add(iid)
            c = rows_by.get((sec["key"], r["answer"]), {})
            now = ""
            h = r.get("hpo_id")
            printed = (r.get("hpo_as_printed") or "").lower()
            if h and current.get(h) and not printed.startswith(current[h].lower()):
                now = f"{h} in the current release: {current[h]}"
            add(sid, iid, r["answer"], r.get("description", ""), r.get("hpo_as_printed", "No term printed"), now,
                proposal(c.get("change", ""), c.get("note"), c.get("redesign")), c.get("question_for_reviewers"))
    # closing questions and survey-wide features
    stages.append({"id": "hs-closing", "survey": "HS", "title": "Closing questions"})
    for iid, q in zip(END_IDS, orig["end"]):
        o = other.get("end." + iid, {})
        add("hs-closing", "HS.end." + iid, q["question"], " / ".join(q.get("options", [])),
            prop=proposal(o.get("change", ""), o.get("note"), [], label=o.get("label")), question=o.get("question_for_reviewers"))
    stages.append({"id": "hs-wide", "survey": "HS", "title": "Features of the whole survey"})
    for iid, text, detail in WIDE:
        o = other.get("wide." + iid, {})
        add("hs-wide", "HS.wide." + iid, text, detail, prop=proposal(o.get("change", ""), o.get("note"), [], label=o.get("label")),
            question=o.get("question_for_reviewers"))

    # Seizure Survey: one item per crosswalk row
    if sz and szc:
        sztypes = szc.get("change_types", {})
        age = sz.get("age_options", [])
        for pg in sz["pages"]:
            sid = "sz-" + pg["key"]
            stages.append({"id": sid, "survey": "SZ", "title": pg["title"], "intro": pg.get("text", "")})
            qmap = {q["key"]: q for q in pg.get("questions", [])}
            rows = next((p["rows"] for p in szc["pages"] if p["page"] == pg["key"]), [])
            seen = set()
            for r in rows:
                o = str(r["original"])
                key = o.split(":")[0].split(" ")[0]
                q = qmap.get(key, {})
                opts = q.get("options", [])
                opts = age if opts == "age_options" else [x["label"] if isinstance(x, dict) else x for x in (opts or [])]
                if key == "all":
                    text, detail = "Every page: Keep in mind that, throughout this survey, you are providing information about yourself.", ""
                elif ": " in o:
                    lab = o.split(": ", 1)[1]
                    opt = next((x for x in q.get("options", []) if isinstance(x, dict) and x.get("label") == lab), {})
                    text, detail = lab, (opt.get("description", "") + " (an option of: " + q["question"][:110] + ("…" if len(q["question"]) > 110 else "") + ")").strip()
                elif " per " in o:
                    text = "Follow-up asked for each choice: " + o.split(" per ", 1)[1]
                    detail = " | ".join(p["question"] + ": " + ", ".join(age if p["options"] == "age_options" else p["options"])
                                        for p in q.get("per_choice", []))
                else:
                    text = q.get("question", o)
                    detail = " / ".join(opts[:14]) + (" / …" if len(opts) > 14 else "") if opts else "Free text"
                iid = f"SZ.{pg['key']}.{slug(o)}"
                while iid in seen:
                    iid += "-2"
                seen.add(iid)
                add(sid, iid, text, detail, prop=proposal(r.get("change"), r.get("note"), r.get("redesign"), sztypes),
                    question=r.get("question_for_reviewers"))
    return stages, items


# Columns of a downloaded review, shared by the annotation page, review-template.csv, and the notebook.
CSV_COLUMNS = ["format", "survey", "section_id", "section", "item_id", "item", "item_detail", "original_hpo",
               "original_hpo_now", "proposed_change", "proposed_note", "question_for_reviewers", "decision", "decision_label", "comment",
               "reviewer", "reviewer_role", "updated_at", "exported_at", "site_build"]


def csv_row(it, titles, build, decision, reviewer):
    survey = "Health Survey" if it["id"].startswith("HS.") else "Seizure Survey"
    p = it.get("proposal") or {}
    return ["h2t-review-1", survey, it["stage"], titles.get(it["stage"], ""), it["id"], it["text"], it["detail"],
            it["hpo_printed"], it.get("hpo_now", ""), p.get("label", ""), p.get("note", ""), it.get("question", ""),
            decision.get("code", ""), decision.get("label", ""), decision.get("comment", ""),
            reviewer.get("name", ""), reviewer.get("role", ""), decision.get("updated_at", ""), "", build["date"]]


def question_row(q, build, answer):
    return ["h2t-review-1", "Open questions", "open-questions", "Open questions", "OQ." + q["id"], q["question"],
            q.get("context", ""), "", "", "", "", "", "", "", answer.get("comment", ""), "", "", answer.get("updated_at", ""), "", build["date"]]
