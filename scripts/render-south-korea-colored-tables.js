#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SOUTH_KOREA_NORMAL_CRITERIA,
  SOUTH_KOREA_STATION_POLICY,
} from "../src/normalCriteria.js";

const DEFAULT_INPUT = path.resolve("data", "south_korea_1973_202604_official_similar_range_tables.md");
const DEFAULT_STATION_MONTHLY = path.resolve("data", "station_monthly_1973_202604.md");
const DEFAULT_STATION_META = path.resolve("data", "map", "ASOS_stations.csv");
const DEFAULT_GEOJSON = path.resolve("data", "map", "skorea-provinces-geo.json");
const DEFAULT_OUTPUT = path.resolve("reports", "south_korea_1973_202604_colored_anomaly_tables.html");
const DEFAULT_DASHBOARD_DATA = path.resolve("data", "dashboard", "south_korea_monthly_detail_data.js");
const DEFAULT_GEOJSON_JS = path.resolve("data", "dashboard", "skorea_provinces_geo.js");

const MONTHS = Array.from({ length: 12 }, (_, index) => `${index + 1}월`);
const TEMPERATURE_VARIABLES = new Set(["tavg", "tmax", "tmin"]);
const REPRESENTATIVE_STATION_IDS = new Set(SOUTH_KOREA_STATION_POLICY.representativeStationIds);

const SECTION_SPECS = [
  { variable: "tmax", sourceTitle: "최고기온 편차", title: "전국 평균 최고기온 편차", kind: "temperature", unit: "℃" },
  { variable: "tmin", sourceTitle: "최저기온 편차", title: "전국 평균 최저기온 편차", kind: "temperature", unit: "℃" },
  { variable: "tavg", sourceTitle: "평균기온 편차", title: "전국 평균기온 편차", kind: "temperature", unit: "℃" },
  { variable: "precip", sourceTitle: "강수량", title: "전국 강수량", kind: "precipitation", unit: "mm" },
];

async function readTextFile(filePath) {
  const buffer = await readFile(filePath);
  const utf8 = buffer.toString("utf8");
  const replacementCount = [...utf8].filter((char) => char === "\uFFFD").length;
  if (replacementCount > 8) {
    return new TextDecoder("euc-kr").decode(buffer);
  }
  return utf8;
}

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    stationMonthly: DEFAULT_STATION_MONTHLY,
    stationMeta: DEFAULT_STATION_META,
    geojson: DEFAULT_GEOJSON,
    dashboardData: DEFAULT_DASHBOARD_DATA,
    geojsonJs: DEFAULT_GEOJSON_JS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--output") {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--station-monthly") {
      args.stationMonthly = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--station-meta") {
      args.stationMeta = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--geojson") {
      args.geojson = path.resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function markdownTableCells(line) {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

function findSectionTable(text, sourceTitle) {
  const lines = text.split(/\r?\n/u);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${sourceTitle}`);
  if (headingIndex === -1) {
    throw new Error(`Section not found: ${sourceTitle}`);
  }

  const rows = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("## ")) break;
    if (!line.startsWith("|")) continue;
    if (/^\|\s*-+/u.test(line)) continue;
    rows.push(markdownTableCells(line));
  }

  if (rows.length < 2) {
    throw new Error(`No markdown table rows found for section: ${sourceTitle}`);
  }

  return rows.slice(1).map((cells) => ({
    year: Number(cells[0]),
    values: cells.slice(1, 13),
  }));
}

function parseValueCell(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { value: null, displayValue: "", sign: "", label: "" };
  }

  const match = trimmed.match(/^(.+?)\(([+\-0])\)$/u);
  if (!match) {
    const value = Number(trimmed);
    return {
      value: Number.isFinite(value) ? value : null,
      displayValue: trimmed,
      sign: "",
      label: trimmed,
    };
  }

  const value = Number(match[1]);
  return {
    value: Number.isFinite(value) ? value : null,
    displayValue: match[1],
    sign: match[2],
    label: `${match[1]} (${match[2]})`,
  };
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/u, "").split(/\r?\n/u).filter((line) => line.trim());
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]));
  });
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function quantileInc(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

function percentileRank(values, value) {
  if (values.length === 0 || !Number.isFinite(value)) return null;
  const below = values.filter((candidate) => candidate < value).length;
  const same = values.filter((candidate) => candidate === value).length;
  return ((below + 0.5 * same) / values.length) * 100;
}

function signLabel(sign, kind) {
  if (kind === "precipitation") {
    if (sign === "-") return "적음";
    if (sign === "+") return "많음";
    if (sign === "0") return "비슷";
    return "자료없음";
  }
  if (sign === "-") return "낮음";
  if (sign === "+") return "높음";
  if (sign === "0") return "비슷";
  return "자료없음";
}

function classNameFor(sign, kind) {
  if (!sign) return "missing";
  if (kind === "precipitation") {
    return sign === "-" ? "precip-dry" : sign === "+" ? "precip-wet" : "similar";
  }
  return sign === "-" ? "temp-cool" : sign === "+" ? "temp-warm" : "similar";
}

function keyFor(variable, year, month) {
  return `${variable}:${year}:${month}`;
}

function buildStationMeta(rows) {
  const meta = new Map();
  for (const row of rows) {
    const id = Number(row["지점"]);
    if (!REPRESENTATIVE_STATION_IDS.has(id)) continue;
    const lat = Number(row["위도"]);
    const lon = Number(row["경도"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const existing = meta.get(id);
    if (!existing || row["종료일"] === "") {
      meta.set(id, {
        id,
        name: row["지점명"],
        address: row["지점주소"],
        lat,
        lon,
        elevation: Number(row["노장해발고도(m)"]),
      });
    }
  }

  return meta;
}

function buildStationMonthly(rows) {
  return rows
    .map((row) => ({
      stationId: Number(row.station_id),
      stationName: row.station_name,
      year: Number(row.year),
      month: Number(row.month),
      tavg: Number(row.tavg),
      tmin: Number(row.tmin),
      tmax: Number(row.tmax),
      precip: Number(row.precip),
    }))
    .filter((row) => (
      REPRESENTATIVE_STATION_IDS.has(row.stationId)
      && Number.isInteger(row.year)
      && Number.isInteger(row.month)
    ));
}

function buildStationNormals(stationMonthly) {
  const grouped = new Map();
  for (const row of stationMonthly) {
    if (row.year < 1991 || row.year > 2020) continue;
    for (const variable of Object.keys(SOUTH_KOREA_NORMAL_CRITERIA)) {
      const value = row[variable];
      if (!Number.isFinite(value)) continue;
      const key = `${row.stationId}:${row.month}:${variable}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(value);
    }
  }

  const normals = new Map();
  for (const [key, values] of grouped.entries()) {
    const variable = key.split(":").at(-1);
    const normal = mean(values);
    if (TEMPERATURE_VARIABLES.has(variable)) {
      const halfRange = 0.43 * standardDeviation(values);
      normals.set(key, {
        normal,
        lower: normal - halfRange,
        upper: normal + halfRange,
        values,
      });
    } else {
      normals.set(key, {
        normal,
        lower: quantileInc(values, 0.3333),
        upper: quantileInc(values, 0.6667),
        values,
      });
    }
  }

  return normals;
}

