# Issue tracker: GitHub

Issues and PRDs live in GitHub Issues for `jhowtkd/adscale`. Run `gh` commands from this repository.

## Common operations

- Create: `gh issue create --title "..." --body-file <file> --label "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,assignees`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."`
- Close: `gh issue close <number> --comment "..."`

## Wayfinding operations

- Create a map with label `wayfinder:map`.
- Create a child ticket with `gh issue create --parent <map-number> ...`.
- Claim an open ticket before work with `gh issue edit <ticket-number> --add-assignee @me`.
- List children with `gh api repos/{owner}/{repo}/issues/<map-number>/sub_issues --paginate`.
- Add a native blocking edge by fetching the blocker database id with `gh api repos/{owner}/{repo}/issues/<blocker-number> --jq .id`, then posting it as `issue_id` to `repos/{owner}/{repo}/issues/<blocked-number>/dependencies/blocked_by`.
- A frontier ticket is an open child with no assignee and an empty `dependencies/blocked_by` response.

In human-facing text, link issue titles; never use bare issue numbers as names.
