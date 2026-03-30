import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initializePrompts } from "./prompts";

export class AssistantMCP {
  server = new McpServer(
    {
      name: "bitbucket-data-center-mcp",
      title: "Bitbucket Data Center MCP",
      version: "0.0.1",
    },
    {
      instructions: "This MCP provides information about Bitbucket Data Center.",
    },
  );

  async init() {
    await initializePrompts(this);
  }
}

async function main() {
  const agent = new AssistantMCP();
  await agent.init();
  const transport = new StdioServerTransport();
  await agent.server.connect(transport);
  console.error("Assistant MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
