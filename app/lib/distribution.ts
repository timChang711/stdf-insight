/** Plotting arithmetic only. Never use the display values below for process statistics. */
export type DistributionSettings = { low?: number; high?: number; tick?: number; binWidth?: number };
export type DistributionLimits = { low: number | null; high: number | null };
export type DistributionBin = { from: number; to: number; count: number };
export type DistributionBinSelection = { from: number; to: number; includeUpper: boolean; binWidth: number; index: number };
export type DensitySettings = { binCount?: number; rangeMode?: "data" | "all"; low?: number; high?: number; binWidth?: number };

export const MAX_DISTRIBUTION_BINS = 120;
export const MAX_DISTRIBUTION_TICKS = 16;

/** Shortest decimal that encodes the very same STDF R*4 value, when applicable. */
function displayFloat32(value: number): number {
  if (!Number.isFinite(value) || Math.fround(value) !== value) return value;
  for (let precision = 1; precision <= 9; precision++) {
    const candidate = Number(value.toPrecision(precision));
    if (Math.fround(candidate) === value) return candidate;
  }
  return value;
}

export function formatAxisNumber(value: number, resolution?: number): string {
  if (!Number.isFinite(value)) return "";
  const candidate = displayFloat32(value);
  const display = resolution === undefined || Math.abs(candidate - value) <= Math.abs(resolution) * 1e-4 ? candidate : value;
  const precision = resolution && Number.isFinite(resolution)
    ? Math.min(17, Math.max(12, Math.ceil(Math.log10(Math.max(Math.abs(value), resolution) / resolution)) + 3))
    : 12;
  return String(Number(display.toPrecision(precision)));
}

export function niceStep(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  // Subnormal numbers can underflow the decimal magnitude.
  if (!magnitude) return target;
  const normalized = target / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const result = factor * magnitude;
  return Number.isFinite(result) && result > 0 ? result : target;
}

function snapInteger(value: number): number {
  const nearest = Math.round(value);
  return Math.abs(value - nearest) <= Number.EPSILON * 8 * Math.max(1, Math.abs(value)) ? nearest : value;
}

function usableRange(low: number, high: number): boolean {
  return Number.isFinite(low) && Number.isFinite(high) && high > low && Number.isFinite(high - low);
}

function binRatio(low: number, high: number, width: number): number {
  const ratio = (high - low) / width, nearest = Math.round(ratio);
  // Subtracting two similar axis limits loses more precision than dividing a span.
  const tolerance = Math.min(1e-7, Number.EPSILON * 8 * Math.max(Math.abs(low), Math.abs(high), width) / width);
  return Math.abs(ratio - nearest) <= tolerance ? nearest : ratio;
}

function countBins(low: number, high: number, width: number): number {
  const count = Math.ceil(binRatio(low, high, width));
  // At high offsets, the last nominal edge can round to the axis maximum even
  // while span/width is slightly above an integer. Never emit a zero-width bar.
  return count > 1 && Number.isFinite(count) && low + (count - 1) * width >= high ? count - 1 : count;
}

function tickSequence(low: number, high: number, interval: number): number[] | null {
  if (!Number.isFinite(interval) || interval <= 0) return null;
  const first = Math.ceil(snapInteger(low / interval));
  const last = Math.floor(snapInteger(high / interval));
  const count = last - first + 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || count < 1 || count > MAX_DISTRIBUTION_TICKS + 2) return null;
  const ticks = Array.from({ length: count }, (_, index) => (first + index) * interval)
    .map(value => isDistributionEdge(value, low, interval) ? low : isDistributionEdge(value, high, interval) ? high : value)
    .filter((value, index, all) => value >= low && value <= high && (index === 0 || value !== all[index - 1]));
  return ticks.length > 0 && ticks.length <= MAX_DISTRIBUTION_TICKS ? ticks : null;
}

/** Exact decimal edges can decode a little lower/higher in STDF float32 storage.
 * Recognize only the same encoded value, never a broad relative epsilon.
 * Limit that correction to a tiny fraction of a bar so narrow bins retain detail.
 */
export function isDistributionEdge(value: number, edge: number, width: number): boolean {
  if (value === edge) return true;
  const distance = Math.abs(value - edge);
  const doubleTolerance = Number.EPSILON * 8 * Math.max(Math.abs(value), Math.abs(edge), Math.abs(width));
  return distance <= Math.min(doubleTolerance, width * 1e-8)
    || (Math.fround(edge) === value && distance <= width * 1e-4);
}

