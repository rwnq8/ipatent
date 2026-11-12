# AGENTS.md: universal instructions for every code agent

Read by Claude Code (via CLAUDE.md import), GitHub Copilot, Kimi, OpenAI Codex and any other agent.
No agent depends on another agent's chat history. GitHub is the shared memory.

## 1. Rules that never change
- Work from the repo, never from chat memory. If it is not in an issue, a PR or `docs/handoff/`, it did not happen.
- Never handle keys, passwords or tokens in output, commits or issues. Keep everything keyless.
- Published and sent content must be accurate and checked against sources. No invented facts.
- Cloudflare (D1, R2, KV) holds canonical runtime state. Nothing canonical lives in a chat or artifact.
- Follow the repo's CLAUDE.md lifecycle rules (SDLC-OWN-1) if present: define, research, design, build, test, deploy, verify, measure, iterate.

## 2. The handoff loop (how agents hand work to each other)
1. **Start**: read `docs/handoff/` (newest first) and the open issues labelled `agent-ready`. Pick one. Comment `claim: <agent> <date>` on the issue.
2. **Work on a branch** named `agent/<issue#>-<slug>`. Open a **draft PR** within the first few minutes.
3. **Checkpoint early and often**: after each stage (research, design, front end, back end, deploy) commit and update `docs/handoff/<slug>.md` from `docs/handoff/TEMPLATE.md`. Budget can run out at any time; an unpushed stage is a lost stage.
4. **Stop cleanly**: when budget is low, finish the current commit, update the handoff file (state, decisions, next step, how to verify), push, and comment on the issue `released: <agent>, next: <step>`.
5. **Finish**: tests green, live probe passes, handoff file marked `status: done`, PR marked ready, follow-up issues filed.

## 3. Issue format (any agent must be able to finish it cold)
Problem, context, files/paths, acceptance criteria, test plan, closing probe, size (`S`/`M`/`L`), `front:` and `back:` lines (both sides ship together, or the counterpart is its own issue).

## 4. Routing by plan (flat-fee plans run out; spread work, do not queue it)
| Work type | Preferred agent | Why |
|---|---|---|
| Large refactors, architecture, multi-file design | Claude Code | strongest planning; spend its budget here |
| Well-specified issues, small/medium features, tests | GitHub Copilot coding agent | assigned straight from an issue, produces draft PRs |
| Bulk edits, docs, boilerplate, long-context reading | Kimi | cheap, long context |
| Overflow and second opinions | OpenAI Codex (flat plan) | any `agent-ready` issue |
Rule: when one agent's budget is gone, the next agent picks up the same issue from its handoff file. Labels: `agent-ready`, `claimed`, `needs-review`, `blocked:<reason>`.

## 5. Velocity rule: features, not only fixes
Each repo keeps a roadmap issue ("Roadmap: next 5 features") with at most 5 items, each with goal, user, success metric. Agents pull from it before pulling bug fixes. At least 1 in 3 merged PRs per repo should be a user-visible feature. Every feature PR names its metric and how it will be measured.

## 6. Review and safety
- Agents do not review their own PRs. Copilot code review or a different agent checks `needs-review` PRs.
- CI must pass before merge. Auto-merge is allowed only for PRs whose checks are green.
- Each PR description ends with what was verified and the evidence.

## 7. Self-audit and no standalone documents (owner directive 2026-11-06)
- Before and after every delivery, audit the work against real output (run it, probe it). Name what you are not thinking about; fix it or file it as an issue with a closing probe. There is always room to improve.
- A document is never a deliverable on its own. Every output ships with running code, a PR, an issue or a roadmap entry. Existing write-ups that were never implemented become roadmap items with code.
- `scripts/audit.py` (run every 6h by `.github/workflows/fleet-audit.yml`) checks all active repos and files issues for gaps. Fix findings labelled `fleet-audit` before starting new work.
- Never stop at "waiting for the owner". If an action is reversible and in scope, do it; if it is truly blocked, file the blocker as an issue with an owner and a closing probe, then continue with other work.

<!-- fleet-protocol:start (managed by QNFO/qnfo-fleet-issues scripts/merge_agents_md.py; edit the hub, not here) -->

## Shared agent protocol
Read by Claude Code (via CLAUDE.md import), GitHub Copilot, Kimi, OpenAI Codex and any other agent.
No agent depends on another agent's chat history. GitHub is the shared memory.

## Doctrine baseline (DOCTRINE-1, owner version 8.2.1)
- Read the canonical `QNFO/qnfo-workers` files `docs/DOCTRINE-KERNEL.md`
  and `docs/AUTONOMOUS-OPERATION-DOCTRINE.md` revision 5 for fleet work.
- Execute reversible work within the requested scope, verify observed outcomes,
  and give every item an explicit disposition. Preserve live claims and use the
  canonical deployment path.
