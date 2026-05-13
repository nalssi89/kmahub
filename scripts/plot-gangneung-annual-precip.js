#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const INPUT_CSV = path.resolve("data", "gangneung_asos_precip", "gangneung_asos_daily_precip_2001_2026.csv");
const OUT_DIR = path.resolve("data", "gangneung_asos_precip");
const ANNUAL_CSV = path.join(OUT_DIR, "gangneung_asos_annual_precip_2001_2026.csv");
const PLOT_SVG = path.join(OUT_DIR, "gangneung_asos_annual_precip_2001_2026.svg");
const REPORT_MD = path.resolve("reports", "gangneung_asos_annual_precip_2001_2026.md");

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
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

function aggregateAnnual(rows) {
  const byYear = new Map();

  for (const row of rows) {
    const year = row.date.slice(0, 4);
    const current = byYear.get(year) || {
      year,
      stn: row.stn,
      days: 0,
      precip_mm: 0,
      raw_negative_days: 0,
      start_date: row.date,
      end_date: row.date,
    };

    current.days += 1;
    current.precip_mm += Number(row.rn_day_mm);
    if (Number(row.rn_day_raw) < 0) current.raw_negative_days += 1;
    current.end_date = row.date;
    byYear.set(year, current);
  }

  return [...byYear.values()]
    .sort((a, b) => a.year.localeCompare(b.year))
    .map((row) => ({
      ...row,
      precip_mm: Number(row.precip_mm.toFixed(1)),
      complete_year: row.start_date.endsWith("0101") && row.end_date.endsWith("1231") ? "yes" : "no",
    }));
}