export function distributionModel(
  values: readonly number[],
  settings: DistributionSettings = {},
  limits: DistributionLimits = { low: null, high: null },
) {
  let dataMin = Infinity, dataMax = -Infinity, finiteCount = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    dataMin = Math.min(dataMin, value);
    dataMax = Math.max(dataMax, value);
    finiteCount++;
  }
  const candidates = [dataMin, dataMax, limits.low, limits.high]
    .filter((value): value is number => value !== null && Number.isFinite(value));
  let autoLow = candidates.length ? Math.min(...candidates) : 0;
  let autoHigh = candidates.length ? Math.max(...candidates) : 1;
  if (autoLow === autoHigh) {
    const padding = Math.max(Math.abs(autoLow) * .05, 1e-6);
    autoLow -= padding;
    autoHigh += padding;
  }
  // Keep full precision on tightly clustered data: presentation cleanup must not
  // move an endpoint by a meaningful fraction of a bar or hide an observed value.
  const presentationTolerance = (autoHigh - autoLow) / 26 * 1e-4;
  const cleanLow = displayFloat32(autoLow), cleanHigh = displayFloat32(autoHigh);
  if (Math.abs(cleanLow - autoLow) <= presentationTolerance) autoLow = cleanLow;
  if (Math.abs(cleanHigh - autoHigh) <= presentationTolerance) autoHigh = cleanHigh;
  const autoRangeValid = usableRange(autoLow, autoHigh);
  if (!autoRangeValid) {
    autoLow = -Number.MAX_VALUE / 2;
    autoHigh = Number.MAX_VALUE / 2;
  }
  const autoScale = { low: autoLow, high: autoHigh };
  const selectedLow = settings.low ?? autoLow, selectedHigh = settings.high ?? autoHigh;
  const scaleValid = usableRange(selectedLow, selectedHigh);
  const min = scaleValid ? selectedLow : autoLow, max = scaleValid ? selectedHigh : autoHigh;
  const spread = max - min;
  const axisResolution = Math.max(Number.MIN_VALUE, Number.EPSILON * 2 * Math.max(Math.abs(min), Math.abs(max)));
  const autoTick = niceStep(Math.max(spread / 5, axisResolution)), selectedTick = settings.tick ?? autoTick;
  const requestedTicks = tickSequence(min, max, selectedTick);
  const tickValid = requestedTicks !== null;
  const effectiveTick = tickValid ? selectedTick : autoTick;
  const ticks = requestedTicks ?? tickSequence(min, max, autoTick) ?? [min, max];
  const autoBinWidth = niceStep(Math.max(spread / 26, axisResolution)), selectedBinWidth = settings.binWidth ?? autoBinWidth;
  const requestedBinCount = countBins(min, max, selectedBinWidth);
  const binValid = Number.isFinite(selectedBinWidth) && selectedBinWidth > 0
    && selectedBinWidth >= axisResolution && Number.isFinite(requestedBinCount)
    && requestedBinCount >= 1 && requestedBinCount <= MAX_DISTRIBUTION_BINS;
  const effectiveBinWidth = binValid ? selectedBinWidth : autoBinWidth;
  const binCount = Math.max(1, Math.min(MAX_DISTRIBUTION_BINS, countBins(min, max, effectiveBinWidth)));
  const bins: DistributionBin[] = Array.from({ length: binCount }, (_, index) => ({
    from: min + index * effectiveBinWidth,
    to: index === binCount - 1 ? max : Math.min(max, min + (index + 1) * effectiveBinWidth),
    count: 0,
  }));
  let visibleCount = 0, belowCount = 0, aboveCount = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min && !isDistributionEdge(value, min, effectiveBinWidth)) { belowCount++; continue; }
    if (value > max && !isDistributionEdge(value, max, effectiveBinWidth)) { aboveCount++; continue; }
    const position = (value - min) / effectiveBinWidth;
    const nearest = Math.round(position);
    const edge = min + nearest * effectiveBinWidth;
    const index = Math.floor(isDistributionEdge(value, edge, effectiveBinWidth) ? nearest : position);
    bins[Math.max(0, Math.min(binCount - 1, index))].count++;
    visibleCount++;
  }
  const errors = [
    !autoRangeValid ? "The full data range exceeds the chart's numeric capacity." : "",
    !scaleValid ? "X Max must be greater than X Min and both limits must be finite." : "",
    !tickValid ? "Tick interval must be positive and show 1 to 16 ticks in the selected range." : "",
    !binValid ? "Bin width must be positive, distinguishable at this axis scale, and produce no more than 120 bars." : "",
  ].filter(Boolean);
  const hasPartialBin = !isDistributionEdge(max, min + binCount * effectiveBinWidth, effectiveBinWidth);
  return {
    autoScale, autoTick, autoBinWidth, min, max, spread, selectedLow, selectedHigh, selectedTick, selectedBinWidth,
    effectiveTick, effectiveBinWidth, ticks, bins, binCount, finiteCount, visibleCount, belowCount, aboveCount,
    nonFiniteCount: values.length - finiteCount, scaleValid, tickValid, binValid, errors, hasPartialBin,
  };
}

