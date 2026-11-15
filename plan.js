// Retirement corpus allocation logic. Pure functions: runs in the browser and in Node (tests).
// shortcut: rates/limits are hard-coded as of late 2026, update ASSUMPTIONS when govt schemes change.
const ASSUMPTIONS = {
  inflation: 0.06,          // household expense inflation
  medicalInflation: 0.10,   // health premium inflation
  returns: { liquid: 0.065, income: 0.078, debt: 0.072, equity: 0.105 },
  scssLimit: 3000000,       // Senior Citizens Savings Scheme, per person, age 60+
  pomisLimit: 900000,       // Post Office MIS, single account
  incomeYears: 3,           // bucket 1 covers years 1-3
  debtYears: 4,             // bucket 2 covers years 4-7
};

function premiumEstimate(age) {
  // Rough annual premium: ₹10L family floater + ₹50L super top-up, two adults.
  if (age < 50) return 35000;
  if (age < 60) return 55000;
  if (age < 70) return 90000;
  return 140000;
}

function equityShare(age, risk, spouseWorking, pensionCoversHalf = false) {
  let eq = (100 - age) * (risk === 'medium' ? 1 : 0.6);
  if (spouseWorking) eq += 5; // second income = more capacity to ride out falls
  if (pensionCoversHalf) eq += 5; // steady pension does the same
  return Math.min(50, Math.max(10, Math.round(eq))) / 100;
}

function expenseForYear(annual, year, A = ASSUMPTIONS) {
  return annual * Math.pow(1 + A.inflation, year - 1);
}

// Highest monthly household spend (pension + corpus) that lasts the horizon and still leaves
// 25% of the investable corpus, so money remains for life after the plan ends.
function safeMonthlyExpense(inputs, A = ASSUMPTIONS) {
  let lo = 1, hi = (inputs.corpus / 12) + (inputs.monthlyPension || 0);
  const ok = x => { const p = buildPlan({ ...inputs, monthlyExpense: x }, A); return p.projection.at(-1).end >= 0.25 * p.investable; };
  if (!ok(lo)) return 0;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; ok(mid) ? lo = mid : hi = mid; }
  return Math.floor(lo / 500) * 500;
}

