---
name: security-review
trigger: /security-review
description: Analyze pending changes for security vulnerabilities
tools: [read, bash]
---

Analyze the pending changes on the current branch for security vulnerabilities.

1. Run `git diff --cached` and `git diff` to see all changes
2. For each changed file, check for:
   - Command injection (unsanitized input in shell commands)
   - SQL injection (string concatenation in queries)
   - XSS (unescaped user input in HTML/templates)
   - Path traversal (user-controlled file paths)
   - Hardcoded secrets (API keys, passwords, tokens)
   - Insecure crypto (weak algorithms, hardcoded IVs)
   - SSRF (user-controlled URLs in fetch/request)
   - Prototype pollution (unsafe object merging)
3. Report findings with severity (P0-P3), file path, line number, and suggested fix
4. If no issues found, confirm the changes look clean
