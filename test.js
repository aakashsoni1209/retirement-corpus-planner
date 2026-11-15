// Run: node test.js
const assert = require('assert');
const { buildPlan, equityShare } = require('./plan.js');

const sum = p => p.buckets.reduce((s, b) => s + b.amount, 0);
const base = { age: 60, spouseWorking: false, risk: 'low', corpus: 1e7, monthlyExpense: 50000 };

// Buckets always add up to the corpus, and items add up to their bucket.
for (const age of [45, 60, 75]) for (const risk of ['low', 'medium']) for (const spouseWorking of [true, false]) {
  const p = buildPlan({ ...base, age, risk, spouseWorking });
  assert(Math.abs(sum(p) - 1e7) < 1, `buckets != corpus for ${age}/${risk}`);
  for (const b of p.buckets) assert(Math.abs(b.items.reduce((s, i) => s + i[1], 0) - b.amount) < 1, b.name);
  assert(p.buckets.every(b => b.amount >= 0));
}

// Low risk holds less equity than medium; spouse working adds capacity; caps hold.
assert(equityShare(60, 'low', false) < equityShare(60, 'medium', false));
assert(equityShare(60, 'low', true) > equityShare(60, 'low', false));
assert.strictEqual(equityShare(85, 'low', false), 0.1);
assert.strictEqual(equityShare(30, 'medium', true), 0.5);

// SCSS only from 60.
assert(!buildPlan({ ...base, age: 55 }).buckets[2].items.some(i => i[0].includes('Senior')));
assert(buildPlan(base).buckets[2].items.some(i => i[0].includes('Senior')));

// Tiny corpus warns and projects depletion.
const small = buildPlan({ ...base, corpus: 1e6 });
assert(small.warnings.some(w => w.includes('runs out')));

// Pension reduces what the corpus pays, so more is left at the end; full pension adds equity.
const withPension = buildPlan({ ...base, monthlyPension: 30000 });
assert(withPension.projection.at(-1).end > buildPlan(base).projection.at(-1).end);
assert(withPension.equityPct > buildPlan(base).equityPct);
assert(buildPlan({ ...base, monthlyPension: 60000 }).warnings.some(w => w.includes('overtake')));

// Bad input rejected.
assert.throws(() => buildPlan({ ...base, corpus: 0 }));
assert.throws(() => buildPlan({ ...base, risk: 'high' }));

console.log('all tests passed');
