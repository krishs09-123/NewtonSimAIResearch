# Release checklist

Steps to publish a versioned, Zenodo-archived release of this repository. The
Zenodo integration must be enabled **before** the GitHub release is published,
because Zenodo only archives releases created after the repository is toggled on.

## Pre-release (on `zenodo-release-prep`, then merged to `main`)

- [ ] Research-data validation passes: `python scripts/validate_research_data.py` (exit 0)
- [ ] `.zenodo.json` is valid JSON
- [ ] `CITATION.cff` validates against CFF schema (`cffconvert --validate`)
- [ ] Manifest regenerated and verified: `python scripts/build_manifest.py` (clean)
- [ ] Secret scan clean (no keys, no `.env`, no tokens)
- [ ] No `.env` or `node_modules/` tracked
- [ ] README statements match repository contents; no broken relative links
- [ ] Third-party FCI images are not present in the snapshot
- [ ] License plan reflected in `LICENSE_SCOPE.md`, `LICENSES/`, `.zenodo.json`,
      `CITATION.cff`
- [ ] Version numbers agree across `CITATION.cff`, `.zenodo.json`, `CHANGELOG.md`,
      `RELEASE_NOTES.md`
- [ ] PR reviewed and merged to `main`

## Enable Zenodo (manual, by the repository owner)

- [ ] Sign in to Zenodo (https://zenodo.org) and connect the GitHub account
- [ ] Open the Zenodo GitHub integration page and click **Sync now**
- [ ] Find `krishs09-123/NewtonSimAIResearch` and toggle it **ON**
- [ ] Refresh and confirm it is enabled

## Publish the release

- [ ] `main` is up to date and the working tree is clean
- [ ] Re-run all validations
- [ ] Determine the next unused version (no existing tag/release is overwritten)
- [ ] Create an **annotated** Git tag
- [ ] Create a **non-prerelease** GitHub release from `RELEASE_NOTES.md`, target `main`, marked latest

## Post-release (Zenodo DOI)

- [ ] Wait for Zenodo to process the release
- [ ] Confirm the version DOI resolves and the record contains the expected files
- [ ] Verify creator, title, version, description, access status, and license
- [ ] Verify no third-party FCI material was incorrectly licensed
- [ ] Add the Zenodo DOI badge + DOI section to `README.md`
- [ ] Add the version DOI to `CITATION.cff`
- [ ] Add `docs/IOP_DATA_AVAILABILITY_TEXT.md` with the data-availability statement
- [ ] Commit the post-release metadata update ("Add Zenodo DOI and IOP data-availability text")
