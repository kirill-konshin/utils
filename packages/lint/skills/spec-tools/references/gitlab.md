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
- spec-steward's corpus audit (`--audit spec-steward`) has no job: it is heavy, and its review file is the owner's to answer, locally.
- Declare what binds beyond spec-steward's defaults once, in `package.json`: `"spec-steward": { "binds": ["scripts/checks/**", "**/*.Dockerfile", ".gitlab-ci.yml"] }`.

## Getting the tools into an AI job

An image that carries `claude` and Node but no workspace install unpacks the pinned package; the bundle needs no install, and the skills the repository links resolve through it:

```yaml
.spec-tools-setup: &spec-tools-setup
    - mkdir -p node_modules/@kirill.konshin/lint
    - npm pack "@kirill.konshin/lint@$(node -p "require('./package.json').devDependencies['@kirill.konshin/lint']")" --silent
    - tar -xzf kirill.konshin-lint-*.tgz --strip-components 1 -C node_modules/@kirill.konshin/lint
```

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

# The run class, the coverage report and the audit's inputs, handed on as artifacts.
spec-coverage:
    stage: review
    script:
        - yarn spec-tools tier | tee audit-tier.env
        - set -a && . ./audit-tier.env && set +a
        - yarn spec-steward coverage --out spec-coverage.md
        - yarn spec-tools scope
    artifacts:
        when: always
        reports: { dotenv: audit-tier.env }
        paths: [audit-tier.env, spec-coverage.md, audit-scope.json, audit-parts/]

# The reading, shared out: each job reads the parts dealt to it.
spec-verify:read:
    stage: review
    image: <an image with claude and node>
    needs: [spec-coverage]
    parallel: 2 # 8 on the nightly
    allow_failure: true
    script:
        - *spec-tools-setup
        - node_modules/.bin/spec-tools workers
    artifacts: { when: always, paths: [audit-parts/findings/] }

# The judge: merge, complete what the reading left short, verify every ERROR, gate.
spec-verify:
    stage: review
    image: <an image with claude and node>
    needs: [spec-coverage, { job: 'spec-verify:read', optional: true }]
    allow_failure: { exit_codes: [3, 77] }
    script:
        - *spec-tools-setup
        - node_modules/.bin/spec-tools report
        - node_modules/.bin/spec-tools workers --complete
        - node_modules/.bin/spec-tools report
        - node_modules/.bin/spec-tools workers --verify
        - node_modules/.bin/spec-tools report
        - node_modules/.bin/spec-tools verdict spec-verify.json
    artifacts: { when: always, paths: [spec-verify.md, spec-verify.json, audit-parts/findings/] }

# Any other skill-driven review: headless, then its verdict.
some-review:
    stage: review
    image: <an image with claude and node>
    needs: [spec-coverage]
    allow_failure: { exit_codes: [3, 77] }
    script:
        - *spec-tools-setup
        - node_modules/.bin/spec-tools run some-review --verdict some-review.md --advisory
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
