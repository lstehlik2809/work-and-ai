export type Contingency = [number, number, number, number]; // selected important/below, other important/below
export const POSTERIOR_DRAWS = 20_000;
export interface BayesianEvidence {
  probabilityMore: number;
  meanDifference: number; // percentage points, analytic posterior mean
  interval: [number, number]; // equal-tail 95% credible interval, percentage points
  selectedPosterior: [number, number];
  otherPosterior: [number, number];
  constantOutcome: boolean;
}

// Mulberry32; open-interval uniforms keep log and gamma draws finite.
function randomGenerator(counts: Contingency) {
  let seed = 2166136261;
  for (const character of counts.join(',')) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296 + 0.5 / 4294967296;
  };
}

// Marsaglia–Tsang gamma sampler; posterior shapes are always >= 1.
function gammaSampler(random: () => number) {
  return (shape: number): number => {
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const normal = Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
      const base = 1 + c * normal;
      if (base <= 0) continue;
      const v = base * base * base, squared = normal * normal, u = random();
      if (u < 1 - 0.0331 * squared * squared || Math.log(u) < squared / 2 + d * (1 - v + Math.log(v))) return d * v;
    }
  };
}

export function bayesianPrevalence(counts: Contingency): BayesianEvidence | null {
  if (counts.length !== 4 || counts.some(n => !Number.isSafeInteger(n) || n < 0)
    || !Number.isSafeInteger(counts.reduce((sum, n) => sum + n, 4))) throw Error('Counts and posterior totals must be safe nonnegative integers');
  const [a, b, c, d] = counts;
  if (a + b === 0 || c + d === 0) return null;
  // Canonical group order gives exactly complementary probabilities and mirrored
  // intervals on group swap, independent of UI order, filtering or prior calls.
  const swapped = a > c || a === c && b > d;
  const canonical: Contingency = swapped ? [c, d, a, b] : [a, b, c, d];
  const random = randomGenerator(canonical);
  const gamma = gammaSampler(random);
  const [firstYes, firstNo, secondYes, secondNo] = canonical.map(n => n + 1);
  const differences = new Float64Array(POSTERIOR_DRAWS);
  let more = 0;
  for (let i = 0; i < POSTERIOR_DRAWS; i++) {
    const x = gamma(firstYes), y = gamma(firstNo);
    const z = gamma(secondYes), w = gamma(secondNo);
    const difference = 100 * (x / (x + y) - z / (z + w));
    differences[i] = difference;
    if (difference > 0) more++;
  }
  differences.sort();
  const quantile = (p: number) => {
    const index = (POSTERIOR_DRAWS - 1) * p, lower = Math.floor(index);
    return differences[lower] + (index - lower) * (differences[lower + 1] - differences[lower]);
  };
  let low = quantile(0.025), high = quantile(0.975), probability = more / POSTERIOR_DRAWS;
  if (a === c && b === d) {
    // Identical posteriors have exact symmetry; remove simulation asymmetry.
    probability = 0.5;
    high = (high - low) / 2; low = -high;
  }
  return {
    probabilityMore: swapped ? 1 - probability : probability,
    meanDifference: 100 * ((a + 1) / (a + b + 2) - (c + 1) / (c + d + 2)),
    interval: swapped ? [-high, -low] : [low, high],
    selectedPosterior: [a + 1, b + 1], otherPosterior: [c + 1, d + 1],
    constantOutcome: a + c === 0 || b + d === 0,
  };
}
