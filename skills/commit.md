---
name: commit
trigger: /commit
description: Create a well-crafted git commit from staged changes
tools: [bash, read]
---

Help the user create a git commit:

1. Run `git status` to see what's staged and unstaged
2. Run `git diff --cached` to see the staged changes
3. If nothing is staged, suggest which files to add based on `git diff`
4. Analyze the changes and draft a commit message:
   - First line: imperative mood, under 72 chars, describes the "what"
   - Blank line
   - Body: explains the "why" if not obvious from the diff
5. Present the commit message for approval
6. Run `git commit -m "..."` with the approved message
