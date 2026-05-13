#!/usr/bin/env node
import { testEndpoints } from "../src/kmaClient.js";

const results = await testEndpoints();
const summary = {
  total: results.length,
  ok: results.filter((result) => result.ok).length,
  failed: results.filter((result) => !result.ok).length,
};

console.log(JSON.stringify({ summary, results }, null, 2));

if (summary.failed > 0) {
  process.exitCode = 1;
}
