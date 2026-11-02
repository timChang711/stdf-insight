import assert from 'node:assert/strict';
import test from 'node:test';
import { densityDistributionModel, distributionModel, formatAxisNumber, isValueInDistributionBin, niceStep } from '../app/lib/distribution.ts';
import { stats } from '../app/lib/statistics.ts';

test('STDF float32 5.6 to 6 with width 0.02 has 20 bars and includes both edges', () => {
  const original = [Math.fround(5.6), Math.fround(5.62), Math.fround(5.98), 6];
  const values = Object.freeze([...original]);
  const result = distributionModel(values, { binWidth: .02 }, { low: Math.fround(5.6), high: 6 });
  assert.equal(result.min, 5.6);
  assert.equal(result.max, 6);
  assert.equal(result.binCount, 20);
  assert.equal(result.visibleCount, 4);
  assert.equal(result.bins[0].count, 1);
  assert.equal(result.bins[1].count, 1);
  assert.equal(result.bins[19].count, 2);
  assert.equal(result.hasPartialBin, false);
  assert.equal(result.effectiveBinWidth, .02);
  assert.deepEqual(values, original);
  assert.equal(formatAxisNumber(Math.fround(5.6)), '5.6');
});

test('decimal bins are left inclusive; internal edges enter the following bar; final edge included', () => {
  const result = distributionModel([0, .1, .2, .3, .4, .5, .6], { low: 0, high: .6, binWidth: .1 });
  assert.equal(result.binCount, 6);
  assert.deepEqual(result.bins.map(bin => bin.count), [1, 1, 1, 1, 1, 2]);
  assert.equal(result.hasPartialBin, false);
  assert.equal(result.bins.at(-1).to, .6);
});

test('values genuinely below or above decimal edges are not rounded into them', () => {
  const result = distributionModel([-.00000001, .1 - 1e-10, .1, .1 + 1e-10, .3 + 1e-10], { low: 0, high: .3, binWidth: .1 });
  assert.deepEqual(result.bins.map(bin => bin.count), [1, 2, 0]);
  assert.equal(result.belowCount, 1);
  assert.equal(result.aboveCount, 1);
  assert.equal(result.visibleCount, 3);
});

test('non-divisible width retains requested width and identifies the shorter final bar', () => {
  const result = distributionModel([0, .2, .4, .6, .8, .95, 1], { low: 0, high: 1, binWidth: .3 });
  assert.equal(result.binCount, 4);
  assert.equal(result.effectiveBinWidth, .3);
  assert.equal(result.bins.at(-1).to, 1);
  assert.deepEqual(result.bins.map(bin => bin.count), [2, 1, 2, 2]);
  assert.equal(result.hasPartialBin, true);
});

test('automatic domain includes observed extrema and either finite spec limit', () => {
  assert.deepEqual(distributionModel([2, 3], {}, { low: 1, high: 4 }).autoScale, { low: 1, high: 4 });
  assert.deepEqual(distributionModel([-1, 5], {}, { low: 1, high: 4 }).autoScale, { low: -1, high: 5 });
  assert.deepEqual(distributionModel([2, 3], {}, { low: null, high: 4 }).autoScale, { low: 2, high: 4 });
  assert.deepEqual(distributionModel([2, 3], {}, { low: 1, high: null }).autoScale, { low: 1, high: 3 });
  assert.deepEqual(distributionModel([2, 3], {}, { low: NaN, high: Infinity }).autoScale, { low: 2, high: 3 });
});

test('constant, zero and absent finite values produce a bounded usable chart', () => {
  for (const values of [[5, 5], [0, 0], [], [NaN, Infinity, -Infinity]]) {
    const result = distributionModel(values);
    assert.ok(result.max > result.min);
    assert.ok(result.bins.length > 0 && result.bins.length <= 120);
    assert.ok(result.ticks.length > 0 && result.ticks.length <= 16);
    assert.equal(result.visibleCount, values.filter(Number.isFinite).length);
    assert.ok(result.bins.every(bin => Number.isFinite(bin.from) && Number.isFinite(bin.to) && bin.to > bin.from));
  }
});

