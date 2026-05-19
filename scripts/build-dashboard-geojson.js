#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const INPUT = path.resolve("data", "map", "skorea-provinces-geo.json");
const OUTPUT = path.resolve("data", "dashboard", "skorea_provinces_geo_simplified.js");
const TOLERANCE = 0.006;

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyDPStep(points, first, last, toleranceSquared, simplified) {
  let maxDistance = toleranceSquared;
  let index = null;

  for (let current = first + 1; current < last; current += 1) {
    const distance = squaredSegmentDistance(points[current], points[first], points[last]);
    if (distance > maxDistance) {
      index = current;
      maxDistance = distance;
    }
  }

  if (index !== null) {
    if (index - first > 1) simplifyDPStep(points, first, index, toleranceSquared, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyDPStep(points, index, last, toleranceSquared, simplified);
  }
}

function simplifyLine(points, tolerance) {
  if (points.length <= 20) return points;
  const simplified = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, tolerance * tolerance, simplified);
  simplified.push(points.at(-1));
  return simplified;
}

function simplifyRing(ring) {
  if (ring.length <= 20) return ring;
  const open = ring.slice(0, -1);
  const simplified = simplifyLine(open, TOLERANCE);
  simplified.push(simplified[0]);
  return simplified;
}

function simplifyGeometry(geometry) {
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(simplifyRing),
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing)),
    };
  }

  return geometry;
}

async function main() {
  const geojson = JSON.parse(await readFile(INPUT, "utf8"));
  const simplified = {
    ...geojson,
    features: geojson.features.map((feature) => ({
      ...feature,
      geometry: simplifyGeometry(feature.geometry),
    })),
  };

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `window.KMA_SOUTH_KOREA_PROVINCES_SIMPLIFIED = ${JSON.stringify(simplified)};\n`, "utf8");

  console.log(JSON.stringify({
    input: INPUT,
    output: OUTPUT,
    inputBytes: JSON.stringify(geojson).length,
    outputBytes: JSON.stringify(simplified).length,
    features: simplified.features.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