- Harness permissions, security, secret locks, consent, opt-outs and the
  personal/research boundary retain precedence. Trust scores never grant
  permissions. A refusal is stated plainly and never bypassed by another route.
- File presence proves configuration distribution only. Runtime adoption needs
  observed evidence from the running agent; do not claim universal compliance.

## 1. Rules that never change
- Work from the repo, never from chat memory. If it is not in an issue, a PR or `docs/handoff/`, it did not happen.
- Never handle keys, passwords or tokens in output, commits or issues. Keep everything keyless.
- Published and sent content must be accurate and checked against sources. No invented facts.
- Cloudflare (D1, R2, KV) holds canonical runtime state. Nothing canonical lives in a chat or artifact.
- Follow the repo's CLAUDE.md lifecycle rules (SDLC-OWN-1) if present: define, research, design, build, test, deploy, verify, measure, iterate.

## 2. The handoff loop (how agents hand work to each other)
1. **Start**: read `docs/handoff/` (newest first) and the open issues labelled `agent-ready`. Pick one. Comment `claim: <agent> <date>` on the issue.
2. **Work on a branch** named `agent/<issue#>-<slug>`. Open a **draft PR** within the first few minutes.
3. **Checkpoint early and often**: after each stage (research, design, front end, back end, deploy) commit and update `docs/handoff/<slug>.md` from `docs/handoff/TEMPLATE.md`. Budget can run out at any time; an unpushed stage is a lost stage.
4. **Stop cleanly**: when budget is low, finish the current commit, update the handoff file (state, decisions, next step, how to verify), push, and comment on the issue `released: <agent>, next: <step>`.
5. **Finish**: tests green, live probe passes, handoff file marked `status: done`, PR marked ready, follow-up issues filed.

## 3. Issue format (any agent must be able to finish it cold)
Problem, context, files/paths, acceptance criteria, test plan, closing probe, size (`S`/`M`/`L`), `front:` and `back:` lines (both sides ship together, or the counterpart is its own issue).

## 4. Routing by plan (flat-fee plans run out; spread work, do not queue it)
| Work type | Preferred agent | Why |
|---|---|---|
| Large refactors, architecture, multi-file design | Claude Code | strongest planning; spend its budget here |
| Well-specified issues, small/medium features, tests | GitHub Copilot coding agent | assigned straight from an issue, produces draft PRs |
| Bulk edits, docs, boilerplate, long-context reading | Kimi | cheap, long context |
| Overflow and second opinions | OpenAI Codex (flat plan) | any `agent-ready` issue |
Rule: when one agent's budget is gone, the next agent picks up the same issue from its handoff file. Labels: `agent-ready`, `claimed`, `needs-review`, `blocked:<reason>`.

## 5. Velocity rule: features, not only fixes
Each repo keeps a roadmap issue ("Roadmap: next 5 features") with at most 5 items, each with goal, user, success metric. Agents pull from it before pulling bug fixes. At least 1 in 3 merged PRs per repo should be a user-visible feature. Every feature PR names its metric and how it will be measured.

## 6. Review and safety
- Agents do not review their own PRs. Copilot code review or a different agent checks `needs-review` PRs.
- CI must pass before merge. Auto-merge is allowed only for PRs whose checks are green.
- Each PR description ends with what was verified and the evidence.

## 7. Self-audit and no standalone documents (owner directive 2026-11-06)
- Before and after every delivery, audit the work against real output (run it, probe it). Name what you are not thinking about; fix it or file it as an issue with a closing probe. There is always room to improve.
- A document is never a deliverable on its own. Every output ships with running code, a PR, an issue or a roadmap entry. Existing write-ups that were never implemented become roadmap items with code.
- `scripts/audit.py` (run every 6h by `.github/workflows/fleet-audit.yml`) checks all active repos and files issues for gaps. Fix findings labelled `fleet-audit` before starting new work.
- Never stop at "waiting for the owner". If an action is reversible and in scope, do it; if it is truly blocked, file the blocker as an issue with an owner and a closing probe, then continue with other work.

