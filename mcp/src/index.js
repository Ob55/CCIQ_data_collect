#!/usr/bin/env node
// @ts-check
// CleanCook MCP server (PRD Phase 8). Read-only tools over submission data, served over
// stdio for Claude Desktop / Claude Code. Plain JavaScript, Zod-validated tool inputs.
import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { createReadClient } from './supabase.js'
import { toolText, toolError } from './lib/format.js'

import listForms from './tools/list-forms.js'
import getFormSchema from './tools/get-form-schema.js'
import listSubmissions from './tools/list-submissions.js'
import getSubmission from './tools/get-submission.js'

const TOOLS = [listForms, getFormSchema, listSubmissions, getSubmission]

async function main() {
  // Fail loud early if env is missing (rather than on the first tool call).
  const supabase = createReadClient()

  const server = new McpServer({ name: 'cleancook', version: '1.0.0' })

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args) => {
        try {
          const result = await tool.handler(args ?? {}, { supabase })
          return toolText(result)
        } catch (err) {
          // Surface a readable message to Claude instead of crashing the transport.
          return toolError(err)
        }
      }
    )
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stdout is the protocol channel — logs must go to stderr.
  console.error(`CleanCook MCP server ready (${TOOLS.length} read-only tools).`)
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
