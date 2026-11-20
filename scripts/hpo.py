"""Read the Human Phenotype Ontology release files: terms, annotations, and gene links."""
import collections
import csv
import re

PHENOTYPIC_ABNORMALITY = "HP:0000118"


class Ontology:
    def __init__(self, obo_path):
        self.terms = {}
        self.version = ""
        cur = None
        with open(obo_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.rstrip("\n")
                if line.startswith("data-version:"):
                    self.version = line.split("/")[-1].strip()
                if line == "[Term]":
                    cur = {"syn": [], "lay": [], "is_a": [], "obs": False, "rep": None, "name": ""}
                    continue
                if line.startswith("["):
                    cur = None
                    continue
                if cur is None:
                    continue
                if line.startswith("id: "):
                    cur["id"] = line[4:]
                    self.terms[cur["id"]] = cur
                elif line.startswith("name: "):
                    cur["name"] = line[6:]
                elif line.startswith("is_a: "):
                    cur["is_a"].append(line[6:16])
                elif line.startswith("is_obsolete: true"):
                    cur["obs"] = True
                elif line.startswith("replaced_by: "):
                    cur["rep"] = line[13:].strip()
                elif line.startswith("synonym: "):
                    m = re.match(r'synonym: "(.*)" ', line)
                    if m:
                        cur["syn"].append(m.group(1))
                        if "layperson" in line:
                            cur["lay"].append(m.group(1))
        self._anc = {}
        self._kids = collections.defaultdict(list)
        for tid, t in self.terms.items():
            for p in t["is_a"]:
                self._kids[p].append(tid)

    def label(self, tid):
        t = self.terms.get(tid)
        return t["name"] if t else None

    def ancestors(self, tid):
        """The term and every ancestor through is_a links."""
        if tid in self._anc:
            return self._anc[tid]
        out = {tid}
        stack = list(self.terms.get(tid, {}).get("is_a", []))
        while stack:
            p = stack.pop()
            if p in out:
                continue
            out.add(p)
            stack.extend(self.terms.get(p, {}).get("is_a", []))
        self._anc[tid] = out
        return out

    def descendants(self, tid):
        out, stack = set(), [tid]
        while stack:
            x = stack.pop()
            if x in out:
                continue
            out.add(x)
            stack.extend(self._kids.get(x, []))
        return out


def load_annotations(hpoa_path, onto):
    """Disease id -> set of positive phenotype terms with ancestors; disease id -> name; file version."""
    terms = collections.defaultdict(set)
    names = {}
    version = ""
    with open(hpoa_path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#version:"):
                version = line.split(":", 1)[1].strip()
            if line.startswith("#") or line.startswith("database_id"):
                continue
            f = line.rstrip("\n").split("\t")
            did, name, qual, hid, aspect = f[0], f[1], f[2], f[3], f[10]
            names[did] = name
            if qual == "NOT" or aspect != "P":
                continue
            t = onto.terms.get(hid)
            if t and not t["obs"]:
                terms[did] |= onto.ancestors(hid)
    return terms, names, version


def load_gene_links(path):
    genes = collections.defaultdict(set)
    with open(path, encoding="utf-8") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            genes[row["disease_id"]].add(row["gene_symbol"])
    return genes