test('nonfinite values and cropped data have explicit, conserved counts', () => {
  const result = distributionModel([-2, 0, 1, 2, 4, NaN, Infinity], { low: 0, high: 2, binWidth: 1 });
  assert.deepEqual(result.bins.map(bin => bin.count), [1, 2]);
  assert.equal(result.finiteCount, 5);
  assert.equal(result.nonFiniteCount, 2);
  assert.equal(result.belowCount, 1);
  assert.equal(result.aboveCount, 1);
  assert.equal(result.visibleCount, 3);
  assert.equal(result.finiteCount, result.visibleCount + result.belowCount + result.aboveCount);
});

test('invalid settings safely fall back, with bounded allocation and clear errors', () => {
  for (const value of [0, -1, NaN, Infinity, Number.MIN_VALUE]) {
    const result = distributionModel([0, 1], { binWidth: value, tick: value });
    assert.equal(result.binValid, false);
    assert.equal(result.tickValid, false);
    assert.ok(result.bins.length <= 120 && result.ticks.length <= 16);
    assert.equal(result.visibleCount, 2);
    assert.equal(result.errors.length, 2);
  }
  for (const limits of [{ low: 2, high: 1 }, { low: 1, high: 1 }, { low: NaN, high: 1 }]) {
    const result = distributionModel([0, 1], limits);
    assert.equal(result.scaleValid, false);
    assert.equal(result.min, 0);
    assert.equal(result.max, 1);
  }
});

test('tick count uses actual grid alignment and includes decimal endpoints once', () => {
  assert.deepEqual(distributionModel([0, .3], { tick: .1 }).ticks.map(formatAxisNumber), ['0', '0.1', '0.2', '0.3']);
  const sixteen = distributionModel([.01, .159], { tick: .01 });
  assert.equal(sixteen.tickValid, true);
  assert.equal(sixteen.ticks.length, 15);
  assert.equal(distributionModel([0, 1.6], { tick: .1 }).tickValid, false);
  assert.equal(distributionModel([5.6, 6], { tick: 10 }).tickValid, false);
});

test('narrow ranges do not collapse genuinely distinct float32 measurements', () => {
  const first = Math.fround(5.6), second = Math.fround(first + 5e-7);
  const result = distributionModel([first, second], { low: first, high: second, binWidth: (second - first) / 2 });
  assert.equal(result.binCount, 2);
  assert.deepEqual(result.bins.map(bin => bin.count), [1, 1]);
  assert.equal(result.visibleCount, 2);
  const automatic = distributionModel([first, second]);
  assert.equal(automatic.visibleCount, 2);
  assert.equal(automatic.min, first);
  assert.ok(automatic.bins.every(bin => bin.to > bin.from));
  assert.notEqual(formatAxisNumber(automatic.min, automatic.effectiveBinWidth), formatAxisNumber(automatic.max, automatic.effectiveBinWidth));
});

test('large offsets with narrow spread never create zero-width bars', () => {
  const result = distributionModel([1e12, 1e12 + .001]);
  assert.equal(result.visibleCount, 2);
  assert.ok(result.bins.every(bin => bin.to > bin.from));
  assert.notEqual(formatAxisNumber(result.min, result.effectiveBinWidth), formatAxisNumber(result.max, result.effectiveBinWidth));
  assert.equal(distributionModel([1e12, 1e12 + .001], { binWidth: .00005 }).binValid, false);
});

test('ranges across magnitudes retain endpoints and emit only positive-width bars and bounded ticks', () => {
  for (let exponent = -12; exponent <= 12; exponent += 2) {
    for (let offset = -5; offset <= 5; offset++) {
      for (const ratio of [1, 1e-3, 1e-6, 1e-12, 1e-15]) {
        const low = offset * 10 ** exponent, high = low + 10 ** exponent * ratio;
        if (high <= low) continue;
        const result = distributionModel([low, high]);
        assert.equal(result.visibleCount, 2, `dropped endpoint in ${low}..${high}`);
        assert.ok(result.bins.every(bin => bin.to > bin.from), `zero-width bar in ${low}..${high}`);
        assert.ok(result.ticks.every(tick => tick >= result.min && tick <= result.max), `out-of-range tick in ${low}..${high}`);
      }
    }
  }
});

