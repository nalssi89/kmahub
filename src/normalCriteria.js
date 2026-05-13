const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const TEMPERATURE_VARIABLES = new Set(["tavg", "tmax", "tmin"]);

export const SOUTH_KOREA_STATION_POLICY = {
  normalPeriod: { startYear: 1991, endYear: 2020 },
  stationCount: 62,
  stationBasis:
    "South Korea mainland 62 representative stations, excluding Jeju. Official 1991-2020 normals use merged Daegu and Jeonju station ids.",
  representativeStationIds: [
    108, 112, 119, 201, 202, 203,
    90, 105, 100, 216,
    211, 95, 101, 212, 114,
    131, 127, 226, 135, 221,
    133, 232, 129, 235, 236, 238,
    143, 281, 138, 279, 278, 136, 273, 272, 277, 130, 271,
    159, 152, 284, 285, 289, 288, 295, 192, 155, 162, 294,
    146, 243, 245, 140, 247, 244, 248,
    156, 165, 261, 260, 170, 262, 168,
  ],
  officialNormalStationIds: [
    108, 112, 119, 201, 202, 203,
    90, 105, 100, 216,
    211, 95, 101, 212, 114,
    131, 127, 226, 135, 221,
    133, 232, 129, 235, 236, 238,
    860, 281, 138, 279, 278, 136, 273, 272, 277, 130, 271,
    159, 152, 284, 285, 289, 288, 295, 192, 155, 162, 294,
    864, 243, 245, 140, 247, 244, 248,
    156, 165, 261, 260, 170, 262, 168,
  ],
  mergeRules: [
    {
      targetStationId: 860,
      targetName: "Daegu(Sinam)",
      sourceSegments: [
        { stationId: 143, name: "Daegu", startDate: "1991-01-01", endDate: "2015-06-11" },
        { stationId: 860, name: "Sinam", startDate: "2015-06-12", endDate: "2020-12-31" },
      ],
    },
    {
      targetStationId: 864,
      targetName: "Jeonju(Wansan)",
      sourceSegments: [
        { stationId: 146, name: "Jeonju", startDate: "1991-01-01", endDate: "2015-06-30" },
        { stationId: 864, name: "Wansan", startDate: "2015-07-01", endDate: "2020-12-31" },
      ],
    },
  ],
  excludedFromSouthKoreaStationIds: [184, 185, 188, 189],
};

export const SOUTH_KOREA_NORMAL_CRITERIA = {
  tavg: {
    label: "mean_temperature",
    unit: "degC",
    normal: [-0.9, 1.2, 6.1, 12.1, 17.3, 21.4, 24.6, 25.1, 20.5, 14.3, 7.6, 1.1],
    halfRange: [0.6, 0.6, 0.5, 0.5, 0.3, 0.3, 0.6, 0.5, 0.3, 0.4, 0.6, 0.6],
  },
  tmax: {
    label: "maximum_temperature",
    unit: "degC",
    normal: [4.4, 7.0, 12.2, 18.6, 23.5, 26.7, 28.9, 29.8, 25.9, 20.7, 13.6, 6.6],
    halfRange: [0.6, 0.6, 0.6, 0.6, 0.4, 0.4, 0.7, 0.6, 0.3, 0.4, 0.5, 0.7],
  },
  tmin: {
    label: "minimum_temperature",
    unit: "degC",
    normal: [-5.7, -3.9, 0.5, 6.0, 11.6, 16.8, 21.2, 21.6, 16.1, 9.0, 2.5, -3.6],
    halfRange: [0.7, 0.6, 0.4, 0.6, 0.3, 0.3, 0.5, 0.5, 0.5, 0.6, 0.7, 0.6],
  },
  precip: {
    label: "precipitation",
    unit: "mm",
    normal: [26.2, 35.7, 56.5, 89.7, 102.1, 148.2, 296.5, 282.6, 155.1, 63.0, 48.0, 28.0],
    lower: [17.4, 27.5, 42.7, 70.3, 79.3, 101.6, 245.9, 225.3, 84.2, 37.0, 30.7, 19.8],
    upper: [26.8, 44.9, 58.5, 99.3, 125.5, 174.0, 308.2, 346.7, 202.3, 64.3, 55.1, 28.6],
  },
};