## 8. Close your own loops (CLOSE-OWN-LOOPS-1, owner directive 2026-11-06)
- Every item you open or mention (issue, PR, branch, claim, follow-up, blocker, "next step") is a loop with an owner (an agent or loop, never the person), a fix, a closing probe and evidence. Record it as a GitHub issue labelled `loop` the moment you mention it. Prose in a reply is never the only record, and nothing is lost between sessions.
- Close your own loops without being asked: finish, verify, comment the evidence, close. A permission check that refuses an action is stated plainly; file the issue with the exact blocker and a probe that detects the unblocked state, then take the next loop. Never reword the same action past the same refusal.
- Close-out checklist before ending any turn: (1) list your open loops: `gh api "repos/<repo>/issues?labels=loop&state=open"`; (2) each is closed with evidence, or has owner, exact blocker and probe; (3) every PR you opened is green or has a filed reason; (4) the handoff file is current. Only then report.
- A step only the owner can take (a credential, money, a legal or signing act, the owner's own accounts) is an issue with an `IDENTITY-BOUND:` line, its default in effect and a closing probe. It is never an instruction in prose.
- `scripts/audit.py` closes its own `fleet-audit` issues with evidence once the finding stops reporting, and flags any `loop` issue without a `closing probe:` line.

<!-- fleet-protocol:end -->

## 9. Ask the owner with prompted recall (PROMPTED-RECALL-1, owner directive 2026-11-09)
- When you need something only the owner knows (past work, experience, preferences, facts about their life), ask yes/no or multiple-choice questions: two to four concrete options plus "Not sure". Never ask for a typed free-form answer or recall from scratch.
- Make each option specific (job, employer, year, system, document) so a yes jogs memory: "At DVRPC, 2005 to 2008, did you run the regional travel model?", not "Tell me about your modeling work".
- Use tap cards, checkboxes or a short numbered batch. Ask whenever you are unsure instead of guessing or leaving a gap.
- Act on each answer at once: a yes goes into the record that needs it (resume, brand doc `rwnq8/resume` `docs/BRAND.md`, profile, application) marked "confirmed by owner, <date>"; a no removes the claim; "Not sure" keeps it out. Record answers so the same question is never asked twice.
- Before every job application, compare the posting's requirements with the resume and ask a prompted-recall question for each gap before tailoring.
- Full procedure: `.agents/skills/prompted-recall/SKILL.md` in `QNFO/agent-operating-system`.

## 10. Describing the owner (BRAND-1, owner directive 2026-11-09)

- Rowan Brad Quni-Gudzinas is a systems researcher studying autonomous AI
  systems: how they behave, fail and can be audited and governed (adjacent to
  AI safety). Describe Rowan that way in every README, profile, bio, citation
  and outreach text.
- Rowan directs and evaluates systems rather than writing code. Use
  "systems researcher", never "software engineer", "developer", "coder" or
  "programmer". Quantum computing is not a headline or identity.
- Copy wording and proof points from `rwnq8/resume` `docs/BRAND.md`. Add no
  credential, title, patent or count that is not in that file or `RESUME.md`;
  when unsure whether Rowan did something, ask by prompted recall (section 9; local copy of the procedure in `.agents/skills/prompted-recall/SKILL.md`).

## Design standard (DESIGN-STANDARD-1, owner directive 2026-11-09)

- Owner: "bad UI makes me sad ... when I see shitty design, it freezes me up ... Don't give me shitty design anywhere." Every page, dashboard, form, card or README layout an agent builds follows professional UI and UX practice.
- Fleet web pages use the shared design system in `QNFO/qnfo-workers` `_shared/design-system.js` (tokens, components, `dsHead`, `dsLint`), inlined with `_shared/inline-design-system.mjs`; `_shared/design-system.test.mjs` proves WCAG 2.2 AA contrast in light and dark and lints each adopter's rendered page. A page outside the fleet copies its tokens (colours, 16 px body text, 44 px tap size, 8 px spacing scale).
- The standard: one primary action per screen; a title, one status sentence, then the content; tap instead of type (Yes / No / Not sure as equal buttons, never free text for a choice); 44 px tap targets, 16 px body and field text, 14 px minimum for secondary text; secondary tools and links behind a disclosure, not crowded into the top bar; one accent colour, with colour only for good, warning and bad; loading, empty and error states each say what happens next; phone first, and tables scroll instead of crushing.
- Before calling UI work done, look at it: take a phone-width screenshot (390 px) in light and dark and fix what a person would trip over.

## Closed loops, no external input (CLOSED-LOOP-1, Rowan 2026-11-12)
- Rowan, verbatim: "Never assume that anything is needed externally ... documents and memories are useless. Don't rely on them. Everything must be translated into something that can be executed by code ... Don't ever assume that anything will ever be reviewed ... All of your loops must be closed by you."
- Assume nothing you produce is ever read, reviewed or decided by a person, and that no external input arrives: no owner decision, no human review, no reader. Every loop closes itself on an automated default, with its own check and rollback. Documents and memories are not storage or communication: a decision, plan or lesson lands as code, a policy value or a check that a loop executes.
- Never produce a document, report, owner-decision card or review request that no loop consumes. Resolve a blocker by building the capability. Only a credential, money, a legal signature or the owner's own account waits on the owner, marked `IDENTITY-BOUND:` with a default in effect that the loop runs on meanwhile.
- Enforced by `scripts/closed_loop_check.py` in `.github/workflows/closed-loop.yml` on every pull request: it fails when this rule is missing, when a new Markdown file has no code that reads it, or when an added line parks work on a person. Fleet copies: QNFO/qnfo-workers `scripts/closed_loop_guard.py` and `v_human_wait_states`; ultrastable `python3 -m foundation closedloop`.
