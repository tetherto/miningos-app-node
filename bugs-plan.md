# Asana Comment Bug Fix Workflow

You are tasked with processing Asana tickets, reading their comments (including attachments), fixing the issues described, and creating a single PR that addresses everything.

## Inputs

Asana ticket URLs:
- [PASTE YOUR LINKS HERE]

## Workflow

### Step 1: Extract task GIDs
From each Asana URL, extract the task GID (the last numeric segment of the URL, e.g. `https://app.asana.com/0/1234567/8901234` → GID is `8901234`).

### Step 2: Fetch comments via curl
For each task GID, run:

```bash
curl -s "https://app.asana.com/api/1.0/tasks/{task_gid}/stories?opt_fields=text,created_by.name,created_at,resource_subtype,html_text" \
  -H "Authorization: Bearer $ASANA_PAT"
```

Filter results to only `resource_subtype: "comment_added"`. Parse out the comment text and who wrote it.

### Step 3: Fetch attachments
For each task, also fetch attachments:

```bash
curl -s "https://app.asana.com/api/1.0/tasks/{task_gid}/attachments?opt_fields=name,download_url,resource_type" \
  -H "Authorization: Bearer $ASANA_PAT"
```

Download any relevant attachments (screenshots, files) to understand the issue. For images, describe what you see if relevant to the bug.

### Step 4: Fetch task details via Asana MCP
Use the Asana MCP `get_task` tool to get the task title, description, and assignee for additional context.

### Step 5: Triage and plan
For each ticket, based on comments and attachments:
1. Identify what is being asked/reported
2. Classify as: **fixable** (code change needed) or **out of scope** (design decision, external dependency, not a bug, needs product input, etc.)
3. For fixable items, identify the relevant files and what needs to change

Present the triage plan and wait for my confirmation before proceeding.

### Step 6: Implement fixes
- Create a single branch named `fix/asana-comment-fixes-{date}` 
- Make all fixes across the codebase
- Keep commits atomic — one commit per Asana ticket, with the commit message referencing the ticket: `fix: [brief description] (Asana: {task_url})`

### Step 7: Create the PR
Create one PR with:
- **Title:** `fix: address review comments from Asana tickets`
- **Body:** a table summarizing each ticket:

| Ticket | Title | Status | Resolution |
|--------|-------|--------|------------|
| [link] | ... | ✅ Fixed / ⏭️ Out of scope | 1-2 sentence explanation |

### Step 8: Comment back on Asana tickets
For each ticket, use curl to post a comment back:

```bash
curl -s -X POST "https://app.asana.com/api/1.0/tasks/{task_gid}/stories" \
  -H "Authorization: Bearer $ASANA_PAT" \
  -H "Content-Type: application/json" \
  -d '{"data":{"text":"..."}}'
```

The comment should follow this format:
- **If fixed:** "Addressed in PR: {pr_url} — {1-2 sentence description of what was changed}"
- **If out of scope:** "Marking as out of scope for this pass — {concise reason}. Will revisit in a follow-up if needed."

## Rules
- Do NOT guess at fixes. If a comment is ambiguous, ask me before implementing.
- Prefer minimal, targeted changes. Don't refactor unrelated code.
- If an attachment (e.g. screenshot) shows a visual bug, describe what you see and your proposed fix before implementing.
- Ensure all existing tests pass. Add tests if the fix warrants it.
- If a comment thread has back-and-forth, use the **latest consensus** as the source of truth.
- Before using this, make sure you have your Asana Personal Access Token set as an environment variable (`export ASANA_PAT=your_token`). You can generate one from **Asana → My Settings → Apps → Developer Apps → Personal Access Tokens**.