function classifyStationValue({ stationId, month, variable, value, normals }) {
  const normal = normals.get(`${stationId}:${month}:${variable}`);
  if (!normal || !Number.isFinite(value)) {
    return null;
  }

  const sign = value < normal.lower ? "-" : value > normal.upper ? "+" : "0";
  return {
    normal: normal.normal,
    lower: normal.lower,
    upper: normal.upper,
    departure: value - normal.normal,
    ratio: normal.normal > 0 ? (value / normal.normal) * 100 : null,
    percentile: percentileRank(normal.values, value),
    sign,
  };
}

function buildDetailData(sections, stationMonthly, stationMeta, stationNormals) {
  const stationByMonth = new Map();
  for (const row of stationMonthly) {
    const monthKey = `${row.year}:${row.month}`;
    if (!stationByMonth.has(monthKey)) stationByMonth.set(monthKey, []);
    stationByMonth.get(monthKey).push(row);
  }

  const details = {};
  for (const section of sections) {
    for (const row of section.rows) {
      row.values.forEach((cell, index) => {
        const month = index + 1;
        const parsed = parseValueCell(cell);
        if (parsed.value === null) return;

        const criteria = SOUTH_KOREA_NORMAL_CRITERIA[section.variable];
        const normal = criteria.normal[month - 1];
        const observed = section.kind === "temperature"
          ? normal + parsed.value
          : parsed.value;
        const departure = section.kind === "temperature"
          ? parsed.value
          : parsed.value - normal;
        const ratio = section.kind === "precipitation" && normal > 0
          ? (parsed.value / normal) * 100
          : null;

        const stations = (stationByMonth.get(`${row.year}:${month}`) ?? [])
          .map((stationRow) => {
            const meta = stationMeta.get(stationRow.stationId);
            const value = stationRow[section.variable];
            const classified = classifyStationValue({
              stationId: stationRow.stationId,
              month,
              variable: section.variable,
              value,
              normals: stationNormals,
            });

            if (!classified || !meta) return null;
            return {
              id: stationRow.stationId,
              name: stationRow.stationName || meta.name,
              lat: round(meta.lat, 4),
              lon: round(meta.lon, 4),
              value: round(value, 1),
              normal: round(classified.normal, 1),
              departure: round(classified.departure, 1),
              ratio: classified.ratio === null ? null : round(classified.ratio, 1),
              percentile: round(classified.percentile, 1),
              sign: classified.sign,
              label: signLabel(classified.sign, section.kind),
            };
          })
          .filter(Boolean)
          .sort((left, right) => {
            const order = { "-": 0, "0": 1, "+": 2 };
            return order[left.sign] - order[right.sign] || left.name.localeCompare(right.name, "ko");
          });

        const counts = { "-": 0, "0": 0, "+": 0 };
        for (const station of stations) counts[station.sign] += 1;
        const stationValues = stations.map((station) => station.value).filter(Number.isFinite);

        details[keyFor(section.variable, row.year, month)] = {
          variable: section.variable,
          kind: section.kind,
          title: section.title,
          year: row.year,
          month,
          unit: section.unit,
          national: {
            value: round(parsed.value, 1),
            observed: round(observed, 1),
            normal: round(normal, 1),
            departure: round(departure, 1),
            ratio: ratio === null ? null : round(ratio, 1),
            sign: parsed.sign,
            label: signLabel(parsed.sign, section.kind),
          },
          stationSummary: {
            count: stations.length,
            low: counts["-"],
            similar: counts["0"],
            high: counts["+"],
            min: stationValues.length ? round(Math.min(...stationValues), 1) : null,
            max: stationValues.length ? round(Math.max(...stationValues), 1) : null,
            mean: stationValues.length ? round(mean(stationValues), 1) : null,
          },
          stations,
        };
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    normalPeriod: "1991-2020",
    stationBasis: SOUTH_KOREA_STATION_POLICY.stationBasis,
    details,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTable(section) {
  const body = section.rows.map((row) => {
    const cells = row.values.map((cell, index) => {
      const month = index + 1;
      const parsed = parseValueCell(cell);
      const detailKey = keyFor(section.variable, row.year, month);
      const clickable = parsed.value === null ? "" : " clickable";
      const ariaLabel = parsed.value === null
        ? `${row.year}년 ${month}월 자료 없음`
        : `${row.year}년 ${month}월 ${section.title} 상세 보기`;
      return `<td class="${classNameFor(parsed.sign, section.kind)}${clickable}" data-detail-key="${escapeHtml(detailKey)}" tabindex="${parsed.value === null ? "-1" : "0"}" title="${escapeHtml(parsed.label)}" aria-label="${escapeHtml(ariaLabel)}">${escapeHtml(parsed.displayValue)}</td>`;
    }).join("");
    return `<tr><th scope="row">${escapeHtml(row.year)}</th>${cells}</tr>`;
  }).join("\n");

  return `<section>
  <h2>${escapeHtml(section.title)}</h2>
  <div class="table-wrap">
    <table>
      <caption>${escapeHtml(section.title)} (${section.unit})</caption>
      <thead>
        <tr><th scope="col">연도</th>${MONTHS.map((month) => `<th scope="col">${month}</th>`).join("")}</tr>
      </thead>
      <tbody>
${body}
      </tbody>
    </table>
  </div>
</section>`;
}

function relativeScriptPath(outputPath, targetPath) {
  return path.relative(path.dirname(outputPath), targetPath).replaceAll(path.sep, "/");
}

function clientScript() {
  const detailStore = window.KMA_MONTHLY_DETAIL_DATA || { details: {} };
  const provinceGeojson = window.KMA_SOUTH_KOREA_PROVINCES || null;
  const activeCellClass = "active-cell";

  const elements = {
    title: document.getElementById("detail-title"),
    valueLabel: document.getElementById("metric-value-label"),
    value: document.getElementById("metric-value"),
    normal: document.getElementById("metric-normal"),
    departure: document.getElementById("metric-departure"),
    ratio: document.getElementById("metric-ratio"),
    bars: document.getElementById("distribution-bars"),
    tableBody: document.getElementById("station-table-body"),
    map: document.getElementById("station-map"),
    note: document.getElementById("detail-note"),
  };

  function formatNumber(value, unit = "", fallback = "-") {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
    return `${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}${unit}`;
  }

  function signClass(sign, kind) {
    if (!sign) return "missing";
    if (sign === "0") return "similar";
    if (kind === "precipitation") return sign === "-" ? "precip-dry" : "precip-wet";
    return sign === "-" ? "temp-cool" : "temp-warm";
  }

  function distributionLabels(kind) {
    return kind === "precipitation"
      ? { low: "적음", similar: "비슷", high: "많음" }
      : { low: "낮음", similar: "비슷", high: "높음" };
  }

  function renderBars(detail) {
    const labels = distributionLabels(detail.kind);
    const total = Math.max(detail.stationSummary.count, 1);
    const rows = [
      ["low", labels.low, detail.stationSummary.low],
      ["similar", labels.similar, detail.stationSummary.similar],
      ["high", labels.high, detail.stationSummary.high],
    ];
    elements.bars.className = `bars ${detail.kind === "precipitation" ? "precip" : "temp"}`;
    elements.bars.innerHTML = rows.map(([key, label, count]) => {
      const width = (count / total) * 100;
      return `<div class="bar-row">
        <span>${label}</span>
        <span class="bar-track"><span class="bar-fill bar-${key}" style="width:${width}%"></span></span>
        <strong>${count}개</strong>
      </div>`;
    }).join("");
  }

  function geometryCoordinates(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return geometry.coordinates;
    if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
    return [];
  }

  function allLonLat(geojson, stations) {
    const points = [];
    if (geojson?.features) {
      for (const feature of geojson.features) {
        for (const ring of geometryCoordinates(feature.geometry)) {
          for (const point of ring) points.push(point);
        }
      }
    }
    for (const station of stations) points.push([station.lon, station.lat]);
    return points;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }

  function mixColor(left, right, weight) {
    const a = hexToRgb(left);
    const b = hexToRgb(right);
    const mixed = a.map((value, index) => Math.round(value + (b[index] - value) * weight));
    return `rgb(${mixed[0]},${mixed[1]},${mixed[2]})`;
  }

  function surfaceConfig(detail, values) {
    if (detail.kind === "precipitation") {
      return {
        label: "월누적강수량",
        unit: "mm",
        valueOf: (station) => station.value,
        colorOf: (value, min, max) => {
          const t = clamp((value - min) / Math.max(max - min, 0.0001), 0, 1);
          if (t < 0.5) return mixColor("#f7fbff", "#9ecae1", t / 0.5);
          return mixColor("#9ecae1", "#238b45", (t - 0.5) / 0.5);
        },
      };
    }

    const absMax = Math.max(0.5, ...values.map((value) => Math.abs(value)));
    return {
      label: "평년편차",
      unit: "℃",
      min: -absMax,
      max: absMax,
      valueOf: (station) => station.departure,
      colorOf: (value) => {
        const t = clamp((value + absMax) / (absMax * 2), 0, 1);
        if (t < 0.5) return mixColor("#2c7fb8", "#f7fbff", t / 0.5);
        return mixColor("#f7fbff", "#d7301f", (t - 0.5) / 0.5);
      },
    };
  }

  function interpolateValue(stations, x, y, valueOf) {
    let weighted = 0;
    let totalWeight = 0;
    for (const station of stations) {
      const value = valueOf(station);
      if (!Number.isFinite(value)) continue;
      const distance = Math.hypot(x - station.x, y - station.y);
      if (distance < 0.001) return value;
      const weight = 1 / distance ** 2;
      weighted += value * weight;
      totalWeight += weight;
    }
    return totalWeight > 0 ? weighted / totalWeight : null;
  }

  function niceStep(rawStep) {
    const exponent = Math.floor(Math.log10(rawStep));
    const fraction = rawStep / 10 ** exponent;
    const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return niceFraction * 10 ** exponent;
  }

  function contourLevels(min, max, targetCount = 9) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [];
    const step = niceStep((max - min) / targetCount);
    const levels = [];
    for (let level = Math.ceil(min / step) * step; level <= max; level += step) {
      if (level > min && level < max) levels.push(Number(level.toFixed(6)));
    }
    return levels.slice(0, 14);
  }

  function edgePoint(edge, cell, level) {
    const { x, y, size, values } = cell;
    const corners = [
      { x, y, value: values[0] },
      { x: x + size, y, value: values[1] },
      { x: x + size, y: y + size, value: values[2] },
      { x, y: y + size, value: values[3] },
    ];
    const pairs = [[0, 1], [1, 2], [3, 2], [0, 3]];
    const [leftIndex, rightIndex] = pairs[edge];
    const left = corners[leftIndex];
    const right = corners[rightIndex];
    const denominator = right.value - left.value;
    const t = denominator === 0 ? 0.5 : (level - left.value) / denominator;
    return {
      x: left.x + (right.x - left.x) * t,
      y: left.y + (right.y - left.y) * t,
    };
  }

  function buildSurface(projectedStations, width, height, margin, config) {
    const cols = 48;
    const rows = 58;
    const size = Math.min((width - margin * 2) / cols, (height - margin * 2) / rows);
    const startX = margin + ((width - margin * 2) - cols * size) / 2;
    const startY = margin + ((height - margin * 2) - rows * size) / 2;
    const nodes = [];

    for (let row = 0; row <= rows; row += 1) {
      const nodeRow = [];
      for (let col = 0; col <= cols; col += 1) {
        const x = startX + col * size;
        const y = startY + row * size;
        nodeRow.push(interpolateValue(projectedStations, x, y, config.valueOf));
      }
      nodes.push(nodeRow);
    }

    const finiteValues = nodes.flat().filter(Number.isFinite);
    const min = config.min ?? Math.min(...finiteValues);
    const max = config.max ?? Math.max(...finiteValues);
    const cells = [];
    const contourCells = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const values = [
          nodes[row][col],
          nodes[row][col + 1],
          nodes[row + 1][col + 1],
          nodes[row + 1][col],
        ];
        if (values.some((value) => !Number.isFinite(value))) continue;
        const x = startX + col * size;
        const y = startY + row * size;
        const centerValue = values.reduce((sum, value) => sum + value, 0) / values.length;
        cells.push(`<rect class="surface-cell" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(size + 0.2).toFixed(1)}" height="${(size + 0.2).toFixed(1)}" fill="${config.colorOf(centerValue, min, max)}"></rect>`);
        contourCells.push({ x, y, size, values });
      }
    }

    const contours = contourLevels(min, max).flatMap((level) => (
      contourCells.flatMap((cell) => {
        const hits = [];
        for (let edge = 0; edge < 4; edge += 1) {
          const pairs = [[0, 1], [1, 2], [3, 2], [0, 3]];
          const [leftIndex, rightIndex] = pairs[edge];
          const left = cell.values[leftIndex] - level;
          const right = cell.values[rightIndex] - level;
          if ((left < 0 && right > 0) || (left > 0 && right < 0)) {
            hits.push(edgePoint(edge, cell, level));
          }
        }
        if (hits.length < 2) return [];
        const className = Math.abs(level) < 0.0001 ? "contour contour-zero" : "contour";
        const title = `${config.label} ${formatNumber(level, config.unit)}`;
        const first = hits[0];
        const second = hits[1];
        const segments = [`<line class="${className}" x1="${first.x.toFixed(1)}" y1="${first.y.toFixed(1)}" x2="${second.x.toFixed(1)}" y2="${second.y.toFixed(1)}"><title>${title}</title></line>`];
        if (hits.length >= 4) {
          const third = hits[2];
          const fourth = hits[3];
          segments.push(`<line class="${className}" x1="${third.x.toFixed(1)}" y1="${third.y.toFixed(1)}" x2="${fourth.x.toFixed(1)}" y2="${fourth.y.toFixed(1)}"><title>${title}</title></line>`);
        }
        return segments;
      })
    ));

    return {
      min,
      max,
      cells: cells.join(""),
      contours: contours.join(""),
    };
  }

  function pointRadius(station, detail) {
    const value = Math.abs(station.departure ?? 0);
    const denominator = detail.kind === "precipitation" ? Math.max(detail.national.normal, 1) : 3;
    return 5 + clamp(value / denominator, 0, 1) * 5;
  }

  function renderMap(detail) {
    const width = 520;
    const height = 640;
    const margin = 18;
    const points = allLonLat(provinceGeojson, detail.stations);
    if (points.length === 0) {
      elements.map.innerHTML = "<p class=\"note\">지도 좌표 자료가 없습니다.</p>";
      return;
    }

    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of points) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    const project = ([lon, lat]) => {
      const x = margin + ((lon - minLon) / (maxLon - minLon)) * (width - margin * 2);
      const y = margin + ((maxLat - lat) / (maxLat - minLat)) * (height - margin * 2);
      return [x, y];
    };

    const provincePathData = provinceGeojson?.features?.map((feature) => {
      const pathData = geometryCoordinates(feature.geometry).map((ring) => (
        ring.map((point, index) => {
          const [x, y] = project(point);
          return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(" ") + " Z"
      )).join(" ");
      return pathData;
    }) ?? [];

    const provincePaths = provincePathData.map((pathData) => `<path class="province" d="${pathData}"></path>`).join("");
    const clipPaths = provincePathData.map((pathData) => `<path d="${pathData}"></path>`).join("");
    const projectedStations = detail.stations.map((station) => {
      const [x, y] = project([station.lon, station.lat]);
      return { ...station, x, y };
    });
    const fieldValues = projectedStations
      .map((station) => detail.kind === "precipitation" ? station.value : station.departure)
      .filter(Number.isFinite);
    const config = surfaceConfig(detail, fieldValues);
    const surface = buildSurface(projectedStations, width, height, margin, config);
    const clipId = `land-clip-${detail.variable}-${detail.year}-${detail.month}`;

    const stationPoints = projectedStations.map((station) => {
      const value = formatNumber(station.value, detail.unit);
      const departure = formatNumber(station.departure, detail.unit);
      const ratio = station.ratio === null ? "" : ` / 평년비 ${formatNumber(station.ratio, "%")}`;
      const radius = pointRadius(station, detail);
      return `<g class="station-point">
        <circle class="station-halo ${signClass(station.sign, detail.kind)}" cx="${station.x.toFixed(1)}" cy="${station.y.toFixed(1)}" r="${radius.toFixed(1)}">
          <title>${station.name}: ${station.label}, 값 ${value}, 편차 ${departure}${ratio}</title>
        </circle>
        <circle class="station-core" cx="${station.x.toFixed(1)}" cy="${station.y.toFixed(1)}" r="2.4"></circle>
      </g>`;
    }).join("");

    elements.map.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img">
      <defs><clipPath id="${clipId}">${clipPaths}</clipPath></defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
      <g clip-path="url(#${clipId})">${surface.cells}${surface.contours}</g>
      ${provincePaths}
      <g class="surface-legend">
        <rect x="16" y="16" width="132" height="42"></rect>
        <text x="25" y="33">${config.label}</text>
        <text x="25" y="50">${formatNumber(surface.min, config.unit)} ~ ${formatNumber(surface.max, config.unit)}</text>
      </g>
      ${stationPoints}
    </svg>`;
  }

  function renderStationTable(detail) {
    const unit = detail.unit;
    elements.tableBody.innerHTML = detail.stations.map((station) => {
      const rowClass = signClass(station.sign, detail.kind);
      return `<tr>
        <th scope="row">${station.name}</th>
        <td class="${rowClass}">${station.label}</td>
        <td>${formatNumber(station.value, unit)}</td>
        <td>${formatNumber(station.normal, unit)}</td>
        <td>${formatNumber(station.departure, unit)}</td>
        <td>${station.ratio === null ? "-" : formatNumber(station.ratio, "%")}</td>
        <td>${formatNumber(station.percentile, "%")}</td>
      </tr>`;
    }).join("");
  }

  function renderDetail(key, cell) {
    const detail = detailStore.details[key];
    if (!detail) return;

    document.querySelectorAll(`.${activeCellClass}`).forEach((node) => node.classList.remove(activeCellClass));
    cell?.classList.add(activeCellClass);

    const isPrecip = detail.kind === "precipitation";
    elements.title.textContent = `${detail.year}년 ${detail.month}월 ${detail.title}`;
    elements.valueLabel.textContent = isPrecip ? "전국 월누적강수량" : "전국 평균값";
    elements.value.textContent = isPrecip
      ? formatNumber(detail.national.observed, "mm")
      : formatNumber(detail.national.observed, "℃");
    elements.normal.textContent = formatNumber(detail.national.normal, detail.unit);
    elements.departure.textContent = formatNumber(detail.national.departure, detail.unit);
    elements.ratio.textContent = isPrecip ? formatNumber(detail.national.ratio, "%") : "-";
    elements.note.textContent = `전국 구분은 ${detail.national.label}이며, 지도와 표는 자료가 있는 ${detail.stationSummary.count}개 대표 지점의 지점별 평년분포입니다.`;

    renderBars(detail);
    renderStationTable(detail);
    renderMap(detail);
  }

  function selectDefaultCell() {
    const cells = Array.from(document.querySelectorAll("td.clickable"));
    const latest = [...cells].reverse().find((cell) => detailStore.details[cell.dataset.detailKey]);
    if (latest) renderDetail(latest.dataset.detailKey, latest);
  }

  document.addEventListener("click", (event) => {
    const cell = event.target.closest("td.clickable");
    if (!cell) return;
    renderDetail(cell.dataset.detailKey, cell);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const cell = event.target.closest("td.clickable");
    if (!cell) return;
    event.preventDefault();
    renderDetail(cell.dataset.detailKey, cell);
  });

  selectDefaultCell();
}

function renderHtml(sections, inputPath, outputPath, dashboardDataPath, geojsonJsPath) {
  const generatedAt = new Date().toISOString().slice(0, 10);
  const detailDataScript = relativeScriptPath(outputPath, dashboardDataPath);
  const geojsonScript = relativeScriptPath(outputPath, geojsonJsPath);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>전국 월별 기온·강수량 편차 대시보드</title>
  <style>
    :root {
      color-scheme: light;
      --border: #d6dce2;
      --head: #f3f5f7;
      --text: #1f2933;
      --muted: #5f6b76;
      --panel: #ffffff;
      --temp-cool: #dcecfb;
      --temp-warm: #fbe2df;
      --precip-dry: #efe3cf;
      --precip-wet: #dcefdc;
      --similar: #ffffff;
      --missing: #f8f9fa;
      --active: #1f5fbf;
      --map-fill: #f8faf8;
      --map-line: #7a858f;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: #ffffff;
      color: var(--text);
      font-family: Arial, "Malgun Gothic", sans-serif;
      line-height: 1.45;
    }

    main {
      max-width: 1560px;
      margin: 0 auto;
      padding: 24px 18px 48px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 0;
    }

    h2 {
      margin: 30px 0 10px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0;
    }

    h3 {
      margin: 0 0 10px;
      font-size: 17px;
      letter-spacing: 0;
    }

    p {
      margin: 6px 0;
      color: var(--muted);
      font-size: 14px;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      margin: 18px 0 10px;
      font-size: 13px;
      color: #33404d;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .swatch {
      width: 18px;
      height: 12px;
      border: 1px solid var(--border);
    }

    .detail-panel {
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: minmax(360px, 1.05fr) minmax(360px, 0.95fr);
      gap: 14px;
      margin: 18px 0 22px;
      padding: 14px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.97);
      box-shadow: 0 8px 18px rgba(31, 41, 51, 0.08);
    }

    .detail-meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(110px, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }

    .metric {
      min-height: 68px;
      padding: 9px 10px;
      border: 1px solid var(--border);
      background: #fbfcfd;
    }

    .metric strong {
      display: block;
      margin-bottom: 4px;
      font-size: 12px;
      color: var(--muted);
      font-weight: 700;
    }

    .metric span {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .bars {
      display: grid;
      gap: 7px;
    }

    .bar-row {
      display: grid;
      grid-template-columns: 54px 1fr 48px;
      gap: 8px;
      align-items: center;
      font-size: 13px;
    }

    .bar-track {
      height: 18px;
      border: 1px solid var(--border);
      background: #f6f8fa;
    }

    .bar-fill {
      display: block;
      height: 100%;
      width: 0;
    }

    .bar-low { background: var(--temp-cool); }
    .bar-similar { background: var(--similar); }
    .bar-high { background: var(--temp-warm); }
    .precip .bar-low { background: var(--precip-dry); }
    .precip .bar-high { background: var(--precip-wet); }

    .map-wrap {
      min-height: 430px;
      border: 1px solid var(--border);
      background: #fbfcfd;
    }

    .map-wrap svg {
      display: block;
      width: 100%;
      height: 430px;
    }

    .province {
      fill: none;
      stroke: var(--map-line);
      stroke-width: 0.6;
    }

    .surface-cell {
      opacity: 0.78;
      shape-rendering: crispEdges;
    }

    .contour {
      stroke: #26323d;
      stroke-width: 0.55;
      stroke-opacity: 0.58;
      vector-effect: non-scaling-stroke;
    }

    .contour-zero {
      stroke-width: 1.1;
      stroke-opacity: 0.9;
    }

    .surface-legend rect {
      fill: rgba(255, 255, 255, 0.86);
      stroke: var(--border);
    }

    .surface-legend text {
      fill: #26323d;
      font-size: 11px;
      font-weight: 700;
    }

    .station-halo {
      fill: rgba(255, 255, 255, 0.28);
      stroke-width: 2.4;
      cursor: pointer;
      vector-effect: non-scaling-stroke;
    }

    .station-core {
      fill: #ffffff;
      stroke: #26323d;
      stroke-width: 0.7;
      pointer-events: none;
      vector-effect: non-scaling-stroke;
    }

    .station {
      cursor: pointer;
    }

    .station-halo.temp-cool { stroke: #2171b5; }
    .station-halo.temp-warm { stroke: #c51b8a; }
    .station-halo.precip-dry { stroke: #8c510a; }
    .station-halo.precip-wet { stroke: #238443; }
    .station-halo.similar { stroke: #ffffff; }

    .station-table-wrap {
      max-height: 260px;
      overflow: auto;
      border: 1px solid var(--border);
      margin-top: 10px;
    }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
    }

    table {
      width: 100%;
      min-width: 980px;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 12px;
    }

    .station-table {
      min-width: 720px;
      table-layout: auto;
    }

    caption {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }

    th,
    td {
      border: 1px solid var(--border);
      padding: 5px 6px;
      text-align: center;
      white-space: nowrap;
    }

    thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: var(--head);
      font-weight: 700;
    }

    tbody th {
      position: sticky;
      left: 0;
      z-index: 1;
      width: 58px;
      background: var(--head);
      font-weight: 700;
    }

    td.clickable {
      cursor: pointer;
    }

    td.clickable:hover,
    td.clickable:focus {
      outline: 2px solid var(--active);
      outline-offset: -2px;
    }

    td.active-cell {
      box-shadow: inset 0 0 0 2px var(--active);
    }

    td.similar { background: var(--similar); }
    td.temp-cool { background: var(--temp-cool); }
    td.temp-warm { background: var(--temp-warm); }
    td.precip-dry { background: var(--precip-dry); }
    td.precip-wet { background: var(--precip-wet); }
    td.missing { background: var(--missing); color: #9aa3ad; }

    .note {
      color: var(--muted);
      font-size: 12px;
    }

    @media (max-width: 980px) {
      .detail-panel {
        position: static;
        grid-template-columns: 1fr;
      }

      .detail-meta {
        grid-template-columns: repeat(2, minmax(120px, 1fr));
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>전국 월별 기온·강수량 편차 대시보드 (1973-2026.04)</h1>
    <p>표의 셀을 클릭하면 해당 연월의 전국값, 평년값, 편차와 62개 지점의 낮음·비슷·높음 또는 적음·비슷·많음 분포가 표시됩니다.</p>
    <p>원자료: ${escapeHtml(inputPath)} / 평년: 1991-2020 / 생성일: ${generatedAt}</p>
    <div class="legend" aria-label="색상 범례">
      <span class="chip"><span class="swatch" style="background: var(--similar)"></span>비슷</span>
      <span class="chip"><span class="swatch" style="background: var(--temp-cool)"></span>기온 낮음</span>
      <span class="chip"><span class="swatch" style="background: var(--temp-warm)"></span>기온 높음</span>
      <span class="chip"><span class="swatch" style="background: var(--precip-dry)"></span>강수 적음</span>
      <span class="chip"><span class="swatch" style="background: var(--precip-wet)"></span>강수 많음</span>
    </div>

    <section class="detail-panel" id="detail-panel" aria-live="polite">
      <div>
        <h3 id="detail-title">셀을 선택하세요</h3>
        <div class="detail-meta">
          <div class="metric"><strong id="metric-value-label">전국값</strong><span id="metric-value">-</span></div>
          <div class="metric"><strong>평년값</strong><span id="metric-normal">-</span></div>
          <div class="metric"><strong>편차</strong><span id="metric-departure">-</span></div>
          <div class="metric"><strong>강수 평년비</strong><span id="metric-ratio">-</span></div>
        </div>
        <div id="distribution-bars" class="bars"></div>
        <p class="note" id="detail-note">기온은 지점별 월평균의 1991-2020 평년값과 변동범위로, 강수량은 지점별 월누적강수량의 1991-2020 33-67 백분위 범위로 분류합니다.</p>
        <div class="station-table-wrap">
          <table class="station-table">
            <caption>선택 월 지점별 값</caption>
            <thead>
              <tr>
                <th scope="col">지점</th>
                <th scope="col">구분</th>
                <th scope="col">값</th>
                <th scope="col">평년</th>
                <th scope="col">편차</th>
                <th scope="col">평년비</th>
                <th scope="col">백분위</th>
              </tr>
            </thead>
            <tbody id="station-table-body">
              <tr><td colspan="7">아직 선택된 셀이 없습니다.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="map-wrap" id="station-map" aria-label="선택 월 지점 분포 지도"></div>
    </section>

    ${sections.map(renderTable).join("\n")}
  </main>
  <script src="${escapeHtml(geojsonScript)}"></script>
  <script src="${escapeHtml(detailDataScript)}"></script>
  <script>(${clientScript.toString()})();</script>
</body>
</html>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [tableText, stationMonthlyText, stationMetaText, geojsonText] = await Promise.all([
    readTextFile(args.input),
    readTextFile(args.stationMonthly),
    readTextFile(args.stationMeta),
    readTextFile(args.geojson),
  ]);

  const sections = SECTION_SPECS.map((section) => ({
    ...section,
    rows: findSectionTable(tableText, section.sourceTitle),
  }));
  const stationMeta = buildStationMeta(parseCsv(stationMetaText));
  const stationMonthly = buildStationMonthly(parseCsv(stationMonthlyText));
  const stationNormals = buildStationNormals(stationMonthly);
  const detailData = buildDetailData(sections, stationMonthly, stationMeta, stationNormals);

  await mkdir(path.dirname(args.output), { recursive: true });
  await mkdir(path.dirname(args.dashboardData), { recursive: true });
  await writeFile(args.dashboardData, `window.KMA_MONTHLY_DETAIL_DATA = ${JSON.stringify(detailData)};\n`, "utf8");
  await writeFile(args.geojsonJs, `window.KMA_SOUTH_KOREA_PROVINCES = ${geojsonText};\n`, "utf8");
  await writeFile(args.output, renderHtml(sections, args.input, args.output, args.dashboardData, args.geojsonJs), "utf8");

  console.log(JSON.stringify({
    input: args.input,
    stationMonthly: args.stationMonthly,
    stationMeta: args.stationMeta,
    output: args.output,
    dashboardData: args.dashboardData,
    geojsonJs: args.geojsonJs,
    sections: sections.map((section) => ({
      title: section.title,
      years: section.rows.length,
      firstYear: section.rows[0]?.year,
      lastYear: section.rows.at(-1)?.year,
    })),
    detailKeys: Object.keys(detailData.details).length,
    stationMetadataCount: stationMeta.size,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
