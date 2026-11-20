"""A small reader for OBO ontology files, used for ECTO. (HPO has its own reader in hpo.py.)"""
import re


class Obo:
    def __init__(self, path):
        self.terms, self.version = {}, ""
        cur = None
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.rstrip("\n")
                if line.startswith("data-version:"):
                    m = re.search(r"\d{4}-\d{2}-\d{2}", line)
                    self.version = m.group(0) if m else line.split(":", 1)[1].strip()
                if line == "[Term]":
                    cur = {"name": "", "syn": [], "is_a": [], "obs": False, "rep": None}
                    continue
                if line.startswith("["):
                    cur = None
                    continue
                if cur is None:
                    continue
                if line.startswith("id: "):
                    cur["id"] = line[4:].strip()
                    self.terms[cur["id"]] = cur
                elif line.startswith("name: "):
                    cur["name"] = line[6:].strip()
                elif line.startswith("is_a: "):
                    cur["is_a"].append(line[6:].split("!")[0].strip())
                elif line.startswith("is_obsolete: true"):
                    cur["obs"] = True
                elif line.startswith("replaced_by: "):
                    cur["rep"] = line[13:].strip()
                elif line.startswith("synonym: "):
                    m = re.match(r'synonym: "(.*)" ', line)
                    if m:
                        cur["syn"].append(m.group(1))

    def label(self, tid):
        t = self.terms.get(tid)
        return t["name"] if t else None
