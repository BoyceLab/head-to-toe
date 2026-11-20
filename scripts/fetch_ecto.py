"""Download the pinned ECTO release into .cache/ecto/<release>/ecto.obo.

ECTO is optional for the build: without it, ECTO codes in content/survey/exposures.yaml are checked for
form only and the exposure search is left out. So a failed download prints a note and exits 0.
"""
import pathlib, urllib.request, yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
URLS = [
    "http://purl.obolibrary.org/obo/ecto/releases/{tag}/ecto.obo",
    "https://github.com/EnvironmentOntology/environmental-exposure-ontology/releases/download/v{tag}/ecto.obo",
]


def main():
    tag = str(yaml.safe_load((ROOT / "config.yaml").read_text()).get("ecto_release") or "")
    if not tag:
        print("No ecto_release in config.yaml; skipping ECTO.")
        return
    dest = ROOT / ".cache" / "ecto" / tag / "ecto.obo"
    if dest.exists() and dest.stat().st_size > 0:
        print(f"have {dest.relative_to(ROOT)}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    for url in URLS:
        url = url.format(tag=tag)
        try:
            print(f"downloading {url}")
            urllib.request.urlretrieve(url, dest)
            if dest.stat().st_size > 0:
                print(f"ECTO release {tag} is in {dest.relative_to(ROOT)}")
                return
        except Exception as exc:  # network errors, missing release
            print(f"  could not download: {exc}")
        dest.unlink(missing_ok=True)
    print(f"Note: ECTO release {tag} could not be downloaded. The build will check ECTO codes for form only. "
          f"To add it by hand, save ecto.obo for that release as {dest.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
