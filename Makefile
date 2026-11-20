# Common tasks. Requires Python 3.10 or newer and PyYAML (pip install -r requirements.txt).
PY ?= python3

.PHONY: fetch check build serve clean

fetch:   ## Download the pinned HPO release files into .cache/hpo
	$(PY) scripts/fetch_hpo.py
	$(PY) scripts/fetch_ecto.py

check: fetch   ## Validate content against the pinned HPO release and the wording rules
	$(PY) scripts/build.py --check-only

build: fetch   ## Build the site into _site/
	$(PY) scripts/build.py

serve: build   ## Build, then serve _site/ at http://localhost:8000
	$(PY) -m http.server 8000 --directory _site

clean:
	rm -rf _site
