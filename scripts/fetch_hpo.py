"""Download the pinned Human Phenotype Ontology release files into .cache/hpo/<release>/."""
import pathlib, sys, urllib.request, yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ["hp.obo", "phenotype.hpoa", "genes_to_disease.txt"]  # the last is used only by coverage_example.py
BASE = "https://github.com/obophenotype/human-phenotype-ontology/releases/download/{tag}/{name}"


def main():
    tag = yaml.safe_load((ROOT / "config.yaml").read_text())["hpo_release"]
    out = ROOT / ".cache" / "hpo" / tag
    out.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        dest = out / name
        if dest.exists() and dest.stat().st_size > 0:
            print(f"have {dest.relative_to(ROOT)}")
            continue
        url = BASE.format(tag=tag, name=name)
        print(f"downloading {url}")
        try:
            urllib.request.urlretrieve(url, dest)
        except Exception as exc:  # network errors, missing release
            dest.unlink(missing_ok=True)
            sys.exit(f"Could not download {name} for release {tag}: {exc}")
    print(f"HPO release {tag} is in {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
