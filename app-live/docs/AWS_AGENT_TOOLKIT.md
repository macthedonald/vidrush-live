# AWS Agent Toolkit

The [Agent Toolkit for AWS](https://github.com/aws/agent-toolkit-for-aws) lets AI coding
agents (Claude Code, Codex, Cursor, Kiro) build, deploy, and manage AWS resources — useful
here for operating the **Remotion Lambda** render stack (see `docs/REMOTION_LAMBDA.md`).

## What's wired in the repo

The generic **MCP server** path is committed to [`.mcp.json`](../.mcp.json) as the `aws`
server:

```json
"aws": {
  "type": "stdio",
  "command": "uvx",
  "args": [
    "mcp-proxy-for-aws@1.6.3",
    "https://aws-mcp.us-east-1.api.aws/mcp",
    "--metadata",
    "AWS_REGION=us-east-1"
  ],
  "env": {}
}
```

Claude Code picks this up for anyone working in `app-live/` (it will prompt to approve the
project-scoped server). **To use a different region**, change both the endpoint region in
the URL (`aws-mcp.<region>.api.aws`) and the `AWS_REGION=<region>` metadata.

## Steps you must run locally (can't be done from the remote container)

These need a browser and your machine's credentials, so they aren't part of the repo:

1. **Install `uv`** (provides `uvx`, which runs the MCP proxy):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```
2. **Install AWS CLI v2** and authenticate (browser-based sign-in; the session is valid
   ~12h and renewable for 90 days — no long-lived access keys needed):
   ```bash
   aws login
   aws configure agent-toolkit
   ```
3. Restart your agent session so the `aws` MCP server loads with valid credentials.

## Alternative: Claude Code plugins

Instead of (or in addition to) the MCP server, you can install the official AWS Claude Code
plugins directly in your Claude Code session:

```
/plugin install aws-core@claude-plugins-official
/plugin install aws-agents@claude-plugins-official
/plugin install aws-data-analytics@claude-plugins-official
/plugin install aws-agents-for-devsecops@claude-plugins-official
/reload-plugins
```

These are interactive Claude Code commands (run them yourself in the CLI — they can't be
executed as shell commands or committed to the repo).

> Prerequisites for both paths: `uv` installed and AWS credentials configured.
