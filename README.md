# Auto review action

This action can automatically assign reviewers and merge pull requests. This may help you to achieve thunk-like workflow in your org.  
\* It's designed to use with free org account, where reviewers count is limited to 1.  
Example work scheme:
1. Someone creates pull request
1. Workflow with this action waits for tests to complete
1. This action assigns first reviewer to the PR
1. First reviewer approves the changes
1. This action assigns second reviewer to the PR
1. Second (the last) reviewer approves the changes
1. This action merges the PR

> Note: If there 3/4/more reviewers, action will assign everyone and merge PR only after their approve

## Inputs

### `scheme-file`

**Required** file to read scheme from. Scheme example:

```yml
repository-name:
  pr-author-login:
    - reviewer1-login
    - reviewer2-login
  pr-author2-login:
    - reviewer3-login
    - reviewer2-login
```

## Example usage

```yaml
name: Set reviewers or merge
uses: KaMeHb-UA/auto-review-action@v2
with:
  scheme-file: /github/home/review-scheme.yml
env:
  GITHUB_TOKEN: ${{ secrets.GH_CI_TOKEN }}
```

## Recommended workflow events configuration

```yml
name: Review assigning

on:
  workflow_run:
    workflows:
      - Test
    types:
      - completed
  pull_request_review:

jobs:
  reviews:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion != 'failure' }}
    steps:
```

## Complete workflow example with scheme file from another repo

```yml
name: Review assigning

on:
  workflow_run:
    workflows:
      - Test
    types:
      - completed
  pull_request_review:

jobs:
  reviews:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion != 'failure' }}
    steps:

      - name: Get GitHub organization name
        id: org
        run: |
          IFS=/ read -a org_repo <<< "$GITHUB_REPOSITORY"
          echo ::set-output name=org::${org_repo[0]}

      - name: Download review scheme
        uses: octokit/request-action@v2.x
        id: scheme
        with:
          route: GET /repos/${{ steps.org.outputs.org }}/<YOUR_REPO>/contents/review-scheme.yml
        env:
          GITHUB_TOKEN: ${{ secrets.GH_CI_TOKEN }}

      - name: Get raw review scheme file
        run: |
          mkdir -p /home/runner/work/_temp/_github_home
          cat - <<EOF | base64 -d > /home/runner/work/_temp/_github_home/review-scheme.yml
          ${{ fromJson(steps.scheme.outputs.data).content }}
          EOF

      - name: Set reviewers or merge
        uses: KaMeHb-UA/auto-review-action@v2
        with:
          scheme-file: /github/home/review-scheme.yml
        env:
          GITHUB_TOKEN: ${{ secrets.GH_CI_TOKEN }}
```
