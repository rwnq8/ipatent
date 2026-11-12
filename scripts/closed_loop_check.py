#!/usr/bin/env python3
"""CLOSED-LOOP-1 (Rowan, 2026-11-12): assume nothing is ever read, reviewed or decided by a person; every loop closes itself.

Runs on every pull request (.github/workflows/closed-loop.yml) and fails when:
  1. AGENTS.md has lost the CLOSED-LOOP-1 rule;
  2. the change adds a Markdown file that no code in the repository reads (a document written for a reader that does not exist);
  3. the change adds a line that parks work for a person to read, review, approve or decide.
Only a credential, money, a legal signature or the owner's own account may wait on the owner, marked IDENTITY-BOUND with a default.
Canonical copy: ultrastable/ultrastable foundation/closedloop.py; fleet copy: QNFO/qnfo-workers scripts/closed_loop_guard.py.

  python3 scripts/closed_loop_check.py [--base origin/main]
"""
import re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CODE = {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".sh", ".yml", ".yaml", ".toml", ".cmd", ".ps1", ".html", ".json"}
PLATFORM = {"README.md", "AGENTS.md", "CLAUDE.md", "SKILL.md", "copilot-instructions.md", "SECURITY.md", "CONTRIBUTING.md",
            "CODE_OF_CONDUCT.md", "CHANGELOG.md", "pull_request_template.md", "LICENSE.md"}
WAIT = [re.compile(p, re.I) for p in (
    r"\b(owner|person|human|rowan|maintainer)\b[^.;]{0,30}\b(must|should|needs? to|will|to)\s+(review|approve|decide|read|confirm|sign off)\b",
    r"\bawait(s|ing)?\s+(an?\s+)?(owner|human|manual)?\s*(approval|review|decision|sign-?off)\b",
    r"\b(manual|human)\s+(review|approval)\s+(required|needed|gate|step)\b",
    r"\bfor (the )?(owner|human|person|rowan) to (read|review|decide|approve|pick|choose)\b",
    r"\bpending (owner|human) (review|approval|decision)\b")]
NEGATION = re.compile(r"\b(never|no|not|without|don't|do not|nothing|instead of|retired?|removes?|replaces?)\b", re.I)
EXEMPT = {"AGENTS.md", "CLAUDE.md", "scripts/closed_loop_check.py"}
CONSUMED_DIRS = ()  # directories a program in this repository publishes or verifies as a whole (set per repository)


def git(*a):
    r = subprocess.run(["git", "-C", str(ROOT), *a], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"git {' '.join(a)} failed: {r.stderr.strip()[:300]}")
    return r.stdout


def main(argv):
    base = argv[argv.index("--base") + 1] if "--base" in argv else "origin/main"
    bad = []
    agents = ROOT / "AGENTS.md"
    if not agents.exists() or "CLOSED-LOOP-1" not in agents.read_text(encoding="utf-8", errors="replace"):
        bad.append("AGENTS.md lacks the CLOSED-LOOP-1 rule")
    mb = git("merge-base", base, "HEAD").strip()
    added = [f for f in git("diff", "--name-only", "--diff-filter=A", mb, "HEAD").splitlines() if f]
    files = [f for f in git("ls-files").splitlines() if f]
    corpus = "\n".join((ROOT / f).read_text(encoding="utf-8", errors="replace") for f in files
                       if Path(f).suffix in CODE and (ROOT / f).is_file() and (ROOT / f).stat().st_size < 3_000_000)
    for f in added:
        p = Path(f)
        if p.suffix == ".md" and not f.startswith(CONSUMED_DIRS) and p.name not in PLATFORM and ".github/ISSUE_TEMPLATE" not in f and f not in corpus and (len(p.name) < 6 or p.name not in corpus):
            bad.append(f"{f}: new document that no code reads; make a loop consume it, turn it into code or policy, or drop it")
    diff = git("diff", "-U0", mb, "HEAD")
    cur = ""
    for line in diff.splitlines():
        if line.startswith("+++ "):
            cur = line[6:] if line.startswith("+++ b/") else ""
            continue
        if not line.startswith("+") or cur in EXEMPT or not cur:
            continue
        t = line[1:]
        if NEGATION.search(t) or "IDENTITY-BOUND" in t:
            continue
        for r in WAIT:
            m = r.search(t)
            if m:
                bad.append(f"{cur}: adds a wait on a person ('{m.group(0)}'); close the loop with an automated default, a check and a rollback")
                break
    for b in bad:
        print("CLOSED-LOOP-1:", b)
    print(f"closed-loop: {len(added)} added file(s), {len(bad)} failure(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