test('display and histogram arithmetic do not alter mean, sample sigma, Cpk or pass/fail', () => {
  const values = [Math.fround(5.6), Math.fround(5.8), 6].map((value, index) => ({ value, site: 1, partIndex: index, pass: index > 0, x: index, y: 0 }));
  const data = { id: 1, name: 'Synthetic', unit: 'V', low: 5.6, high: 6, values };
  const before = stats(data);
  distributionModel(data.values.map(row => row.value), { binWidth: .02 }, data);
  assert.deepEqual(stats(data), before);
  assert.equal(before.mean, (Math.fround(5.6) + Math.fround(5.8) + 6) / 3);
  assert.equal(before.failRate, 1 / 3);
  assert.equal(formatAxisNumber(.30000000000000004), '0.3');
  assert.equal(formatAxisNumber(.0000000001), '1e-10');
  assert.equal(formatAxisNumber(NaN), '');
  assert.ok(niceStep(.017) >= .017);
});

test('large populations avoid spread-argument limits and preserve count conservation', () => {
  const values = Array.from({ length: 150000 }, (_, index) => (index % 101) / 100);
  const result = distributionModel(values, { low: .2, high: .8, binWidth: .02 });
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.count, 0), result.visibleCount);
  assert.equal(result.visibleCount + result.belowCount + result.aboveCount, values.length);
  assert.equal(result.binCount, 30);
});

test('density slider directly doubles the number of equal-width data bins', () => {
  const values = Object.freeze(Array.from({ length: 1001 }, (_, index) => index / 1000));
  const fifty = densityDistributionModel(values);
  const hundred = densityDistributionModel(values, { binCount: 100 });
  assert.equal(fifty.binCount, 50);
  assert.equal(hundred.binCount, 100);
  assert.equal(fifty.effectiveBinWidth, .02);
  assert.equal(hundred.effectiveBinWidth, .01);
  for (const model of [fifty, hundred]) {
    assert.equal(model.bins[0].from, 0);
    assert.equal(model.bins.at(-1).to, 1);
    assert.equal(model.bins.reduce((sum, bin) => sum + bin.count, 0), values.length);
    assert.equal(model.binnedCount, values.length);
    assert.equal(model.hasPartialBin, false);
    assert.ok(model.bins.every(bin => Math.abs(bin.to - bin.from - model.effectiveBinWidth) < 1e-15));
  }
});

test('full specifications and custom viewport never change data-anchored bins', () => {
  const values = [2.698611, 2.7, 2.72, 2.736719, 2.736908, 2.75, 2.775128];
  const limits = { low: 2.45, high: 2.95 };
  const focused = densityDistributionModel(values, {}, limits);
  const expanded = densityDistributionModel(values, { rangeMode: 'all' }, limits);
  const cropped = densityDistributionModel(values, { low: 2.72, high: 2.75 }, limits);
  assert.deepEqual(focused.autoScale, { low: 2.698611, high: 2.775128 });
  assert.deepEqual(expanded.autoScale, limits);
  assert.deepEqual(expanded.bins, focused.bins);
  assert.deepEqual(cropped.bins, focused.bins);
  assert.equal(expanded.effectiveBinWidth, focused.effectiveBinWidth);
  assert.equal(cropped.effectiveBinWidth, focused.effectiveBinWidth);
  assert.equal(cropped.binnedCount, 7);
  assert.equal(cropped.visibleCount, 4);
  assert.equal(cropped.belowCount, 2);
  assert.equal(cropped.aboveCount, 1);
  assert.equal(cropped.visibleCount + cropped.belowCount + cropped.aboveCount, cropped.finiteCount);
});

test('manual width limit counts the data span, excluding empty specification space', () => {
  const values = [2.698611, 2.7, 2.736719, 2.775128];
  const limits = { low: 2.45, high: 2.95 };
  const width = (values.at(-1) - values[0]) / 100;
  const focused = densityDistributionModel(values, { binWidth: width }, limits);
  const expanded = densityDistributionModel(values, { binWidth: width, rangeMode: 'all' }, limits);
  assert.equal(expanded.binValid, true);
  assert.equal(expanded.binCount, 100);
  assert.equal(expanded.effectiveBinWidth, width);
  assert.deepEqual(expanded.bins, focused.bins);
  const nonDivisible = densityDistributionModel([0, .3, .6, .9, 1], { binWidth: .3, high: .8 });
  assert.equal(nonDivisible.binCount, 4);
  assert.equal(nonDivisible.bins.at(-1).to, 1.2);
  assert.equal(nonDivisible.hasPartialBin, false);
  assert.deepEqual(nonDivisible.bins.map(bin => bin.count), [1, 1, 1, 2]);
  assert.equal(nonDivisible.binnedCount, 5);
  assert.equal(nonDivisible.visibleCount, 3);
});

