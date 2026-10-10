# GitLab pipeline

The jobs a GitLab repository runs around `spec-steward` and `spec-tools`. Names are suggestions; the order, the rules and the exit codes are the contract ([contract.md](contract.md)).

## Rules

- `openspec validate` and `spec-tools gates` are gates over repository state, not unit tests: each runs as a job of its own, never inside a unit suite. An error fails its job; a warning never does.
- The diff, the coverage report and the merge-request comment are reports: they never fail a pipeline.
- `workflow-evidence` runs on merge requests to the default branch, and on default-branch pushes, where a red holds the release.
- The audit jobs accept exit 3 (`INCOMPLETE`) and 77 (an advisory `FAIL`) as allowed failures; a gating `FAIL` (exit 1) blocks.
- Report jobs depend on the audits with `dependencies:` and `when: always`, never `needs:` — a failed audit is exactly when its report matters.
- The default-branch pipeline publishes the reports on Pages, a failing one included; a report a run did not produce is omitted.
- The scheduled nightly sets `SPEC_AUDIT_NIGHTLY=true`, so `spec-tools tier` audits the corpus there.
- Reading jobs × workers is the pipeline's choice: `AUDIT_JOBS` reading jobs (default 1; a `parallel:` job sets the same number), each running `AUDIT_SLOTS` workers at once — as many as `AUDIT_JOB_MEMORY` holds, never more than `AUDIT_WORKERS` — and the scope is cut for one round across them. The reading and the judging hand off through files, so they run in one job (below) or as parallel reading jobs and a judge job that `needs:` them; `spec-tools workers` reads only its share in a parallel job. Set `AUDIT_JOB_MEMORY` once and give the AI jobs the same `KUBERNETES_MEMORY_LIMIT` (a YAML anchor keeps them one value; the runner must allow the overwrite); each pass logs the memory it used, which is what `AUDIT_WORKERS` is tuned from. Parallel reading jobs pay when one job cannot hold the round — a runner's default 2 GiB holds three workers; with the memory raised one job holds it, and the job that judges is the job that read: one pod, no artifact hop.
- spec-steward's corpus audit (`--audit spec-steward`) has no job: it is heavy, and its review file is the owner's to answer, locally.
- Declare what binds beyond spec-steward's defaults once, in `package.json`: `"spec-steward": { "binds": ["scripts/checks/**", "**/*.Dockerfile", ".gitlab-ci.yml"] }`.

## Getting the tools into an AI job

An AI job needs Node and the Claude CLI, no workspace install. Pin the CLI rather than taking whatever an image carries: a model needs a CLI that knows it (its context window and its effort levels), and an older CLI fails a long worker with "Prompt is too long". Download Anthropic's release binary for the runner's platform, check it against the release manifest, and cache it per version:

```yaml
.claude-code: &claude-code
    - |
        set -e
        platform="linux-$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')"
        dir=".claude-code/$CLAUDE_CODE_VERSION/$platform"
        if [ ! -x "$dir/claude" ]; then
          base="https://downloads.claude.ai/claude-code-releases/$CLAUDE_CODE_VERSION"
          sum=$(curl -fsSL "$base/manifest.json" | node -e "let s='';process.stdin.on('data',(d)=>(s+=d)).on('end',()=>console.log(JSON.parse(s).platforms[process.argv[1]].checksum))" "$platform")
          mkdir -p "$dir" && curl -fsSL "$base/$platform/claude" -o "$dir/claude.download"
          echo "$sum  $dir/claude.download" | sha256sum -c - && mv "$dir/claude.download" "$dir/claude" && chmod +x "$dir/claude"
        fi
        export PATH="$CI_PROJECT_DIR/$dir:$PATH"
```

Cache `.claude-code/` keyed on `CLAUDE_CODE_VERSION`, and gitignore it. The job that computes the scope runs with the workspace installed and hands the package's `skills/` on as an artifact: the self-contained CLI, `skills/spec-tools/scripts/cli.js`, and the skills its workers read. The AI jobs `needs:` that job and call the file with `node`.

