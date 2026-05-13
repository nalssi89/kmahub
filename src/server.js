#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ENDPOINTS } from "./endpoints.js";
import { callEndpoint, testEndpoints } from "./kmaClient.js";
import {
  SOUTH_KOREA_NORMAL_METHOD,
  SOUTH_KOREA_STATION_POLICY,
  classifySouthKoreaMonthlyValue,
  computeSouthKoreaNormalCriteria,
  getSouthKoreaNormalCriteria,
  validateSouthKoreaNormalCriteria,
} from "./normalCriteria.js";

function textResult(value) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

const server = new McpServer({
  name: "kmahub-mcp",
  version: "0.1.0",
});

server.registerTool(
  "kma_list_endpoints",
  {
    title: "List KMA API Hub endpoints",
    description: "List the KMA API Hub endpoints supported by this MCP server.",
    inputSchema: {
      category: z.string().optional().describe("Optional category filter."),
    },
  },
  async ({ category }) => {
    const endpoints = ENDPOINTS.filter((endpoint) => !category || endpoint.category === category).map((endpoint) => ({
      id: endpoint.id,
      title: endpoint.title,
      category: endpoint.category,
      path: endpoint.path,
      format: endpoint.format,
      requiredParams: endpoint.requiredParams,
      optionalParams: endpoint.optionalParams,
      defaultParams: endpoint.defaultParams,
    }));

    return textResult({ count: endpoints.length, endpoints });
  },
);

server.registerTool(
  "kma_call_endpoint",
  {
    title: "Call a KMA API Hub endpoint",
    description: "Call one supported KMA API Hub endpoint. The auth key is read from KMA_API_AUTH_KEY unless authKey is explicitly supplied.",
    inputSchema: {
      endpointId: z.string().describe("Endpoint id from kma_list_endpoints."),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Query parameters to override or add."),
      includeBody: z.boolean().optional().describe("Return the full text body or base64 image when true."),
      authKey: z.string().optional().describe("Optional auth key override. Prefer KMA_API_AUTH_KEY."),
      timeoutMs: z.number().int().positive().optional().describe("Request timeout in milliseconds."),
    },
  },
  async ({ endpointId, params, includeBody, authKey, timeoutMs }) => {
    const result = await callEndpoint(endpointId, { params, includeBody, authKey, timeoutMs });
    return textResult(result);
  },
);

server.registerTool(
  "kma_test_endpoints",
  {
    title: "Test KMA API Hub endpoints",
    description: "Run minimal availability checks against all or selected supported KMA API Hub endpoints.",
    inputSchema: {
      endpointIds: z.array(z.string()).optional().describe("Optional endpoint ids to test. Defaults to all endpoints."),
      authKey: z.string().optional().describe("Optional auth key override. Prefer KMA_API_AUTH_KEY."),
      timeoutMs: z.number().int().positive().optional().describe("Per-request timeout in milliseconds."),
    },
  },
  async ({ endpointIds, authKey, timeoutMs }) => {
    const results = await testEndpoints({ endpointIds, authKey, timeoutMs });
    const summary = {
      total: results.length,
      ok: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
    };

    return textResult({ summary, results });
  },
);

server.registerTool(
  "kma_get_south_korea_normal_criteria",
  {
    title: "Get South Korea normal-range criteria",
    description:
      "Return the official 1991-2020 South Korea 62-station monthly normal and similar-range criteria for temperature and precipitation.",
    inputSchema: {
      variable: z.enum(["tavg", "tmax", "tmin", "precip"]).optional().describe("Optional variable filter."),
      month: z.number().int().min(1).max(12).optional().describe("Optional month filter, 1-12."),
      includeMethod: z.boolean().optional().describe("Include calculation-method notes when true."),
      includeStationPolicy: z.boolean().optional().describe("Include the 62-station and station-merge policy when true."),
    },
  },
  async ({ variable, month, includeMethod, includeStationPolicy }) => textResult({
    normalPeriod: SOUTH_KOREA_STATION_POLICY.normalPeriod,
    criteria: getSouthKoreaNormalCriteria({ variable, month }),
    ...(includeMethod ? { method: SOUTH_KOREA_NORMAL_METHOD } : {}),
    ...(includeStationPolicy ? { stationPolicy: SOUTH_KOREA_STATION_POLICY } : {}),
  }),
);

server.registerTool(
  "kma_compute_south_korea_normal_criteria",
  {
    title: "Compute South Korea normal-range criteria",
    description:
      "Compute monthly normal and similar-range criteria from yearly monthly values. Temperature uses +/-0.43 sample sigma; precipitation uses percentile interpolation.",
    inputSchema: {
      variable: z.enum(["tavg", "tmax", "tmin", "precip"]).describe("Variable to compute."),
      values: z.array(z.number()).min(1).describe("Yearly monthly values, normally 30 values for 1991-2020."),
      lowerProbability: z.number().min(0).max(1).optional().describe("Precipitation lower percentile probability. Default: 0.3333."),
      upperProbability: z.number().min(0).max(1).optional().describe("Precipitation upper percentile probability. Default: 0.6667."),
    },
  },
  async ({ variable, values, lowerProbability, upperProbability }) => {
    if (lowerProbability !== undefined && upperProbability !== undefined && lowerProbability >= upperProbability) {
      throw new Error("lowerProbability must be less than upperProbability.");
    }

    return textResult(computeSouthKoreaNormalCriteria({
      variable,
      values,
      lowerProbability,
      upperProbability,
    }));
  },
);

server.registerTool(
  "kma_classify_south_korea_monthly_value",
  {
    title: "Classify South Korea monthly value",
    description:
      "Classify a monthly temperature departure or precipitation accumulation as low/similar/high using the official 1991-2020 South Korea criteria.",
    inputSchema: {
      variable: z.enum(["tavg", "tmax", "tmin", "precip"]).describe("Variable to classify."),
      month: z.number().int().min(1).max(12).describe("Month, 1-12."),
      observedValue: z.number().optional().describe("Observed monthly value. Required for precipitation; optional for temperature if departureValue is supplied."),
      departureValue: z.number().optional().describe("Temperature departure from normal. Used for temperature variables only."),
    },
  },
  async ({ variable, month, observedValue, departureValue }) => textResult(classifySouthKoreaMonthlyValue({
    variable,
    month,
    observedValue,
    departureValue,
  })),
);

server.registerTool(
  "kma_validate_south_korea_normal_criteria",
  {
    title: "Validate South Korea normal-range criteria",
    description: "Validate that the built-in official 1991-2020 South Korea monthly criteria table is complete.",
    inputSchema: {},
  },
  async () => textResult({
    officialMatchTarget: "Official 1991-2020 South Korea monthly normal/similar-range table: 4 variables x 12 months.",
    ...validateSouthKoreaNormalCriteria(),
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
