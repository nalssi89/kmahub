#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { callEndpoint } from "../src/kmaClient.js";

const STATION_ID = "105";
const STATION_NAME = "Gangneung";
const START_YEAR = 2001;
const END_DATE = "20260511";
const OUT_DIR = path.resolve("data", "gangneung_asos_precip");
const DAILY_CSV = path.join(OUT_DIR, "gangneung_asos_daily_precip_2001_2026.csv");
const MONTHLY_CSV = path.join(OUT_DIR, "gangneung_asos_monthly_precip_2001_2026.csv");
const PLOT_SVG = path.join(OUT_DIR, "gangneung_asos_monthly_precip_2001_2026.svg");
const REPORT_MD = path.join("reports", "gangneung_asos_monthly_precip_2001_2026.md");

function parseFieldNames(body) {
  return body
    .split(/\r?\n/u)
    .map((line) => line.match(/^#\s*(\d+)\.\s+([A-Z0-9_]+)\s*:/u))
    .filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((match) => match[2]);
}

function parseDailyRows(body, sourceUrl) {
  const fieldNames = parseFieldNames(body);
  const rnDayIndex = fieldNames.indexOf("RN_DAY");
  if (rnDayIndex === -1) {
    throw new Error("RN_DAY field was not found in the KMA help header.");
  }

  const rows = [];
  for (const line of body.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/u);
    if (parts.length < fieldNames.length) continue;
    if (parts[1] !== STATION_ID) continue;

    const raw = parts[rnDayIndex];
    const parsed = Number(raw);
    const rnDayMm = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    rows.push({
      date: parts[0],
      stn: parts[1],
      rn_day_raw: raw,
      rn_day_mm: rnDayMm,
      source_url: sourceUrl,
    });
  }

  return { rows, fieldNames, rnDayPosition: rnDayIndex + 1 };
}

function ymdToMonth(ymd) {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`;
}

function aggregateMonthly(rows) {
  const byMonth = new Map();
  for (const row of rows) {
    const month = ymdToMonth(row.date);
    const current = byMonth.get(month) || {
      month,
      stn: row.stn,
      days: 0,
      precip_mm: 0,
      raw_negative_days: 0,
      start_date: row.date,
      end_date: row.date,
    };
    current.days += 1;
    current.precip_mm += row.rn_day_mm;
    if (Number(row.rn_day_raw) < 0) current.raw_negative_days += 1;
    current.end_date = row.date;
    byMonth.set(month, current);
  }

  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((row) => ({
      ...row,
      precip_mm: Number(row.precip_mm.toFixed(1)),
    }));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n") + "\n";
}

function movingAverage(values, windowSize) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}

function buildPlot(monthlyRows) {
  const width = 1500;
  const height = 760;
  const margin = { top: 70, right: 44, bottom: 90, left: 86 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = monthlyRows.map((row) => row.precip_mm);
  const ma12 = movingAverage(values, 12);
  const maxY = Math.ceil(Math.max(...values, ...ma12) / 100) * 100 || 100;
  const x = (index) => margin.left + (index * plotWidth) / values.length;
  const barWidth = Math.max(1, plotWidth / values.length - 1);
  const y = (value) => margin.top + plotHeight - (value / maxY) * plotHeight;
  const ticks = Array.from({ length: 6 }, (_, i) => (maxY * i) / 5);

  const bars = monthlyRows.map((row, index) => {
    const xPos = x(index);
    const yPos = y(row.precip_mm);
    const h = margin.top + plotHeight - yPos;
    const dateTitle = `${row.month}: ${row.precip_mm.toFixed(1)} mm`;
    return `<rect x="${xPos.toFixed(2)}" y="${yPos.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="#4f8fc9"><title>${dateTitle}</title></rect>`;
  }).join("\n");

  const line = ma12.map((value, index) => `${x(index) + barWidth / 2},${y(value).toFixed(2)}`).join(" ");
  const yearLabels = monthlyRows
    .filter((row) => row.month.endsWith("-01"))
    .filter((_, index) => index % 2 === 0)
    .map((row) => {
      const index = monthlyRows.findIndex((candidate) => candidate.month === row.month);
      const xPos = x(index) + barWidth / 2;
      return `<text x="${xPos.toFixed(2)}" y="${height - 43}" text-anchor="middle" class="axis-text">${row.month.slice(0, 4)}</text>`;
    })
    .join("\n");

  const grid = ticks.map((tick) => {
    const yPos = y(tick);
    return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${yPos.toFixed(2)}" y2="${yPos.toFixed(2)}" class="grid"/><text x="${margin.left - 12}" y="${(yPos + 5).toFixed(2)}" text-anchor="end" class="axis-text">${tick.toFixed(0)}</text>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gangneung ASOS monthly precipitation time series">
  <style>
    text { font-family: Arial, "Malgun Gothic", sans-serif; fill: #18202a; }
    .title { font-size: 28px; font-weight: 700; }
    .subtitle { font-size: 15px; fill: #52606d; }
    .axis-text { font-size: 12px; fill: #52606d; }
    .grid { stroke: #d8e0e8; stroke-width: 1; }
    .axis { stroke: #5d6975; stroke-width: 1.2; }
    .legend { font-size: 14px; fill: #27313d; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${margin.left}" y="34" class="title">강릉 ASOS 월누적강수량</text>
  <text x="${margin.left}" y="58" class="subtitle">지점 105, 2001-01부터 ${monthlyRows.at(-1).month}까지. 막대: 월합계, 선: 12개월 이동평균</text>
  ${grid}
  <line x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis"/>
  <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis"/>
  ${bars}
  <polyline points="${line}" fill="none" stroke="#c53d2f" stroke-width="3"/>
  <rect x="${width - 345}" y="28" width="18" height="12" fill="#4f8fc9"/>
  <text x="${width - 320}" y="39" class="legend">월누적강수량(mm)</text>
  <line x1="${width - 185}" x2="${width - 145}" y1="34" y2="34" stroke="#c53d2f" stroke-width="3"/>
  <text x="${width - 136}" y="39" class="legend">12개월 이동평균</text>
  ${yearLabels}
  <text x="${margin.left - 58}" y="${margin.top + 20}" class="axis-text" transform="rotate(-90 ${margin.left - 58} ${margin.top + 20})">mm</text>
  <text x="${width - margin.right}" y="${height - 16}" text-anchor="end" class="axis-text">Source: KMA API Hub kma_sfcdd3.php, RN_DAY</text>
</svg>
`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(path.dirname(REPORT_MD), { recursive: true });

  const allRows = [];
  const fetches = [];
  let rnDayPosition = null;
  let fieldCount = null;
  const endYear = Number(END_DATE.slice(0, 4));

  for (let year = START_YEAR; year <= endYear; year += 1) {
    const tm1 = `${year}0101`;
    const tm2 = year === endYear ? END_DATE : `${year}1231`;
    const result = await callEndpoint("asos_daily_range", {
      params: { tm1, tm2, stn: STATION_ID, help: "1" },
      includeBody: true,
      timeoutMs: 30000,
    });
    const parsed = parseDailyRows(result.body, result.url);
    rnDayPosition = parsed.rnDayPosition;
    fieldCount = parsed.fieldNames.length;
    allRows.push(...parsed.rows);
    fetches.push({
      year,
      tm1,
      tm2,
      ok: result.ok,
      status: result.status,
      bytes: result.bytes,
      elapsedMs: result.elapsedMs,
      rows: parsed.rows.length,
      url: result.url,
    });
    console.error(`Fetched ${year}: ${parsed.rows.length} rows`);
  }

  allRows.sort((a, b) => a.date.localeCompare(b.date));
  const monthlyRows = aggregateMonthly(allRows);
  const totalPrecip = monthlyRows.reduce((sum, row) => sum + row.precip_mm, 0);
  const maxMonth = monthlyRows.reduce((best, row) => row.precip_mm > best.precip_mm ? row : best, monthlyRows[0]);

  await writeFile(DAILY_CSV, toCsv(allRows, ["date", "stn", "rn_day_raw", "rn_day_mm", "source_url"]), "utf8");
  await writeFile(MONTHLY_CSV, toCsv(monthlyRows, ["month", "stn", "days", "precip_mm", "raw_negative_days", "start_date", "end_date"]), "utf8");
  await writeFile(PLOT_SVG, buildPlot(monthlyRows), "utf8");

  const report = `# Gangneung ASOS Monthly Precipitation

Source: KMA API Hub \`kma_sfcdd3.php\`

Station: ${STATION_ID} (${STATION_NAME})

Requested period: 2001-01-01 to ${END_DATE.slice(0, 4)}-${END_DATE.slice(4, 6)}-${END_DATE.slice(6, 8)}

Actual rows: ${allRows.length} daily rows, ${monthlyRows.length} monthly rows

Actual covered period: ${allRows[0]?.date} to ${allRows.at(-1)?.date}

RN_DAY field position from \`help=1\`: ${rnDayPosition} of ${fieldCount}

Normalization: negative \`RN_DAY\` sentinel values are preserved in \`rn_day_raw\` and treated as 0 mm for monthly accumulation.

Total normalized precipitation: ${totalPrecip.toFixed(1)} mm

Maximum monthly precipitation: ${maxMonth.month}, ${maxMonth.precip_mm.toFixed(1)} mm

Outputs:

- Daily CSV: \`${DAILY_CSV}\`
- Monthly CSV: \`${MONTHLY_CSV}\`
- Plot SVG: \`${PLOT_SVG}\`

Fetch summary:

| Year | Period | Rows | Status | Bytes | Elapsed ms |
| --- | --- | ---: | ---: | ---: | ---: |
${fetches.map((row) => `| ${row.year} | ${row.tm1}-${row.tm2} | ${row.rows} | ${row.status} | ${row.bytes} | ${row.elapsedMs} |`).join("\n")}
`;

  await writeFile(REPORT_MD, report, "utf8");

  console.log(JSON.stringify({
    dailyCsv: DAILY_CSV,
    monthlyCsv: MONTHLY_CSV,
    plotSvg: PLOT_SVG,
    report: REPORT_MD,
    dailyRows: allRows.length,
    monthlyRows: monthlyRows.length,
    startDate: allRows[0]?.date,
    endDate: allRows.at(-1)?.date,
    rnDayPosition,
    totalPrecipMm: Number(totalPrecip.toFixed(1)),
    maxMonth,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
