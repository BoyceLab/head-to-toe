"""Checks run on every pull request. Each problem names the file and the fix."""
import re

from content import walk_items

ITEM_FIELDS = {"hpo", "plain", "description", "show_when", "from_a_report", "opens_module", "more_specific", "asks_frequency"}
# Branches of HPO that describe how a finding behaves rather than the finding itself.
NOT_FINDINGS = {"HP:0012823": "Clinical modifier", "HP:0000005": "Mode of inheritance", "HP:0040279": "Frequency"}
SHOW_WHEN = {"childhood", "school", "teen", "adult", "female", "male", "femaleteen"}
MODULES = {"epilepsy", "als"}
QUESTION_TYPES = {"single", "multi", "onset", "text"}
PER_CHOICE_TYPES = {"single", "onset"}
ANSWERS = {"yes", "no", "unsure"}
SOURCES = {"doctor", "report", "family"}
TOKENS = {"you", "You", "your", "HasHad", "have_has", "were_was", "is_are", "Is_Are"}
HPO_ID = re.compile(r"^HP:\d{7}$")


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def error(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")


def _strings(obj, path=""):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from _strings(v, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _strings(v, f"{path}[{i}]")


def _bools(obj, path=""):
    """Yes and No without quotes become true and false in YAML."""
    if isinstance(obj, bool):
        yield path
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("from_a_report", "asks_frequency"):
                continue
            yield from _bools(v, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _bools(v, f"{path}[{i}]")


def check_term(r, where, hid, onto, phenotype=True):
    if not isinstance(hid, str) or not HPO_ID.match(hid):
        r.error(where, f"'{hid}' is not an HPO identifier of the form HP:0000000.")
        return False
    t = onto.terms.get(hid)
    if not t:
        r.error(where, f"{hid} is not in HPO release {onto.version}.")
        return False
    if t["obs"]:
        hint = f" It was replaced by {t['rep']} ({onto.label(t['rep'])})." if t["rep"] else ""
        r.error(where, f"{hid} is obsolete in HPO release {onto.version}.{hint}")
        return False
    return True


def check_items(r, where, items, onto):
    seen = {}
    for it, parent in walk_items(items):
        w = f"{where} item {it.get('hpo')}"
        extra = set(it) - ITEM_FIELDS
        if extra:
            r.error(w, f"unknown field(s) {sorted(extra)}. Allowed: {sorted(ITEM_FIELDS)}.")
        if not it.get("plain") or not isinstance(it.get("plain"), str):
            r.error(w, "needs plain wording in the plain field.")
        if check_term(r, w, it.get("hpo"), onto):
            anc = onto.ancestors(it["hpo"])
            for root, name in NOT_FINDINGS.items():
                if root in anc:
                    r.error(w, f"{it['hpo']} ({onto.label(it['hpo'])}) is under {name}, which describes a finding rather than being one. Use a term under Phenotypic abnormality.")
        if it.get("hpo") in seen:
            r.error(w, f"appears twice in this file (also under {seen[it['hpo']]}). Keep one.")
        seen[it.get("hpo")] = parent.get("hpo") if parent else "the top level"
        if it.get("show_when") and it["show_when"] not in SHOW_WHEN:
            r.error(w, f"show_when must be one of {sorted(SHOW_WHEN)}.")
        if it.get("opens_module") and it["opens_module"] not in MODULES:
            r.error(w, f"opens_module must be one of {sorted(MODULES)}.")
        for flag in ("from_a_report", "asks_frequency"):
            if flag in it and not isinstance(it[flag], bool):
                r.error(w, f"{flag} must be true or false.")


def check_tokens(r, where, text):
    for tok in re.findall(r"\{(\w+)\}", text):
        if tok not in TOKENS:
            r.error(where, f"placeholder {{{tok}}} is not one of {sorted(TOKENS)}.")


def run(files, onto, config):
    r = Report()
    rules = [(re.compile(x["pattern"], re.I), x["message"]) for x in config.get("style_rules", [])]
    system_keys, bank_terms = set(), set()

    for path, f in files.items():
        if path in TRANSCRIPTIONS:
            continue
        for b in _bools(f):
            r.error(path, f"{b} is read as true or false. Put Yes, No, On, or Off in quotes, for example 'Yes'.")
        for p, s in _strings(f):
            for rx, msg in rules:
                m = rx.search(s)
                if m:
                    r.error(f"{path} {p}", f"wording rule: found '{m.group(0)}'. {msg}")
            check_tokens(r, f"{path} {p}", s)

    for path, f in files.items():
        if path.startswith("content/survey/systems/"):
            for k in ("key", "title", "question", "examples", "items"):
                if not f.get(k):
                    r.error(path, f"missing {k}.")
            if f.get("key") in system_keys:
                r.error(path, f"key '{f.get('key')}' is used by another system file.")
            system_keys.add(f.get("key"))
            check_items(r, path, f.get("items"), onto)
            bank_terms |= {it.get("hpo") for it, _ in walk_items(f.get("items"))}
        elif path.startswith("content/survey/modules/"):
            if f.get("module") not in MODULES:
                r.error(path, f"module must be one of {sorted(MODULES)}.")
            qs = {q["key"]: q for s in f.get("steps", []) for q in s.get("questions", [])}
            qkeys = set(qs)
            for s in f.get("steps", []):
                w = f"{path} step {s.get('key')}"
                if s.get("items"):
                    check_items(r, w, s["items"], onto)
                    bank_terms |= {it.get("hpo") for it, _ in walk_items(s["items"])}
                for cond in [s.get("show_when")] + [q.get("show_when") for q in s.get("questions", [])]:
                    if not cond:
                        continue
                    key, _, vals = cond.partition(":")
                    if key not in qkeys:
                        r.error(w, f"show_when '{cond}' must start with a question key in this module, then a colon and an answer.")
                        continue
                    opts = qs[key].get("options") or []
                    for v in vals.lstrip("!").split("|"):
                        if opts and v not in opts:
                            r.error(w, f"show_when '{cond}' names '{v}', which is not an option of {key}.")
                for q in s.get("questions", []):
                    qw = f"{w} question {q.get('key')}"
                    if q.get("type") not in QUESTION_TYPES:
                        r.error(qw, f"type must be one of {sorted(QUESTION_TYPES)}.")
                    if q.get("type") in ("single", "multi") and not q.get("options"):
                        r.error(qw, "needs options.")
                    for pc in q.get("per_choice") or []:
                        if q.get("type") != "multi":
                            r.error(qw, "per_choice works only with a multi question.")
                        if pc.get("type") not in PER_CHOICE_TYPES or not pc.get("key") or not pc.get("question"):
                            r.error(qw, f"each per_choice entry needs key, question, and type ({sorted(PER_CHOICE_TYPES)}).")
                        if pc.get("type") == "single" and not pc.get("options"):
                            r.error(qw, f"per_choice {pc.get('key')} needs options.")
                    for ans, hid in (q.get("hpo_by_answer") or {}).items():
                        if ans not in (q.get("options") or []):
                            r.error(qw, f"hpo_by_answer names '{ans}', which is not one of the options.")
                        check_term(r, qw, hid, onto)
        elif path == "content/survey/onset.yaml":
            for o in f.get("onset_bands", []):
                check_term(r, path, o.get("hpo"), onto)

    onsets = {o["hpo"] for o in files["content/survey/onset.yaml"]["onset_bands"]}
    for path, f in files.items():
        if not path.startswith("content/examples/"):
            continue
        for k, v in (f.get("screen") or {}).items():
            if k not in system_keys:
                r.error(path, f"screen key '{k}' is not a system key.")
            if v not in ANSWERS:
                r.error(path, f"screen answer for {k} must be yes, no, or unsure, in quotes.")
        for h, a in (f.get("answers") or {}).items():
            w = f"{path} answer {h}"
            check_term(r, w, h, onto)
            if h not in bank_terms:
                r.warn(w, "this term is not in the survey, so the example answer is never shown.")
            if a.get("answer") not in ANSWERS:
                r.error(w, "answer must be yes, no, or unsure, in quotes.")
            if a.get("onset") and a["onset"] not in onsets:
                r.error(w, "onset must be one of the HPO terms in content/survey/onset.yaml.")
            if a.get("source") and a["source"] not in SOURCES:
                r.error(w, f"source must be one of {sorted(SOURCES)}.")

    orig = files.get("content/original/health-survey-2018.yaml")
    cw = files.get("content/original/crosswalk.yaml")
    if orig and cw:
        types = cw.get("change_types", {})
        mapped = {}
        for sec in cw.get("sections", []):
            for row in sec.get("rows", []):
                key = (sec["section"], row.get("original"))
                w = f"content/original/crosswalk.yaml {key[0]} / {key[1]}"
                if key in mapped:
                    r.error(w, "appears twice.")
                mapped[key] = row
                if row.get("change") not in types:
                    r.error(w, f"change must be one of {sorted(types)}.")
                targets = row.get("redesign") or []
                if row.get("change") in ("dropped", "answer") and targets:
                    r.error(w, "a dropped row or answer option has no redesign terms; leave redesign empty.")
                if row.get("change") not in ("dropped", "answer") and not targets:
                    r.error(w, "needs at least one redesign term.")
                for h in targets:
                    if check_term(r, w, h, onto) and h not in bank_terms:
                        r.error(w, f"{h} is not in the redesigned survey.")
        known = {(sec["key"], row["answer"]) for sec in orig.get("detail", []) for row in sec.get("rows", [])}
        for key in mapped:
            if key not in known:
                r.error(f"content/original/crosswalk.yaml {key[0]} / {key[1]}",
                        "does not match any answer in health-survey-2018.yaml. Copy the answer label exactly.")
        for sec in orig.get("detail", []):
            for row in sec.get("rows", []):
                if (sec["key"], row["answer"]) not in mapped:
                    r.error("content/original/crosswalk.yaml", f"no row for '{row['answer']}' in section {sec['key']}.")
    check_seizure_crosswalk(r, files, bank_terms)
    check_review(r, files)
    return r


PAGES = {"you", "testing", "family", "more", "review"}
TRANSCRIPTIONS = {"content/original/health-survey-2018.yaml", "content/original/seizure-survey-v1.3.yaml"}


def check_review(r, files):
    import review_items
    dec = files.get("content/review/decisions.yaml") or {}
    codes = [d.get("code") for d in dec.get("decisions", [])]
    if len(codes) != len(set(codes)) or not all(codes):
        r.error("content/review/decisions.yaml", "every decision needs a code, and codes must be different.")
    for d in dec.get("decisions", []):
        if not d.get("label"):
            r.error("content/review/decisions.yaml", f"decision {d.get('code')} needs a label.")
    oq = files.get("content/review/open-questions.yaml") or {}
    ids = [q.get("id") for q in oq.get("questions", [])]
    if len(ids) != len(set(ids)) or not all(ids):
        r.error("content/review/open-questions.yaml", "every question needs an id, and ids must be different.")
    cw = files.get("content/original/crosswalk.yaml") or {}
    types = cw.get("change_types", {})
    known = {"intro." + i for i in review_items.INTRO_IDS} | {"end." + i for i in review_items.END_IDS} | {"wide." + w[0] for w in review_items.WIDE}
    have = set()
    for o in cw.get("other_items", []):
        w = f"content/original/crosswalk.yaml other_items {o.get('id')}"
        if o.get("id") not in known:
            r.error(w, f"id must be one of {sorted(known)}.")
        if o.get("change") not in types:
            r.error(w, f"change must be one of {sorted(types)}.")
        have.add(o.get("id"))
    for k in sorted(known - have):
        r.error("content/original/crosswalk.yaml", f"other_items has no entry for {k}.")


def check_seizure_crosswalk(r, files, bank_terms):
    """The seizure survey comparison is optional; check it only when both files are present."""
    orig = files.get("content/original/seizure-survey-v1.3.yaml")
    cw = files.get("content/original/seizure-crosswalk.yaml")
    if not (orig and cw):
        return
    where = "content/original/seizure-crosswalk.yaml"
    mod = files.get("content/survey/modules/epilepsy.yaml", {})
    mod_q = {q["key"] for s in mod.get("steps", []) for q in s.get("questions", [])}
    types = cw.get("change_types", {})
    pages = {p["key"]: {q["key"]: q for q in p.get("questions", [])} for p in orig.get("pages", [])}
    covered = set()
    for pg in cw.get("pages", []):
        qs = pages.get(pg.get("page"))
        if qs is None:
            r.error(where, f"page '{pg.get('page')}' is not a page key in seizure-survey-v1.3.yaml.")
            continue
        for row in pg.get("rows", []):
            o = str(row.get("original", ""))
            w = f"{where} {pg['page']} / {o}"
            key = o.split(":")[0].split(" ")[0]
            if key != "all" and key not in qs:
                r.error(w, f"'{key}' is not a question key on this page.")
                continue
            covered.add((pg["page"], key))
            if ": " in o and key in qs:
                opt = o.split(": ", 1)[1]
                labels = [x["label"] if isinstance(x, dict) else x for x in qs[key].get("options", [])]
                if opt not in labels:
                    r.error(w, f"'{opt}' is not an option of {key}.")
            if row.get("change") not in types:
                r.error(w, f"change must be one of {sorted(types)}.")
            for t in row.get("redesign") or []:
                if t.startswith("q:"):
                    if t[2:] not in mod_q:
                        r.error(w, f"{t} is not a question key in the epilepsy module.")
                elif t.startswith("page:"):
                    if t[5:] not in PAGES:
                        r.error(w, f"{t} must be one of {sorted('page:' + p for p in PAGES)}.")
                elif t not in bank_terms:
                    r.error(w, f"{t} is not in the redesigned survey.")
    for page, qs in pages.items():
        for key in qs:
            if (page, key) not in covered:
                r.error(where, f"no row for question '{key}' on page {page}.")