`spec-tools scope` and `changed` load `typescript`, so they run in a job with the workspace installed.

## Jobs

```yaml
openspec:
    stage: review
    script: [yarn openspec validate --strict --all]

spec-gates:
    stage: review
    script: [yarn spec-tools gates]

workflow-evidence:
    stage: review
    rules:
        - if: $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == $CI_DEFAULT_BRANCH
        - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH && $SPEC_AUDIT_NIGHTLY != "true"
    script: [yarn spec-tools evidence]

spec-diff:
    stage: review
    rules: [if: $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == $CI_DEFAULT_BRANCH]
    script: [yarn spec-tools diff]
    artifacts: { when: always, paths: [spec-diff.md] }

# The run class, the coverage report and the audit's inputs, handed on as artifacts — with the package's skills/,
# which hold the CLI the AI jobs run.
spec-coverage:
    stage: review
    script:
        - yarn spec-tools tier | tee audit-tier.env
        - set -a && . ./audit-tier.env && set +a
        - yarn spec-tools steward coverage --out spec-coverage.md
        - yarn spec-tools scope
    artifacts:
        when: always
        reports: { dotenv: audit-tier.env }
        paths:
            [
                audit-tier.env,
                spec-coverage.md,
                audit-scope.json,
                audit-parts/,
                node_modules/@kirill.konshin/lint/skills/,
            ]

# The audit, in one job: read (a failed reading leaves its parts to the completion pass), merge, complete what the
# reading left short, verify every ERROR, gate.
spec-verify:
    stage: review
    image: <an image with node>
    needs: [spec-coverage]
    variables: { KUBERNETES_MEMORY_LIMIT: 8Gi, KUBERNETES_CPU_LIMIT: '4' } # AUDIT_JOB_MEMORY says the same
    allow_failure: { exit_codes: [3, 77] }
    script:
        - *claude-code
        - node node_modules/@kirill.konshin/lint/skills/spec-tools/scripts/cli.js workers || echo "the completion pass reads what the reading left short"
        - node node_modules/@kirill.konshin/lint/skills/spec-tools/scripts/cli.js report
        - node node_modules/@kirill.konshin/lint/skills/spec-tools/scripts/cli.js workers --complete
        - node node_modules/@kirill.konshin/lint/skills/spec-tools/scripts/cli.js report
        - node node_modules/@kirill.konshin/lint/skills/spec-tools/scripts/cli.js workers --verify
        - node node_modules/@kirill.konshin/lint/skills/spec-tools/scripts/cli.js report
        - node node_modules/@kirill.konshin/lint/skills/spec-tools/scripts/cli.js verdict spec-verify.json
    artifacts: { when: always, paths: [spec-verify.md, spec-verify.json, audit-parts/findings/] }

# Any other skill-driven review: headless, then its verdict.
some-review:
    stage: review
    image: <an image with node>
    needs: [spec-coverage]
    allow_failure: { exit_codes: [3, 77] }
    script:
        - *claude-code
        - node node_modules/@kirill.konshin/lint/skills/spec-tools/scripts/cli.js run some-review --verdict some-review.md --advisory
    artifacts: { when: always, paths: [some-review.md, claude.jsonl, 'job-log-*.md'] }

render-reviews:
    stage: deploy
    dependencies: [spec-verify, some-review, spec-coverage, spec-diff]
    rules:
        - if: $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == $CI_DEFAULT_BRANCH
          when: always
        - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
          when: always
    script:
        - yarn spec-tools html spec-verify.md some-review.md spec-coverage.md spec-diff.md
        - yarn spec-tools comment spec-verify=spec-verify.md some-review=some-review.md
        # Posting needs a token that may write notes; CI_JOB_TOKEN cannot.
        - '[ -z "$CI_MERGE_REQUEST_IID" ] || glab api --method POST "projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/notes" -f "body=$(cat mr-comment.md)"'
    artifacts: { when: always, paths: ['*.md', '*.html'] }
```

A release job that must wait for the audit `needs:` the judge (`spec-verify`), so a gating `FAIL` on the default branch holds it.
