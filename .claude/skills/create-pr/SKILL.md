---
name: create-pr
description: "Branch if needed, then open a GitHub pull request for the current work in this repo's house style. Use when the user says 'create a PR', 'open a pull request', 'raise a PR for this', 'PR this branch', or similar. Moves work off the base branch onto a fresh feature/<slug> branch when it isn't already on one, commits anything outstanding, pushes, and runs `gh pr create` with a generated title and body."
metadata:
  author: Igor Jambrek
---

# Create a pull request

Take the work that exists right now and turn it into an open PR against the base branch, written the
way this repo's merged PRs are written. If that work is sitting on the base branch (or a detached
HEAD), move it onto a `feature/<slug>` branch first — a PR needs a branch of its own.

The invocation may carry hints: `/create-pr`, `/create-pr voice search race` (a title/slug hint),
`/create-pr --base develop`, `/create-pr --draft`.

## Step 1 — preconditions

- `git rev-parse --is-inside-work-tree` — must be a repo.
- `gh auth status` — must be logged in. If not, stop and tell the user to run `gh auth login`.
- Resolve the **base branch**, first that resolves: an explicit `--base <x>`; then
  `git symbolic-ref --quiet refs/remotes/origin/HEAD` (→ `origin/main`); then `main`; then `master`.
- `git fetch origin <base>` quietly, so the ancestor checks below and the diff are honest.

## Step 2 — make sure the work is on a feature branch

`current = git branch --show-current`.

- **Detached HEAD** (`current` empty) → stop, ask the user to check out a branch first.
- **`current` is not the base** → already on a feature branch; keep it, go to Step 3.
- **`current` is the base** → mint a branch:
  1. Derive a **slug**: from the invocation hint if given; else from the subject of the newest commit
     in `git log --format=%s origin/<base>..HEAD`; else from the largest change in the working tree —
     `git diff --stat` for tracked files, plus any untracked files named by `git status --porcelain`
     (a brand-new file shows up only there, never in `git diff --stat`). Kebab-case, lowercase, 3–6
     words, no punctuation.
  2. Prefix `fix/` when the work is plainly a bug fix (commit subjects begin "Fix"/"Fixes", or the
     user said so), otherwise `feature/`.
  3. `git switch -c <prefix><slug>` — this carries any uncommitted changes across.
  4. If the base had commits that aren't on `origin/<base>` yet
     (`git log --oneline origin/<base>..HEAD` is non-empty), they now live on both branches. Rewind
     the local base so they live only on the new branch — **only if
     `git merge-base --is-ancestor origin/<base> HEAD`** (no divergence):
     `git branch --force <base> origin/<base>`. If it *has* diverged, stop and ask — don't guess.

Never rewind anything but the base branch, and never force-update a branch other than back onto its
own `origin/` ref.

## Step 3 — commit what's outstanding

If `git status --porcelain` is non-empty, the tree has changes the PR wouldn't describe — including
untracked files (`??`), which are often the whole reason for the PR and never appear in
`git diff --stat`. Show them (`git status`, `git diff --stat`), then `git add -A` (it leaves
gitignored cruft like `.claude/scheduled_tasks.lock` alone) and commit in the repo's style:

- Short imperative subject, no trailing period; a body only if the change needs the explanation.
- End the message with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```

If `origin/<base>..HEAD` is still empty after this, there is nothing to PR — say so and stop.

## Step 4 — push

`git push -u origin <branch>`. On a non-fast-forward rejection, stop and report — don't force.

## Step 5 — write the description

Read the change set the way the **pr-description** skill does (use it if it's available):
`git log --no-merges --format='%h %s%n%b' <base>..HEAD` for intent, `git diff --stat <base>...HEAD`
for churn, then the actual hunks of `git diff <base>...HEAD`. Base every sentence on what the diff
does, not on the branch name or commit subjects (PRs here squash-merge, so the commits are
discarded).

**Title** — a plain imperative sentence, sentence case, no prefix, no trailing period. Match the
merged PRs: *"Put a blank sheet behind a turning page"*, *"Fix deploy secret guard broken by an
apostrophe"*, *"Make picture search find names a child says out loud"*.

**Body** — this shape (it is what every merged PR here uses). Drop any section that would be empty:

````markdown
## What

<1–3 short paragraphs. Lead with the behavioural or user-visible effect, not the file list. For a
bug fix, split into `## The problem` and `## The change` instead. Repo voice: concrete, plain, em
dashes are fine.>

## Why

<The motivation, when it is not already obvious from What. Omit otherwise.>

## Scope

<Which packages this touches — `packages/shared`, `apps/server`, `apps/web` — and, when it
reassures, what it deliberately leaves alone (e.g. "nothing that prints is changed", "no
shared-geometry changes"). Omit for a small, self-evident change.>

## Testing

- `npm run typecheck` — <clean, or the actual result>
- `npm test` — <e.g. "252 pass"; name any new tests and what they cover>
- `npm run build` — <clean; include when `apps/web` is touched>
- <manual check, if you did one>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

Bullets are one per *logical* change, never one per file. Run `npm run typecheck`, `npm test` and
(when the frontend changed) `npm run build`, and report the real outcomes — read the test runner's
own pass count. If the user asked you to skip them, write `— not run locally; CI covers it` rather
than inventing a result.

## Step 6 — open the PR

- Write the body to a temp file. A stray apostrophe in an inline `--body` has broken this repo's
  tooling before (PR #3), and a temp file also keeps `##` headings out of the shell.
- `gh pr create --base <base> --head <branch> --title "<title>" --body-file <tmpfile>`; add
  `--draft` if asked.
- If `gh` reports a PR already exists for the branch, run `gh pr view --web` and report that instead
  of erroring.

## Step 7 — report back

One short summary: the branch (created or reused), the commit(s) included, and the PR URL.

Do not merge the PR, set labels or reviewers, or touch other branches unless the user asks.
