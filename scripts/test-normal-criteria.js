#!/usr/bin/env node
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  SOUTH_KOREA_STATION_POLICY,
  classifySouthKoreaMonthlyValue,
  computeSouthKoreaNormalCriteria,
  getSouthKoreaNormalCriteria,
  validateSouthKoreaNormalCriteria,
} from "../src/normalCriteria.js";

const EXPECTED_OFFICIAL_CRITERIA = {
  tavg: {
    normal: [-0.9, 1.2, 6.1, 12.1, 17.3, 21.4, 24.6, 25.1, 20.5, 14.3, 7.6, 1.1],
    halfRange: [0.6, 0.6, 0.5, 0.5, 0.3, 0.3, 0.6, 0.5, 0.3, 0.4, 0.6, 0.6],
  },
  tmax: {
    normal: [4.4, 7.0, 12.2, 18.6, 23.5, 26.7, 28.9, 29.8, 25.9, 20.7, 13.6, 6.6],
    halfRange: [0.6, 0.6, 0.6, 0.6, 0.4, 0.4, 0.7, 0.6, 0.3, 0.4, 0.5, 0.7],
  },
  tmin: {
    normal: [-5.7, -3.9, 0.5, 6.0, 11.6, 16.8, 21.2, 21.6, 16.1, 9.0, 2.5, -3.6],
    halfRange: [0.7, 0.6, 0.4, 0.6, 0.3, 0.3, 0.5, 0.5, 0.5, 0.6, 0.7, 0.6],
  },
  precip: {
    normal: [26.2, 35.7, 56.5, 89.7, 102.1, 148.2, 296.5, 282.6, 155.1, 63.0, 48.0, 28.0],
    lower: [17.4, 27.5, 42.7, 70.3, 79.3, 101.6, 245.9, 225.3, 84.2, 37.0, 30.7, 19.8],
    upper: [26.8, 44.9, 58.5, 99.3, 125.5, 174.0, 308.2, 346.7, 202.3, 64.3, 55.1, 28.6],
  },
};

function parseToolContent(result) {
  return JSON.parse(result.content[0].text);
}

function testOfficialCriteriaTable() {
  for (const [variable, expected] of Object.entries(EXPECTED_OFFICIAL_CRITERIA)) {
    const rows = getSouthKoreaNormalCriteria({ variable });
    assert.equal(rows.length, 12);

    for (const row of rows) {
      const index = row.month - 1;
      assert.equal(row.normal, expected.normal[index], `${variable} month ${row.month} normal`);

      if (variable === "precip") {
        assert.equal(row.lower, expected.lower[index], `${variable} month ${row.month} lower`);
        assert.equal(row.upper, expected.upper[index], `${variable} month ${row.month} upper`);
      } else {
        assert.equal(row.similarRangeHalf, expected.halfRange[index], `${variable} month ${row.month} halfRange`);
      }
    }
  }
}

async function testDirectApi() {
  const validation = validateSouthKoreaNormalCriteria();
  assert.equal(validation.ok, true);
  assert.equal(validation.criteriaRows, 48);
  assert.equal(validation.expectedCriteriaRows, 48);
  assert.equal(validation.officialNormalStationCount, 62);
  assert.equal(validation.representativeStationCount, 62);

  const [febMeanTemperature] = getSouthKoreaNormalCriteria({ variable: "tavg", month: 2 });
  assert.equal(febMeanTemperature.normal, 1.2);
  assert.equal(febMeanTemperature.similarRangeHalf, 0.6);
  assert.equal(febMeanTemperature.lower, 0.6);
  assert.equal(febMeanTemperature.upper, 1.8);

  const [aprPrecipitation] = getSouthKoreaNormalCriteria({ variable: "precip", month: 4 });
  assert.equal(aprPrecipitation.normal, 89.7);
  assert.equal(aprPrecipitation.lower, 70.3);
  assert.equal(aprPrecipitation.upper, 99.3);

  const warmApril = classifySouthKoreaMonthlyValue({ variable: "tavg", month: 4, departureValue: 1.7 });
  assert.equal(warmApril.sign, "+");
  assert.equal(warmApril.display, "1.7(+)");

  const similarAprilRain = classifySouthKoreaMonthlyValue({ variable: "precip", month: 4, observedValue: 79.7 });
  assert.equal(similarAprilRain.sign, "0");
  assert.equal(similarAprilRain.display, "79.7(0)");

  const temperatureComputed = computeSouthKoreaNormalCriteria({
    variable: "tavg",
    values: Array.from({ length: 30 }, (_, index) => index + 1),
  });
  assert.equal(temperatureComputed.normal, 15.5);
  assert.equal(temperatureComputed.similarRangeHalf, 3.8);

  const precipitationComputed = computeSouthKoreaNormalCriteria({
    variable: "precip",
    values: Array.from({ length: 30 }, () => 62.945867),
  });
  assert.equal(precipitationComputed.normal, 63.0);

  const daeguRule = SOUTH_KOREA_STATION_POLICY.mergeRules.find((rule) => rule.targetStationId === 860);
  assert.equal(daeguRule.sourceSegments[0].endDate, "2015-06-11");
  assert.equal(daeguRule.sourceSegments[1].startDate, "2015-06-12");

  const jeonjuRule = SOUTH_KOREA_STATION_POLICY.mergeRules.find((rule) => rule.targetStationId === 864);
  assert.equal(jeonjuRule.sourceSegments[0].endDate, "2015-06-30");
  assert.equal(jeonjuRule.sourceSegments[1].startDate, "2015-07-01");
}

async function testMcpTools() {
  const client = new Client({ name: "normal-criteria-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["./src/server.js"],
  });

  await client.connect(transport);
  try {
    const tools = await client.listTools();
    const toolNames = new Set(tools.tools.map((tool) => tool.name));
    for (const expectedTool of [
      "kma_get_south_korea_normal_criteria",
      "kma_compute_south_korea_normal_criteria",
      "kma_classify_south_korea_monthly_value",
      "kma_validate_south_korea_normal_criteria",
    ]) {
      assert.equal(toolNames.has(expectedTool), true, `missing MCP tool: ${expectedTool}`);
    }

    const criteriaResult = await client.callTool({
      name: "kma_get_south_korea_normal_criteria",
      arguments: { variable: "precip", month: 4, includeStationPolicy: true },
    });
    const criteria = parseToolContent(criteriaResult);
    assert.equal(criteria.criteria[0].normal, 89.7);
    assert.equal(criteria.criteria[0].lower, 70.3);
    assert.equal(criteria.criteria[0].upper, 99.3);
    assert.equal(criteria.stationPolicy.officialNormalStationIds.length, 62);

    const classificationResult = await client.callTool({
      name: "kma_classify_south_korea_monthly_value",
      arguments: { variable: "precip", month: 4, observedValue: 79.7 },
    });
    const classification = parseToolContent(classificationResult);
    assert.equal(classification.sign, "0");
    assert.equal(classification.display, "79.7(0)");

    const validationResult = await client.callTool({
      name: "kma_validate_south_korea_normal_criteria",
      arguments: {},
    });
    const validation = parseToolContent(validationResult);
    assert.equal(validation.ok, true);
    assert.equal(validation.criteriaRows, 48);
  } finally {
    await client.close();
  }
}

testOfficialCriteriaTable();
await testDirectApi();
await testMcpTools();
console.log("normal criteria checks passed");
