#!/usr/bin/env python3
"""Build (or verify) MANIFEST.sha256 for the release snapshot.

MANIFEST.sha256 lists a SHA-256 for every file included in the release
snapshot, sorted by path for determinism, in `sha256sum` format:

    <hex-digest>  <relative/path>

Excluded from the manifest:
  - .git/ and the MANIFEST.sha256 file itself
  - node_modules/ and Python caches (__pycache__/, *.pyc)
  - runtime "generated/" folders and editor/OS cruft (.cursor/, .DS_Store, Thumbs.db)
  - environment files (.env; .env.example is kept — it is a template, not a secret)
  - temporary/cache files (*.tmp, *.log, *.bak, *~)

Usage:
  python scripts/build_manifest.py           # write MANIFEST.sha256
  python scripts/build_manifest.py --check    # verify tree matches MANIFEST.sha256
"""

import hashlib
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(REPO_ROOT, "MANIFEST.sha256")

EXCLUDE_DIR_NAMES = {".git", "node_modules", "__pycache__", "generated", ".cursor"}
EXCLUDE_FILE_NAMES = {"MANIFEST.sha256", ".env", ".DS_Store", "Thumbs.db"}
EXCLUDE_SUFFIXES = (".pyc", ".tmp", ".log", ".bak", "~")


def included_files():
    files = []
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        # prune excluded directories in-place
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIR_NAMES]
        for fn in filenames:
            if fn in EXCLUDE_FILE_NAMES:
                continue
            if fn.endswith(EXCLUDE_SUFFIXES):
                continue
            abspath = os.path.join(dirpath, fn)
            rel = os.path.relpath(abspath, REPO_ROOT).replace(os.sep, "/")
            files.append(rel)
    files.sort()
    return files


def sha256_of(rel):
    h = hashlib.sha256()
    with open(os.path.join(REPO_ROOT, rel), "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def build():
    lines = [f"{sha256_of(rel)}  {rel}\n" for rel in included_files()]
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(lines)
    print(f"Wrote {MANIFEST} with {len(lines)} entries.")
    return 0


def check():
    if not os.path.exists(MANIFEST):
        print("MANIFEST.sha256 not found; run without --check to build it.")
        return 2
    recorded = {}
    with open(MANIFEST, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            digest, rel = line.split("  ", 1)
            recorded[rel] = digest
    current = set(included_files())
    problems = []
    for rel in sorted(current | set(recorded)):
        in_rec = rel in recorded
        in_cur = rel in current
        if in_rec and not in_cur:
            problems.append(f"MISSING (in manifest, not on disk): {rel}")
        elif in_cur and not in_rec:
            problems.append(f"UNTRACKED (on disk, not in manifest): {rel}")
        else:
            if sha256_of(rel) != recorded[rel]:
                problems.append(f"CHANGED (hash differs): {rel}")
    if problems:
        print(f"MANIFEST CHECK FAILED ({len(problems)} problem(s)):")
        for p in problems:
            print("  - " + p)
        return 1
    print(f"MANIFEST CHECK PASSED: {len(current)} files match MANIFEST.sha256.")
    return 0


def main():
    if "--check" in sys.argv[1:]:
        return check()
    return build()


if __name__ == "__main__":
    sys.exit(main())