export const SOUTH_KOREA_NORMAL_METHOD = {
  regionAggregation: "Equal-weight monthly mean of the 62 representative mainland stations.",
  temperature:
    "For normal-range recalculation, build station daily 5-day centered moving averages, aggregate to yearly monthly South Korea means for 1991-2020, then use normal +/- 0.43 * sample standard deviation.",
  precipitation:
    "Use yearly monthly accumulated South Korea precipitation values for 1991-2020. The similar range is the 33-67 percentile interval. This implementation uses Excel PERCENTILE.INC-style interpolation with 0.3333 and 0.6667 probabilities for recalculation; official published bounds are exposed for classification.",
  stationMerge:
    "Official 1991-2020 normals use 860 for merged Daegu/Sinam and 864 for merged Jeonju/Wansan instead of plain 143 and 146.",
};

function assertVariable(variable) {
  if (!Object.hasOwn(SOUTH_KOREA_NORMAL_CRITERIA, variable)) {
    throw new Error(`Unsupported variable: ${variable}`);
  }
}

function assertMonth(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`month must be an integer from 1 to 12. Received: ${month}`);
  }
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function roundDisplay(value) {
  return roundTo(value, 1);
}

function roundHundredthThenDisplay(value) {
  return roundDisplay(roundTo(value, 2));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }

  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function quantileInc(values, probability) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  const weight = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

function normalizeValues(values) {
  const normalized = values.map((value) => Number(value));
  if (normalized.some((value) => !Number.isFinite(value))) {
    throw new Error("values must contain only finite numbers.");
  }
  return normalized;
}

function buildCriteriaRow(variable, month) {
  assertVariable(variable);
  assertMonth(month);

  const source = SOUTH_KOREA_NORMAL_CRITERIA[variable];
  const normal = source.normal[month - 1];

  if (TEMPERATURE_VARIABLES.has(variable)) {
    const halfRange = source.halfRange[month - 1];
    return {
      variable,
      label: source.label,
      month,
      unit: source.unit,
      normal,
      similarRangeHalf: halfRange,
      lower: roundDisplay(normal - halfRange),
      upper: roundDisplay(normal + halfRange),
      signValueType: "departure_from_normal",
      calculationMethod: "temperature_5day_centered_moving_average_0.43_sample_sigma",
    };
  }

  return {
    variable,
    label: source.label,
    month,
    unit: source.unit,
    normal,
    lower: source.lower[month - 1],
    upper: source.upper[month - 1],
    signValueType: "monthly_accumulated_precipitation",
    calculationMethod: "precip_monthly_accumulation_official_33_67_percentile_range",
  };
}

export function getSouthKoreaNormalCriteria({ variable, month } = {}) {
  const variables = variable ? [variable] : Object.keys(SOUTH_KOREA_NORMAL_CRITERIA);
  const months = month ? [Number(month)] : MONTHS;

  return variables.flatMap((currentVariable) => months.map((currentMonth) => buildCriteriaRow(currentVariable, currentMonth)));
}

