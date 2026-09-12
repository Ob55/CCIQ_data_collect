# CleanCook MCP Server

A **separate, read-only** MCP (Model Context Protocol) server that exposes CleanCook
submission data to Claude (PRD Phase 8). It lets the CleanCook team ask natural-language
questions — _"how many flagged submissions for the stove survey this month?"_, _"show me
submission X with its labels"_ — answered directly from the live Supabase database.

**Read-only.** Every tool issues only `SELECT` queries (plus short-lived signed URLs for
attachment images). It never inserts, updates, or deletes.

## Tools

| Tool | Purpose |
| --- | --- |
| `list_forms` | List forms with their versions and submission counts. |
| `get_form_schema` | The questions (name, label, type, choices) for a form version. |
| `list_submissions` | Filter submissions by form, status, date, submitter role/enumerator. |
| `get_submission` | One submission rendered against its own schema, with labels, review history, and signed image URLs. |

## Setup

```bash
cd mcp
npm install
cp .env.example .env      # fill in SUPABASE_SERVICE_ROLE_KEY
npm test                  # runs the pure-logic unit tests (no DB needed)
```

### Environment

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Same project URL as the web app. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Bypasses all RLS.** Server-side only. Only run this server on a trusted machine — whoever runs it can read every submission. |

Env is loaded from `mcp/.env` for local dev, or can be injected by the Claude client config
(below). `.env` is git-ignored.

## Add to Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`, or `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "cleancook": {
      "command": "node",
      "args": ["/absolute/path/to/CleanCookingCollect/mcp/src/index.js"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://uqidqjuzuakovlpofadb.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```

Restart the client; the four `cleancook` tools appear in the tool list.

## Try it locally with the MCP Inspector

```bash
cd mcp
npx @modelcontextprotocol/inspector node src/index.js
```

Then call `list_forms`, `get_form_schema`, `list_submissions`, and `get_submission`.

## Conventions

- **JavaScript only** (PRD §4). No TypeScript.
- **Zod** validates every tool input.
- Self-contained: this package does not import from the Next.js `src/` tree; the small
  amount of shared schema logic is re-implemented in `src/lib/schema.js`.