test('density constant, empty and nonfinite input stays bounded and conserves finite data', () => {
  for (const values of [[5, 5], [0, 0], [Number.MAX_VALUE], [-Number.MAX_VALUE], [], [NaN, Infinity, -Infinity]]) {
    const model = densityDistributionModel(values, { binCount: 100 });
    assert.equal(model.binCount, 1);
    assert.ok(Number.isFinite(model.spread) && model.spread > 0);
    assert.equal(model.binnedCount, values.filter(Number.isFinite).length);
    assert.equal(model.bins.reduce((sum, bin) => sum + bin.count, 0), model.binnedCount);
    assert.equal(model.visibleCount, model.binnedCount);
    assert.ok(model.bins.every(bin => Number.isFinite(bin.from) && Number.isFinite(bin.to) && bin.to > bin.from));
    assert.ok(model.ticks.length > 0 && model.ticks.length <= 16);
  }
  const constant = densityDistributionModel([5, 5], { binWidth: .001 });
  assert.equal(constant.binValid, true);
  assert.equal(constant.binCount, 1);
  assert.equal(constant.bins[0].count, 2);
});

test('density caps resolution at representable precision without dropping measurements', () => {
  for (const values of [[1e12, 1e12 + .001], [0, Number.MIN_VALUE], [-Number.MIN_VALUE, 0, Number.MIN_VALUE]]) {
    const model = densityDistributionModel(values, { binCount: 100 });
    assert.ok(model.binCount >= 1 && model.binCount < 100);
    assert.ok(model.effectiveBinWidth > 0 && Number.isFinite(model.effectiveBinWidth));
    assert.ok(model.bins.every(bin => bin.to > bin.from));
    assert.equal(model.bins.reduce((sum, bin) => sum + bin.count, 0), values.length);
    assert.equal(model.visibleCount, values.length);
    assert.equal(model.binValid, true);
  }
  const extreme = densityDistributionModel([-Number.MAX_VALUE, 0, Number.MAX_VALUE], { binCount: 1 });
  assert.ok(Number.isFinite(extreme.spread));
  assert.ok(Number.isFinite(extreme.effectiveBinWidth));
  assert.equal(extreme.binnedCount, 3);
  assert.equal(extreme.bins.reduce((sum, bin) => sum + bin.count, 0), 3);
  assert.ok(extreme.errors.length > 0);
});

test('invalid density settings fall back safely without allocating unbounded bins', () => {
  for (const binWidth of [0, -1, NaN, Infinity, Number.MIN_VALUE]) {
    const model = densityDistributionModel([0, 1], { binWidth });
    assert.equal(model.binValid, false);
    assert.equal(model.binCount, 50);
    assert.equal(model.binnedCount, 2);
  }
  for (const binCount of [0, -1, NaN, Infinity, 1.5, 121, 1e12]) {
    const model = densityDistributionModel([0, 1], { binCount });
    assert.equal(model.binValid, false);
    assert.equal(model.binCount, 50);
    assert.equal(model.bins.reduce((sum, bin) => sum + bin.count, 0), 2);
  }
  const invalidScale = densityDistributionModel([0, 1], { low: 2, high: 1 });
  assert.equal(invalidScale.scaleValid, false);
  assert.deepEqual(invalidScale.bins, densityDistributionModel([0, 1]).bins);
  assert.equal(invalidScale.min, 0);
  assert.equal(invalidScale.max, 1);
});

test('density changes and cropping preserve source statistics and every filtered record', () => {
  const values = Array.from({ length: 150000 }, (_, index) => ({ value: (index % 101) / 100, site: 1, partIndex: index, pass: index % 7 !== 0, x: index, y: 0 }));
  const data = { id: 1, name: 'Synthetic', unit: 'V', low: .1, high: .9, values };
  const before = stats(data);
  const numbers = values.map(row => row.value);
  const model = densityDistributionModel([...numbers, NaN, Infinity], { low: .2, high: .8, binCount: 100 }, data);
  assert.deepEqual(stats(data), before);
  assert.equal(model.nonFiniteCount, 2);
  assert.equal(model.bins.reduce((sum, bin) => sum + bin.count, 0), numbers.length);
  assert.equal(model.finiteCount, model.visibleCount + model.belowCount + model.aboveCount);
  assert.equal(model.binCount, 100);
});

