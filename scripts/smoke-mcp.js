#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["./src/server.js"],
  cwd: process.cwd(),
  env: process.env,
  stderr: "pipe",
});

const client = new Client({
  name: "kmahub-mcp-smoke-test",
  version: "0.1.0",
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const endpointList = await client.callTool({
    name: "kma_list_endpoints",
    arguments: {},
  });
  const callResult = await client.callTool({
    name: "kma_call_endpoint",
    arguments: { endpointId: "asos_element", params: { stn: "108" } },
  });

  console.log(JSON.stringify({
    tools: tools.tools.map((tool) => tool.name),
    endpointListPreview: endpointList.content?.[0]?.text?.slice(0, 500),
    callPreview: callResult.content?.[0]?.text?.slice(0, 500),
  }, null, 2));
} finally {
  await client.close();
}