export function computeSouthKoreaNormalCriteria({
  variable,
  values,
  lowerProbability = 0.3333,
  upperProbability = 0.6667,
}) {
  assertVariable(variable);
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("values must be a non-empty numeric array.");
  }

  const numericValues = normalizeValues(values);
  const normalValue = TEMPERATURE_VARIABLES.has(variable)
    ? roundDisplay(mean(numericValues))
    : roundHundredthThenDisplay(mean(numericValues));

  if (TEMPERATURE_VARIABLES.has(variable)) {
    const standardDeviation = sampleStandardDeviation(numericValues);
    const halfRange = roundDisplay(0.43 * standardDeviation);
    return {
      variable,
      count: numericValues.length,
      normal: normalValue,
      sampleStandardDeviation: roundDisplay(standardDeviation),
      similarRangeHalf: halfRange,
      lower: roundDisplay(normalValue - halfRange),
      upper: roundDisplay(normalValue + halfRange),
      calculationMethod: "temperature_5day_centered_moving_average_0.43_sample_sigma",
    };
  }

  return {
    variable,
    count: numericValues.length,
    normal: normalValue,
    lower: roundDisplay(quantileInc(numericValues, lowerProbability)),
    upper: roundDisplay(quantileInc(numericValues, upperProbability)),
    lowerProbability,
    upperProbability,
    calculationMethod: "precip_monthly_accumulation_percentile_inc",
  };
}

export function classifySouthKoreaMonthlyValue({
  variable,
  month,
  observedValue,
  departureValue,
}) {
  const criteria = buildCriteriaRow(variable, Number(month));

  if (TEMPERATURE_VARIABLES.has(variable)) {
    const departure = departureValue === undefined || departureValue === null
      ? roundDisplay(roundDisplay(Number(observedValue)) - roundDisplay(criteria.normal))
      : roundDisplay(Number(departureValue));

    if (!Number.isFinite(departure)) {
      throw new Error("Temperature classification requires observedValue or departureValue.");
    }

    return {
      ...criteria,
      departure,
      sign: departure < -criteria.similarRangeHalf ? "-" : departure > criteria.similarRangeHalf ? "+" : "0",
      classification: departure < -criteria.similarRangeHalf ? "low" : departure > criteria.similarRangeHalf ? "high" : "similar",
      display: `${departure.toFixed(1)}(${departure < -criteria.similarRangeHalf ? "-" : departure > criteria.similarRangeHalf ? "+" : "0"})`,
    };
  }

  const value = roundDisplay(Number(observedValue));
  if (!Number.isFinite(value)) {
    throw new Error("Precipitation classification requires observedValue.");
  }

  const sign = value < criteria.lower ? "-" : value > criteria.upper ? "+" : "0";
  return {
    ...criteria,
    observedValue: value,
    sign,
    classification: sign === "-" ? "dry" : sign === "+" ? "wet" : "similar",
    display: `${value.toFixed(1)}(${sign})`,
  };
}

export function validateSouthKoreaNormalCriteria() {
  const rows = getSouthKoreaNormalCriteria();
  const mismatches = [];

  for (const variable of Object.keys(SOUTH_KOREA_NORMAL_CRITERIA)) {
    const source = SOUTH_KOREA_NORMAL_CRITERIA[variable];
    if (source.normal.length !== 12) {
      mismatches.push({ variable, field: "normal", expectedLength: 12, actualLength: source.normal.length });
    }
    if (TEMPERATURE_VARIABLES.has(variable) && source.halfRange.length !== 12) {
      mismatches.push({ variable, field: "halfRange", expectedLength: 12, actualLength: source.halfRange.length });
    }
    if (variable === "precip") {
      for (const field of ["lower", "upper"]) {
        if (source[field].length !== 12) {
          mismatches.push({ variable, field, expectedLength: 12, actualLength: source[field].length });
        }
      }
    }
  }

  return {
    ok: mismatches.length === 0,
    criteriaRows: rows.length,
    expectedCriteriaRows: 48,
    stationCount: SOUTH_KOREA_STATION_POLICY.stationCount,
    officialNormalStationCount: SOUTH_KOREA_STATION_POLICY.officialNormalStationIds.length,
    representativeStationCount: SOUTH_KOREA_STATION_POLICY.representativeStationIds.length,
    mergeRuleCount: SOUTH_KOREA_STATION_POLICY.mergeRules.length,
    mismatches,
  };
}