function buildPlot(rows) {
  const width = 1300;
  const height = 760;
  const margin = { top: 76, right: 42, bottom: 92, left: 90 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = rows.map((row) => row.precip_mm);
  const maxY = Math.ceil(Math.max(...values) / 500) * 500 || 500;
  const barGap = 7;
  const barWidth = (plotWidth - barGap * (rows.length - 1)) / rows.length;
  const x = (index) => margin.left + index * (barWidth + barGap);
  const y = (value) => margin.top + plotHeight - (value / maxY) * plotHeight;
  const ticks = Array.from({ length: 6 }, (_, i) => (maxY * i) / 5);
  const meanComplete = rows
    .filter((row) => row.complete_year === "yes")
    .reduce((sum, row, _, arr) => sum + row.precip_mm / arr.length, 0);
  const meanY = y(meanComplete);

  const grid = ticks.map((tick) => {
    const yPos = y(tick);
    return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${yPos.toFixed(2)}" y2="${yPos.toFixed(2)}" class="grid"/><text x="${margin.left - 12}" y="${(yPos + 5).toFixed(2)}" text-anchor="end" class="axis-text">${tick.toFixed(0)}</text>`;
  }).join("\n");

  const bars = rows.map((row, index) => {
    const xPos = x(index);
    const yPos = y(row.precip_mm);
    const h = margin.top + plotHeight - yPos;
    const fill = row.complete_year === "yes" ? "#4f8fc9" : "#b7c3d0";
    return `<rect x="${xPos.toFixed(2)}" y="${yPos.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="${fill}"><title>${row.year}: ${row.precip_mm.toFixed(1)} mm${row.complete_year === "no" ? " (partial)" : ""}</title></rect>`;
  }).join("\n");

  const labels = rows.map((row, index) => {
    const xPos = x(index) + barWidth / 2;
    const yPos = margin.top + plotHeight + 20;
    return `<text x="${xPos.toFixed(2)}" y="${yPos}" text-anchor="middle" class="axis-text" transform="rotate(-55 ${xPos.toFixed(2)} ${yPos})">${row.year}</text>`;
  }).join("\n");

  const valueLabels = rows
    .filter((row) => row.precip_mm >= maxY * 0.8 || row.complete_year === "no")
    .map((row) => {
      const index = rows.findIndex((candidate) => candidate.year === row.year);
      const xPos = x(index) + barWidth / 2;
      return `<text x="${xPos.toFixed(2)}" y="${(y(row.precip_mm) - 8).toFixed(2)}" text-anchor="middle" class="value-label">${row.precip_mm.toFixed(0)}</text>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gangneung ASOS annual accumulated precipitation">
  <style>
    text { font-family: Arial, "Malgun Gothic", sans-serif; fill: #18202a; }
    .title { font-size: 28px; font-weight: 700; }
    .subtitle { font-size: 15px; fill: #52606d; }
    .axis-text { font-size: 12px; fill: #52606d; }
    .value-label { font-size: 12px; fill: #27313d; font-weight: 700; }
    .grid { stroke: #d8e0e8; stroke-width: 1; }
    .axis { stroke: #5d6975; stroke-width: 1.2; }
    .mean { stroke: #c53d2f; stroke-width: 2.2; stroke-dasharray: 7 6; }
    .legend { font-size: 14px; fill: #27313d; }
  </style>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${margin.left}" y="36" class="title">강릉 ASOS 연누적강수량</text>
  <text x="${margin.left}" y="61" class="subtitle">지점 105, 2001년부터 2026년 5월 11일까지. 2026년은 부분년</text>
  ${grid}
  <line x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + plotHeight}" y2="${margin.top + plotHeight}" class="axis"/>
  <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotHeight}" class="axis"/>
  ${bars}
  <line x1="${margin.left}" x2="${width - margin.right}" y1="${meanY.toFixed(2)}" y2="${meanY.toFixed(2)}" class="mean"/>
  <text x="${width - margin.right}" y="${(meanY - 8).toFixed(2)}" text-anchor="end" class="legend">완전연도 평균 ${meanComplete.toFixed(1)} mm</text>
  ${valueLabels}
  <rect x="${width - 330}" y="28" width="18" height="12" fill="#4f8fc9"/>
  <text x="${width - 305}" y="39" class="legend">완전연도</text>
  <rect x="${width - 225}" y="28" width="18" height="12" fill="#b7c3d0"/>
  <text x="${width - 200}" y="39" class="legend">부분년</text>
  ${labels}
  <text x="${margin.left - 58}" y="${margin.top + 20}" class="axis-text" transform="rotate(-90 ${margin.left - 58} ${margin.top + 20})">mm</text>
  <text x="${width - margin.right}" y="${height - 16}" text-anchor="end" class="axis-text">Source: KMA API Hub kma_sfcdd3.php, RN_DAY</text>
</svg>
`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(path.dirname(REPORT_MD), { recursive: true });

  const text = await readFile(INPUT_CSV, "utf8");
  const [headerLine, ...lines] = text.trim().split(/\r?\n/u);
  const headers = parseCsvLine(headerLine);
  const rows = lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });

  const annualRows = aggregateAnnual(rows);
  const completeRows = annualRows.filter((row) => row.complete_year === "yes");
  const maxYear = annualRows.reduce((best, row) => row.precip_mm > best.precip_mm ? row : best, annualRows[0]);
  const minCompleteYear = completeRows.reduce((best, row) => row.precip_mm < best.precip_mm ? row : best, completeRows[0]);
  const meanComplete = completeRows.reduce((sum, row) => sum + row.precip_mm, 0) / completeRows.length;

  await writeFile(ANNUAL_CSV, toCsv(annualRows, ["year", "stn", "days", "precip_mm", "raw_negative_days", "start_date", "end_date", "complete_year"]), "utf8");
  await writeFile(PLOT_SVG, buildPlot(annualRows), "utf8");

  const report = `# Gangneung ASOS Annual Accumulated Precipitation

Source daily CSV: \`${INPUT_CSV}\`

Station: 105 (Gangneung)

Rows: ${annualRows.length} annual rows

Coverage: ${annualRows[0].start_date} to ${annualRows.at(-1).end_date}

Complete-year mean: ${meanComplete.toFixed(1)} mm

Maximum annual precipitation: ${maxYear.year}, ${maxYear.precip_mm.toFixed(1)} mm

Minimum complete-year precipitation: ${minCompleteYear.year}, ${minCompleteYear.precip_mm.toFixed(1)} mm

Outputs:

- Annual CSV: \`${ANNUAL_CSV}\`
- Plot SVG: \`${PLOT_SVG}\`

Note: ${annualRows.at(-1).year} is marked as partial if it does not cover January 1 through December 31.
`;

  await writeFile(REPORT_MD, report, "utf8");

  console.log(JSON.stringify({
    annualCsv: ANNUAL_CSV,
    plotSvg: PLOT_SVG,
    report: REPORT_MD,
    annualRows: annualRows.length,
    coverage: `${annualRows[0].start_date}-${annualRows.at(-1).end_date}`,
    completeYearMeanMm: Number(meanComplete.toFixed(1)),
    maxYear,
    minCompleteYear,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
