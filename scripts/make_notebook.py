"""Write notebooks/combine_reviews.ipynb from the cell sources below.

Edit the cells here, then run: python scripts/make_notebook.py
Keeping the source in a script makes changes to the notebook easy to review in a pull request.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "notebooks" / "combine_reviews.ipynb"

CELLS = []


def md(text):
    CELLS.append({"cell_type": "markdown", "metadata": {}, "source": text.strip("\n")})


def code(text):
    CELLS.append({"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": text.strip("\n")})


md("""
# Combine reviewers' annotations of the original surveys

This notebook combines the review files downloaded from the **Review the original surveys** page of the head-to-toe survey redesign. Each reviewer marks every item of the GenomeConnect Health Survey and Seizure Survey as *Keep all of it*, *Keep some of it*, *Reject it*, or *Not sure*, with optional comments, and comments on the open questions.

**What it produces**

- one table of every answer from every reviewer
- a summary for each item: how reviewers split, whether they reached consensus, how often pairs of reviewers agreed, and every comment
- a list of items that need discussion
- a summary for each section, and every comment on the open questions
- an Excel workbook and CSV files, in two versions: one with reviewer names, and one with names replaced by codes (R01, R02, and so on)

**How to run it in Google Colab**

1. Choose **Runtime > Run all**.
2. When the file picker appears under the second code cell, choose every reviewer's CSV or JSON file at once.
3. The last cell offers a zip of the results for download.

To read the files from a Google Drive folder instead, set `SOURCE = "drive"` and `DRIVE_FOLDER` in the settings cell. To run it on your own computer in Jupyter, put the files in a folder named `reviews` beside the notebook and set `SOURCE = "folder"`.