function atOrAboveDistributionEdge(value: number, edge: number, width: number): boolean {
  return value >= edge || isDistributionEdge(value, edge, width);
}

/** Match the full data bin, even when the chart viewport crops part of it.
 * The same edge comparison as density bin assignment keeps STDF float32
 * boundary values in exactly one bin; only the final bin includes its upper edge.
 */
export function isValueInDistributionBin(value: number, selection: DistributionBinSelection): boolean {
  if (!Number.isFinite(value)) return false;
  const { from, to, binWidth, includeUpper } = selection;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || !Number.isFinite(binWidth) || binWidth <= 0) return false;
  if (!atOrAboveDistributionEdge(value, from, binWidth)) return false;
  return includeUpper
    ? value <= to || isDistributionEdge(value, to, binWidth)
    : !atOrAboveDistributionEdge(value, to, binWidth);
}

/** Interpolate without overflowing when the finite endpoints straddle zero. */
function densityEdge(low: number, high: number, fraction: number): number {
  if (fraction === 0) return low;
  if (fraction === 1) return high;
  const span = high - low;
  return Number.isFinite(span) ? low + span * fraction : low * (1 - fraction) + high * fraction;
}

function paddedDensityRange(value: number) {
  const padding = Math.max(Math.abs(value) * .05, 1e-6);
  return { low: Math.max(-Number.MAX_VALUE, value - padding), high: Math.min(Number.MAX_VALUE, value + padding) };
}

/**
 * Histogram resolution belongs to the observed data, independently of the view.
 * Every finite value is binned, including values outside a cropped viewport.
 * dataScale is the observed range, padded only for constant or absent data;
 * binnedCount counts all finite records while visibleCount counts the viewport.
 */