function assertDensitySelections(values, settings = {}) {
  const model = densityDistributionModel(values, settings);
  const selections = model.bins.map((bin, index) => ({
    from: bin.from, to: bin.to, index, binWidth: model.effectiveBinWidth,
    includeUpper: index === model.bins.length - 1,
  }));
  assert.deepEqual(
    selections.map(selection => values.filter(value => isValueInDistributionBin(value, selection)).length),
    model.bins.map(bin => bin.count),
    'selected records must match the histogram count for every bin',
  );
  for (const value of values) {
    assert.equal(selections.filter(selection => isValueInDistributionBin(value, selection)).length, Number.isFinite(value) ? 1 : 0,
      `${value} must belong to exactly one bin, or none when nonfinite`);
  }
  return { model, selections };
}

test('density selection uses the same float32 and decimal edge assignments as bin counts', () => {
  const values = [0, 1, NaN, Infinity, -Infinity];
  for (let index = 1; index < 10; index++) {
    const edge = index / 10;
    values.push(edge, Math.fround(edge), edge - 1e-10, edge + 1e-10);
  }
  const { selections } = assertDensitySelections(values, { binWidth: .1 });
  assert.equal(isValueInDistributionBin(Math.fround(.7), selections[6]), false);
  assert.equal(isValueInDistributionBin(Math.fround(.7), selections[7]), true);
  assert.equal(isValueInDistributionBin(.7 - 1e-10, selections[6]), true);
  assert.equal(isValueInDistributionBin(1, selections.at(-1)), true);
  assert.equal(isValueInDistributionBin(-1e-10, selections[0]), false);
  assert.equal(isValueInDistributionBin(1 + 1e-10, selections.at(-1)), false);
});

test('density selection includes a full partially visible bin and retains a manual final bin', () => {
  const values = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1, NaN];
  const { model, selections } = assertDensitySelections(values, { binWidth: .3, low: .15, high: .8 });
  assert.equal(model.bins.at(-1).to, 1.2);
  assert.equal(model.visibleCount, 7);
  assert.equal(isValueInDistributionBin(0, selections[0]), true);
  assert.equal(isValueInDistributionBin(.1, selections[0]), true);
  assert.equal(isValueInDistributionBin(.9, selections.at(-1)), true);
  assert.equal(isValueInDistributionBin(1, selections.at(-1)), true);
  assert.equal(isValueInDistributionBin(1.2, selections.at(-1)), true);
  assert.equal(isValueInDistributionBin(Math.fround(1.2), selections.at(-1)), true);
  assert.equal(isValueInDistributionBin(1.2 + 1e-8, selections.at(-1)), false);
});

test('density selection preserves narrow, constant, subnormal and extreme populations', () => {
  const first = Math.fround(5.6), next = Math.fround(first + 5e-7);
  for (const values of [
    [first, first, next], [1e12, 1e12 + .0005, 1e12 + .001],
    [0, Number.MIN_VALUE], [-Number.MIN_VALUE, 0, Number.MIN_VALUE],
    [-Number.MAX_VALUE, 0, Number.MAX_VALUE], [5, 5], [Number.MAX_VALUE], [], [NaN, Infinity],
  ]) {
    assertDensitySelections(values, { binCount: 100 });
  }
  assertDensitySelections([5, 5], { binWidth: .001 });
});

test('density selection partitions generated data across offsets and bin widths', () => {
  for (const offset of [-1e8, -.01, 0, 100, 1e12]) {
    for (const span of [.001, .3, 10]) {
      const values = Array.from({ length: 301 }, (_, index) => offset + span * index / 300);
      for (const binCount of [1, 20, 50, 100, 120]) {
        assertDensitySelections(values, { binCount, low: offset + span * .25, high: offset + span * .75 });
      }
      assertDensitySelections(values, { binWidth: span / 37 });
    }
  }
});