Review files can contain reviewers' names. Keep the identified outputs within the review group, and share the de-identified versions more widely. Read comments before sharing them, since a comment can name a person.
""")

code('''
# Settings
CONSENSUS = 0.70        # share of reviewers with a decision who must agree for an item to reach consensus
MIN_REVIEWERS = 2       # items with fewer decisions than this are marked as needing more reviews
SOURCE = "upload"       # "upload" (Colab file picker), "drive" (a Google Drive folder), or "folder" (a local folder)
DRIVE_FOLDER = "/content/drive/MyDrive/h2t-reviews"
LOCAL_FOLDER = "reviews"
OUTPUT_FOLDER = "combined_reviews"

DECISIONS = {           # codes written by the review page, and the order used in summaries
    "keep_all": "Keep all of it",
    "keep_some": "Keep some of it",
    "reject": "Reject it",
    "unsure": "Not sure",
}
DECIDED = ["keep_all", "keep_some", "reject"]   # counted toward consensus; Not sure and blanks are reported separately
''')

code('''
import io, json, pathlib, zipfile, datetime
import pandas as pd

try:
    import google.colab  # noqa: F401
    IN_COLAB = True
except ImportError:
    IN_COLAB = False

files = {}   # file name -> bytes
if SOURCE == "upload":
    if not IN_COLAB:
        raise SystemExit('SOURCE = "upload" works only in Google Colab. Set SOURCE = "folder" to read a local folder.')
    from google.colab import files as colab_files
    files = colab_files.upload()
elif SOURCE == "drive":
    if IN_COLAB:
        from google.colab import drive
        drive.mount("/content/drive")
    for p in sorted(pathlib.Path(DRIVE_FOLDER).glob("*")):
        if p.suffix.lower() in (".csv", ".json"):
            files[p.name] = p.read_bytes()
else:
    for p in sorted(pathlib.Path(LOCAL_FOLDER).glob("*")):
        if p.suffix.lower() in (".csv", ".json"):
            files[p.name] = p.read_bytes()

print(f"Found {len(files)} review file(s):")
for name in files:
    print("  ", name)
if not files:
    raise SystemExit("No CSV or JSON review files were found. Check SOURCE and the folder settings.")
''')

code('''
COLUMNS = ["survey", "section_id", "section", "item_id", "item", "item_detail", "original_hpo", "original_hpo_now",
           "proposed_change", "proposed_note", "question_for_reviewers", "decision", "comment",
           "reviewer", "reviewer_role", "updated_at", "source_file"]


def read_csv_review(name, data):
    df = pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False, encoding="utf-8-sig")
    if "item_id" not in df.columns or "decision" not in df.columns:
        raise ValueError(f"{name} does not look like a review file from the review page.")
    df["source_file"] = name
    return df


def read_json_review(name, data):
    j = json.loads(data.decode("utf-8-sig"))
    if not str(j.get("format", "")).startswith("h2t-review"):
        raise ValueError(f"{name} does not look like a review file from the review page.")
    rv = j.get("reviewer", {})
    rows = []
    for it in j.get("items", []):
        rows.append({**it, "reviewer": rv.get("name", ""), "reviewer_role": rv.get("role", "")})
    for q in j.get("open_questions", []):
        rows.append({"item_id": q.get("item_id", ""), "survey": "Open questions", "section_id": "open-questions",
                     "section": "Open questions", "item": q.get("question", ""), "decision": "",
                     "comment": q.get("comment", ""), "updated_at": q.get("updated_at", ""),
                     "reviewer": rv.get("name", ""), "reviewer_role": rv.get("role", "")})
    df = pd.DataFrame(rows).astype(str)
    df["source_file"] = name
    return df


frames, problems = [], []
for name, data in files.items():
    try:
        frames.append(read_json_review(name, data) if name.lower().endswith(".json") else read_csv_review(name, data))
    except Exception as exc:
        problems.append(f"{name}: {exc}")
for p in problems:
    print("Skipped", p)

raw = pd.concat(frames, ignore_index=True)
for c in COLUMNS:
    if c not in raw.columns:
        raw[c] = ""
raw = raw[COLUMNS].fillna("")
raw = raw.replace({"nan": ""})
raw["reviewer"] = raw["reviewer"].str.strip()
blank_name = raw["reviewer"] == ""
raw.loc[blank_name, "reviewer"] = "Unnamed (" + raw.loc[blank_name, "source_file"] + ")"
raw["decision"] = raw["decision"].str.strip().str.lower()
unknown = sorted(set(raw["decision"]) - set(DECISIONS) - {""})
if unknown:
    print("Decision codes not in DECISIONS were treated as blank:", unknown)
    raw.loc[raw["decision"].isin(unknown), "decision"] = ""

# Remember the order items appear in the files, and which files each reviewer sent.
file_order = {k: i for i, k in enumerate(raw["item_id"].drop_duplicates())}
files_by_reviewer = raw.groupby("reviewer")["source_file"].agg(lambda s: ", ".join(sorted(set(s))))

# One answer per reviewer per item: when a reviewer sent more than one file, keep the most recently updated answer.
raw["_t"] = pd.to_datetime(raw["updated_at"], errors="coerce", utc=True)
raw["_has"] = (raw["decision"] != "") | (raw["comment"].str.strip() != "")
raw = raw.sort_values(["reviewer", "item_id", "_has", "_t"], na_position="first")
dupes = raw.duplicated(["reviewer", "item_id"], keep="last").sum()
answers = raw.drop_duplicates(["reviewer", "item_id"], keep="last").drop(columns=["_t", "_has"]).reset_index(drop=True)
if dupes:
    print(f"{dupes} duplicate answers from reviewers who sent more than one file were replaced by their latest answer.")

# Item text comes from the files; keep one copy per item.
item_cols = ["survey", "section_id", "section", "item_id", "item", "item_detail", "original_hpo", "original_hpo_now",
             "proposed_change", "proposed_note", "question_for_reviewers"]
items = (answers.assign(_len=answers["item"].str.len()).sort_values("_len", ascending=False)
         .drop_duplicates("item_id")[item_cols])
items = items.assign(_o=items["item_id"].map(file_order)).sort_values("_o").drop(columns="_o").reset_index(drop=True)
print(f"{answers['reviewer'].nunique()} reviewer(s), {items['item_id'].nunique()} items and open questions.")
''')

code('''
# Reviewers, with codes for the de-identified outputs
reviewers = (answers.groupby("reviewer")
             .agg(role=("reviewer_role", lambda s: next((x for x in s if x), "")),
                  decisions=("decision", lambda s: int((s != "").sum())),
                  comments=("comment", lambda s: int((s.str.strip() != "").sum())))
             .reset_index())
reviewers["files"] = reviewers["reviewer"].map(files_by_reviewer)
reviewers.insert(0, "code", [f"R{i + 1:02d}" for i in range(len(reviewers))])
CODE = dict(zip(reviewers["reviewer"], reviewers["code"]))
answers["reviewer_code"] = answers["reviewer"].map(CODE)
reviewers
''')

code('''
# Item by item summary
decided = answers[answers["section_id"] != "open-questions"].copy()
counts = pd.crosstab(decided["item_id"], decided["decision"]).reindex(columns=list(DECISIONS) + [""], fill_value=0)
counts = counts.rename(columns={"": "no_decision"})
summary = items[items["section_id"] != "open-questions"].merge(counts, left_on="item_id", right_index=True, how="left").fillna(0)
for c in list(DECISIONS) + ["no_decision"]:
    summary[c] = summary[c].astype(int)
summary["n_decided"] = summary[DECIDED].sum(axis=1)


def share(row, code):
    return round(row[code] / row["n_decided"], 3) if row["n_decided"] else None


for c in DECIDED:
    summary["share_" + c] = summary.apply(lambda r, c=c: share(r, c), axis=1)
summary["share_keep_any"] = summary.apply(lambda r: round((r["keep_all"] + r["keep_some"]) / r["n_decided"], 3) if r["n_decided"] else None, axis=1)


def top(row):
    if not row["n_decided"]:
        return "", None
    best = max(DECIDED, key=lambda c: row[c])
    return best, round(row[best] / row["n_decided"], 3)


summary[["top_decision", "top_share"]] = summary.apply(lambda r: pd.Series(top(r)), axis=1)


def pairwise(row):
    n = row["n_decided"]
    if n < 2:
        return None
    return round(sum(row[c] * (row[c] - 1) for c in DECIDED) / (n * (n - 1)), 3)


summary["pairwise_agreement"] = summary.apply(pairwise, axis=1)


def status(row):
    if row["n_decided"] < MIN_REVIEWERS:
        return "Needs more reviews"
    if row["top_share"] is not None and row["top_share"] >= CONSENSUS:
        return "Consensus: " + DECISIONS[row["top_decision"]]
    return "No consensus"


summary["status"] = summary.apply(status, axis=1)
summary["top_decision"] = summary["top_decision"].map(lambda c: DECISIONS.get(c, ""))


def comment_block(df, use_codes):
    out = []
    for _, r in df.iterrows():
        if r["comment"].strip():
            who = r["reviewer_code"] if use_codes else r["reviewer"]
            label = DECISIONS.get(r["decision"], "No decision")
            out.append(f"{who} ({label}): {r['comment'].strip()}")
    return "\\n".join(out)


by_item = {k: g for k, g in decided.groupby("item_id")}
summary["comments"] = summary["item_id"].map(lambda k: comment_block(by_item[k], False) if k in by_item else "")
summary["comments_coded"] = summary["item_id"].map(lambda k: comment_block(by_item[k], True) if k in by_item else "")
summary["n_comments"] = summary["comments"].map(lambda s: len(s.splitlines()) if s else 0)

has_reject_comment = summary["item_id"].map(
    lambda k: bool(k in by_item and ((by_item[k]["decision"] == "reject") & (by_item[k]["comment"].str.strip() != "")).any()))
summary["needs_discussion"] = (summary["status"] == "No consensus") | has_reject_comment \\
    | ((summary["question_for_reviewers"] != "") & (summary["n_comments"] > 0))

print(summary["status"].value_counts().to_string())
summary[["item_id", "item", "status", "keep_all", "keep_some", "reject", "unsure", "no_decision", "pairwise_agreement"]].head(15)
''')

code('''
# Fleiss' kappa across every item that all reviewers decided (Not sure and blanks excluded)
def fleiss_kappa(table):
    n = table.sum(axis=1).iloc[0]
    N = len(table)
    p_j = table.sum(axis=0) / (N * n)
    P_i = ((table ** 2).sum(axis=1) - n) / (n * (n - 1))
    P_bar, P_e = P_i.mean(), (p_j ** 2).sum()
    return None if P_e == 1 else (P_bar - P_e) / (1 - P_e)


n_rev = answers["reviewer"].nunique()
complete = summary[summary["n_decided"] == n_rev]
if n_rev >= 2 and len(complete) >= 2:
    kappa = fleiss_kappa(complete[DECIDED].astype(float))
    print(f"Fleiss' kappa across {len(complete)} items decided by all {n_rev} reviewers: {kappa:.2f}" if kappa is not None else "Kappa is undefined: every rating fell in one category.")
else:
    kappa = None
    print("Fleiss' kappa needs at least two reviewers who decided the same items.")
''')

code('''
# Section by section, and the items that need discussion
sections = (summary.groupby(["survey", "section_id", "section"], sort=False)
            .agg(items=("item_id", "count"),
                 consensus_keep_all=("status", lambda s: int((s == "Consensus: Keep all of it").sum())),
                 consensus_keep_some=("status", lambda s: int((s == "Consensus: Keep some of it").sum())),
                 consensus_reject=("status", lambda s: int((s == "Consensus: Reject it").sum())),
                 no_consensus=("status", lambda s: int((s == "No consensus").sum())),
                 needs_more_reviews=("status", lambda s: int((s == "Needs more reviews").sum())),
                 needs_discussion=("needs_discussion", "sum"))
            .reset_index())

discussion = summary[summary["needs_discussion"]][
    ["survey", "section", "item_id", "item", "proposed_change", "proposed_note", "question_for_reviewers", "status",
     "keep_all", "keep_some", "reject", "unsure", "comments", "comments_coded"]]

oq = answers[(answers["section_id"] == "open-questions") & (answers["comment"].str.strip() != "")]
open_questions = (oq.assign(reviewer_role=oq["reviewer_role"])
                  [["item_id", "item", "reviewer", "reviewer_code", "reviewer_role", "comment"]]
                  .rename(columns={"item": "question"}).sort_values(["item_id", "reviewer_code"]))
print(f"{len(discussion)} item(s) need discussion; {open_questions['item_id'].nunique()} open question(s) have comments.")
sections
''')

code('''
# Decisions by section, as shares of every answer (including Not sure and no decision)
import matplotlib.pyplot as plt

parts = ["keep_all", "keep_some", "reject", "unsure", "no_decision"]
colors = ["#16627a", "#7fb3c4", "#a23b2a", "#c9a24a", "#d5dee2"]
tot = summary.groupby("section", sort=False)[parts].sum()
share_tbl = tot.div(tot.sum(axis=1), axis=0)
ax = share_tbl.plot.barh(stacked=True, color=colors, figsize=(9, max(3, 0.32 * len(share_tbl))), width=0.8)
ax.invert_yaxis()
ax.set_xlabel("Share of answers")
ax.set_ylabel("")
ax.set_xlim(0, 1)
ax.legend([DECISIONS.get(p, "No decision") for p in parts], loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=5, frameon=False)
plt.tight_layout()
plt.show()
''')

code('''
# Write the outputs: an identified and a de-identified version of each
out = pathlib.Path(OUTPUT_FOLDER)
out.mkdir(exist_ok=True)
stamp = datetime.date.today().isoformat()

long_id = answers.assign(decision_label=answers["decision"].map(lambda c: DECISIONS.get(c, "")))
long_deid = long_id.drop(columns=["reviewer", "source_file"])
summ_cols = [c for c in summary.columns if c not in ("comments", "comments_coded")]

outputs = {
    "identified": {
        "Item summary": summary[summ_cols + ["comments"]],
        "Needs discussion": discussion.drop(columns=["comments_coded"]),
        "Sections": sections,
        "Open questions": open_questions.drop(columns=["reviewer_code"]),
        "Reviewers": reviewers,
        "All answers": long_id,
    },
    "deidentified": {
        "Item summary": summary[summ_cols + ["comments_coded"]].rename(columns={"comments_coded": "comments"}),
        "Needs discussion": discussion.drop(columns=["comments"]).rename(columns={"comments_coded": "comments"}),
        "Sections": sections,
        "Open questions": open_questions.drop(columns=["reviewer"]),
        "Reviewers": reviewers[["code", "role", "decisions", "comments"]],
        "All answers": long_deid,
    },
}

written = []
for version, sheets in outputs.items():
    xlsx = out / f"review_summary_{version}_{stamp}.xlsx"
    with pd.ExcelWriter(xlsx, engine="openpyxl") as xw:
        for sheet, df in sheets.items():
            df.to_excel(xw, sheet_name=sheet[:31], index=False)
            ws = xw.sheets[sheet[:31]]
            for i, col in enumerate(df.columns, start=1):
                width = min(60, max(10, int(df[col].astype(str).str.len().quantile(0.9)) if len(df) else 10, len(str(col)) + 2))
                ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = width
            ws.freeze_panes = "A2"
    written.append(xlsx)
    for sheet, df in sheets.items():
        p = out / f"{sheet.lower().replace(' ', '_')}_{version}_{stamp}.csv"
        df.to_csv(p, index=False, encoding="utf-8-sig")
        written.append(p)

zip_path = pathlib.Path(f"combined_reviews_{stamp}.zip")
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for p in written:
        z.write(p, f"{out.name}/{p.name}")
print("Wrote:")
for p in written:
    print("  ", p)
print("Zip:", zip_path)
if IN_COLAB:
    from google.colab import files as colab_files
    colab_files.download(str(zip_path))
''')

md("""
## Reading the results

- **Consensus** means the most common decision reached the `CONSENSUS` share of reviewers who made a decision. Set it to the threshold in your review protocol.
- **Pairwise agreement** is the share of reviewer pairs who chose the same decision for an item. It is undefined for items with fewer than two decisions.
- **Fleiss' kappa** summarizes agreement beyond chance across the items every reviewer decided. With few reviewers or few items it moves a great deal from one round to the next, so read it alongside the item counts.
- **Needs discussion** marks items without consensus, items where someone rejected the item and explained why, and items with a question for reviewers that drew comments. Items with fewer than `MIN_REVIEWERS` decisions are marked **Needs more reviews** instead.
- *Not sure* and blank answers are counted and shown, and are left out of consensus and agreement.
""")


def main():
    nb = {"cells": CELLS, "metadata": {"colab": {"provenance": []}, "kernelspec": {"display_name": "Python 3", "name": "python3"},
                                       "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
    for i, c in enumerate(nb["cells"]):
        c["id"] = f"cell-{i:02d}"
        src = c["source"]
        c["source"] = [line + "\n" for line in src.split("\n")[:-1]] + [src.split("\n")[-1]]
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(nb, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