export function densityDistributionModel(
  values: readonly number[],
  settings: DensitySettings = {},
  limits: DistributionLimits = { low: null, high: null },
) {
  let dataMin = Infinity, dataMax = -Infinity, finiteCount = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    dataMin = Math.min(dataMin, value);
    dataMax = Math.max(dataMax, value);
    finiteCount++;
  }
  const constantData = finiteCount > 0 && dataMin === dataMax;
  const dataScale = !finiteCount ? { low: 0, high: 1 }
    : constantData ? paddedDensityRange(dataMin) : { low: dataMin, high: dataMax };
  const dataSpan = dataScale.high - dataScale.low;
  const requestedBinCount = settings.binCount ?? 50;
  const countValid = Number.isInteger(requestedBinCount) && requestedBinCount >= 1 && requestedBinCount <= MAX_DISTRIBUTION_BINS;
  let autoCount = constantData || !finiteCount ? 1 : countValid ? requestedBinCount : 50;
  if (!Number.isFinite(dataSpan)) autoCount = Math.max(2, autoCount);
  let autoEdges: number[] = [];
  // At large offsets or subnormal spans there may be fewer representable edges
  // than the slider requests. Reduce the count instead of emitting empty-width bars.
  for (; autoCount >= 1; autoCount--) {
    autoEdges = Array.from({ length: autoCount + 1 }, (_, index) => densityEdge(dataScale.low, dataScale.high, index / autoCount));
    if (autoEdges.every((edge, index) => Number.isFinite(edge) && (index === 0 || edge > autoEdges[index - 1]))) break;
  }
  const autoBinWidth = Number.isFinite(dataSpan) ? dataSpan / autoCount : dataScale.high / autoCount - dataScale.low / autoCount;
  const selectedBinWidth = settings.binWidth ?? autoBinWidth;
  let edges = autoEdges;
  let binValid = countValid;
  if (settings.binWidth !== undefined) {
    const width = settings.binWidth;
    const ratio = Number.isFinite(dataSpan) ? binRatio(dataScale.low, dataScale.high, width) : dataScale.high / width - dataScale.low / width;
    const manualCount = constantData || !finiteCount ? 1 : Math.max(1, Math.ceil(ratio));
    binValid = Number.isFinite(width) && width > 0 && Number.isFinite(ratio) && manualCount <= MAX_DISTRIBUTION_BINS;
    if (binValid) {
      const anchor = constantData ? Math.max(-Number.MAX_VALUE, dataMin - width / 2) : dataScale.low;
      const manualEdges = Array.from({ length: manualCount + 1 }, (_, index) => anchor + index * width);
      // Manual width also retains a full final bin. Its right edge can extend
      // beyond the data or viewport; the chart clips the view, not the data bins.
      binValid = manualEdges.every((edge, index) => Number.isFinite(edge) && (index === 0 || edge > manualEdges[index - 1]))
        && (!finiteCount || manualEdges[manualCount] >= dataMax || isDistributionEdge(manualEdges[manualCount], dataMax, width));
      if (binValid) edges = manualEdges;
    }
  }
  const effectiveBinWidth = binValid && settings.binWidth !== undefined ? settings.binWidth : autoBinWidth;
  const bins: DistributionBin[] = edges.slice(0, -1).map((from, index) => ({ from, to: edges[index + 1], count: 0 }));
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    let left = 0, right = bins.length - 1;
    while (left < right) {
      const middle = Math.ceil((left + right) / 2);
      if (atOrAboveDistributionEdge(value, bins[middle].from, effectiveBinWidth)) left = middle;
      else right = middle - 1;
    }
    bins[left].count++;
  }

  let autoLow = dataScale.low, autoHigh = dataScale.high;
  if (settings.rangeMode === "all") {
    for (const limit of [limits.low, limits.high]) {
      if (limit === null || !Number.isFinite(limit)) continue;
      autoLow = Math.min(autoLow, limit);
      autoHigh = Math.max(autoHigh, limit);
    }
  }
  const autoRangeValid = usableRange(autoLow, autoHigh);
  if (!autoRangeValid) { autoLow = -Number.MAX_VALUE / 2; autoHigh = Number.MAX_VALUE / 2; }
  const autoScale = { low: autoLow, high: autoHigh };
  const selectedLow = settings.low ?? autoLow, selectedHigh = settings.high ?? autoHigh;
  const scaleValid = usableRange(selectedLow, selectedHigh);
  const min = scaleValid ? selectedLow : autoLow, max = scaleValid ? selectedHigh : autoHigh;
  const spread = max - min;
  const axisResolution = Math.max(Number.MIN_VALUE, Number.EPSILON * 2 * Math.max(Math.abs(min), Math.abs(max)));
  const autoTick = niceStep(Math.max(spread / 5, axisResolution));
  const ticks = tickSequence(min, max, autoTick) ?? [min, max];
  let visibleCount = 0, belowCount = 0, aboveCount = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min && !isDistributionEdge(value, min, effectiveBinWidth)) belowCount++;
    else if (value > max && !isDistributionEdge(value, max, effectiveBinWidth)) aboveCount++;
    else visibleCount++;
  }
  const errors = [
    !autoRangeValid ? "The full data range exceeds the chart's numeric capacity." : "",
    !scaleValid ? "X Max must be greater than X Min and both limits must be finite." : "",
    !binValid ? settings.binWidth !== undefined
      ? "Bin width must be positive, distinguishable within the data, and produce no more than 120 bars."
      : "Bar count must be a whole number from 1 to 120." : "",
  ].filter(Boolean);
  return {
    autoScale, dataScale, autoTick, autoBinWidth, min, max, spread, selectedLow, selectedHigh,
    selectedTick: autoTick, selectedBinWidth, effectiveTick: autoTick, effectiveBinWidth,
    ticks, bins, binCount: bins.length, requestedBinCount, finiteCount, binnedCount: finiteCount,
    visibleCount, belowCount, aboveCount, nonFiniteCount: values.length - finiteCount,
    scaleValid, tickValid: true, binValid, errors, hasPartialBin: false,
  };
}