function buildPlan({ age, spouseWorking, risk, corpus, monthlyExpense, monthlyPension = 0, wantsEquity = true, years = 15 }, A = ASSUMPTIONS) {
  if (!(corpus > 0)) throw new Error('Corpus must be a positive amount');
  if (!(age >= 30 && age <= 90)) throw new Error('Age must be between 30 and 90');
  if (!['low', 'medium'].includes(risk)) throw new Error('Risk must be low or medium');
  if (!(years >= 10 && years <= 15)) throw new Error('Years must be 10 to 15');
  if (!(monthlyPension > 0)) monthlyPension = 0;
  const safeExpense = monthlyExpense > 0 ? null : safeMonthlyExpense({ age, spouseWorking, risk, corpus, monthlyPension, wantsEquity, years }, A);
  if (!(monthlyExpense > 0)) monthlyExpense = Math.max(safeExpense, 1000);
  const annual = monthlyExpense * 12;
  // shortcut: pension assumed flat (no DA/indexation), add a growth rate if users ask for govt pensions.
  const pensionYear = monthlyPension * 12;
  const draw = y => Math.max(0, expenseForYear(annual, y, A) - pensionYear); // what the corpus must pay
  const warnings = [];

  const emergency = Math.min(monthlyExpense * (spouseWorking ? 6 : 12), corpus * 0.2);
  const medicalBuffer = Math.min(age >= 70 ? 1000000 : age >= 60 ? 500000 : 300000, corpus * 0.1);
  const investable = corpus - emergency - medicalBuffer;

  const eqPct = wantsEquity ? equityShare(age, risk, spouseWorking, monthlyPension * 2 >= monthlyExpense) : 0;
  if (!wantsEquity) warnings.push('No share market exposure: the plan is fully debt and govt schemes. Returns may only just match inflation, so the corpus shrinks faster.');
  const equity = investable * eqPct;
  let need1 = 0;
  for (let y = 1; y <= A.incomeYears; y++) need1 += draw(y) + premiumEstimate(age) * Math.pow(1 + A.medicalInflation, y - 1);
  const income = Math.min(need1, investable - equity);
  const debt = investable - equity - income;
  if (income < need1) warnings.push('Corpus is too small to fund 3 years of expenses safely. Consider lowering expenses or delaying retirement.');

  // Split income bucket into instruments.
  const scss = age >= 60 ? Math.min(A.scssLimit, income) : 0;
  const pomis = Math.min(A.pomisLimit, income - scss);
  const fd = income - scss - pomis;
  if (age < 60) warnings.push('SCSS is open only from age 60 (55 for VRS retirees). Income bucket uses POMIS and bank FDs.');

  const buckets = [
    { key: 'emergency', name: 'Emergency fund', amount: emergency, rate: A.returns.liquid,
      items: [['Savings account / sweep FD', emergency * 0.3], ['Liquid mutual fund', emergency * 0.7]],
      note: `${spouseWorking ? 6 : 12} months of expenses. Do not touch except emergencies.` },
    { key: 'medical', name: 'Medical buffer', amount: medicalBuffer, rate: A.returns.liquid,
      items: [['Liquid / overnight fund', medicalBuffer]],
      note: 'Covers co-pay, OPD and claims insurance rejects.' },
    { key: 'income', name: `Bucket 1: Income (years 1-${A.incomeYears})`, amount: income, rate: A.returns.income,
      items: [['Senior Citizens Savings Scheme', scss], ['Post Office MIS', pomis], ['Bank FD ladder (1-3 yr)', fd]].filter(i => i[1] > 0),
      note: 'Pays monthly/quarterly income. Withdraw expenses from here.' },
    { key: 'debt', name: `Bucket 2: Stability (years ${A.incomeYears + 1}-${A.incomeYears + A.debtYears})`, amount: debt, rate: A.returns.debt,
      items: [['RBI Floating Rate Savings Bonds', debt * 0.4], ['Target maturity / short duration debt funds', debt * 0.6]],
      note: 'Refills Bucket 1 every year.' },
    { key: 'equity', name: `Bucket 3: Growth (years ${A.incomeYears + A.debtYears + 1}+)`, amount: equity, rate: A.returns.equity,
      items: risk === 'low'
        ? [['Nifty 50 index fund', equity * 0.5], ['Balanced advantage fund', equity * 0.5]]
        : [['Nifty 50 index fund', equity * 0.5], ['Flexi-cap fund', equity * 0.3], ['Balanced advantage fund', equity * 0.2]],
      note: 'Beats inflation over 8+ years. Move gains to Bucket 2 in good years.' },
  ].filter(b => b.amount > 0);

  // Year-by-year projection: money in investable buckets grows at blended rate, expenses + premium withdrawn.
  const blended = buckets.slice(2).reduce((s, b) => s + b.amount * b.rate, 0) / (investable || 1);
  const projection = [];
  let balance = investable;
  for (let y = 1; y <= years; y++) {
    const expense = expenseForYear(annual, y, A);
    const premium = premiumEstimate(age + y - 1) * Math.pow(1 + A.medicalInflation, y - 1);
    const start = balance;
    balance = Math.max(0, (balance - draw(y) - premium) * (1 + blended));
    const source = y <= A.incomeYears ? 'Bucket 1' : y <= A.incomeYears + A.debtYears ? 'Bucket 2' : 'Bucket 3';
    projection.push({ year: y, age: age + y - 1, start, expense, pension: pensionYear, premium, end: balance, source });
  }
  const depletedYear = (projection.find(p => p.end === 0) || {}).year;
  if (depletedYear) warnings.push(`At these expenses the corpus runs out in year ${depletedYear}. Reduce monthly spend or pick a smaller horizon.`);

  const insurance = {
    baseCover: 1000000,
    superTopUp: age >= 70 ? 2500000 : 5000000,
    premium: premiumEstimate(age),
    tips: [
      age >= 60 ? 'Buy a senior-citizen family floater; check co-pay and room-rent caps.' : 'Buy before 60. Premiums and waiting periods rise sharply after that.',
      spouseWorking ? "Spouse's employer cover is a bonus, not a substitute: it ends when the job ends." : 'No employer cover in the family: personal health cover is mandatory.',
      'Pay premiums from Bucket 1. Section 80D allows up to ₹50,000 deduction for senior citizens.',
    ],
  };

  const overtaken = projection.find(p => p.expense > pensionYear);
  if (monthlyPension >= monthlyExpense && overtaken)
    warnings.push(`Your pension covers expenses today, but with inflation expenses overtake it in year ${overtaken.year}. The corpus fills the gap after that.`);
  return { inputs: { age, spouseWorking, risk, corpus, monthlyExpense, monthlyPension, wantsEquity, years }, investable, autoExpense: safeExpense !== null, equityPct: eqPct, buckets, projection, insurance, warnings, blendedReturn: blended };
}

if (typeof module !== 'undefined') module.exports = { buildPlan, equityShare, safeMonthlyExpense, ASSUMPTIONS };
