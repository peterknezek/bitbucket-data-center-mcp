import { type AssistantMCP } from "./index";

export async function initializePrompts(agent: AssistantMCP) {
  agent.server.registerPrompt(
    "to_markdown",
    {
      title: "Convert to Markdown format",
      description: "Convert the following text to Markdown format.",
    },
    async () => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `
	Convert to Markdown format.
						`.trim(),
            },
          },
        ],
      };
    },
  );
}
