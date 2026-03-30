import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BitbucketClient } from "./client.js";
import { registerTools } from "./tools.js";
import { registerPrompts } from "./prompts.js";

const BITBUCKET_URL = process.env.BITBUCKET_URL;
const BITBUCKET_TOKEN = process.env.BITBUCKET_TOKEN;

if (!BITBUCKET_URL) {
  console.error("Fatal: BITBUCKET_URL environment variable is not set.");
  process.exit(1);
}
if (!BITBUCKET_TOKEN) {
  console.error("Fatal: BITBUCKET_TOKEN environment variable is not set.");
  process.exit(1);
}

const client = new BitbucketClient(BITBUCKET_URL.replace(/\/$/, ""), BITBUCKET_TOKEN);

const server = new McpServer(
  {
    name: "bitbucket-data-center-mcp",
    title: "Bitbucket Data Center MCP",
    version: "0.0.1",
  },
  {
    instructions:
      "This MCP provides read-only access to Bitbucket Data Center pull request review comments.",
  },
);

registerTools(server, client);
registerPrompts(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bitbucket Data Center MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
