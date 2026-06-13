/*
 * NetRate — UK Contractor Take-Home Engine
 * Tax years 2025/26 and 2026/27, rest-of-UK rates (England, Wales, NI).
 * Scotland has different income-tax bands and is out of scope for v1.
 *
 * This file is a pure calculation module with no DOM dependencies so it can be
 * unit-tested under Node (see test.mjs) and imported by the browser UI (app.js).
 *
 * Sources for every figure are cited inline. All amounts are annual unless noted.
 * This is an estimate, not financial or tax advice.
 *
 * For 2026/27, only the dividend tax rates changed (each ordinary/upper rate up
 * 2pp, per the Autumn 2025 Budget) and the student-loan thresholds rose; income
 * tax, NI, Employment Allowance and corporation tax are unchanged vs 2025/26.
 */

// ---------------------------------------------------------------------------
// Rates by tax year
// ---------------------------------------------------------------------------

export const RATES_BY_YEAR = {
  "2025/26": {
    label: "2025/26",
    // Income tax (rUK) — HMRC / House of Commons Library CBP-10237
    personalAllowance: 12570,
    paTaperThreshold: 100000, // PA reduced £1 for every £2 of income above this
    basicRateBand: 37700, // width of the 20% band (taxable income 0–37,700)
    higherRateThreshold: 125140, // taxable income above this is taxed at the additional rate
    incomeTax: { basic: 0.2, higher: 0.4, additional: 0.45 },
    // Employee NI — Class 1 primary (2025/26: main rate 8%)
    ni: { primaryThreshold: 12570, upperEarningsLimit: 50270, mainRate: 0.08, upperRate: 0.02 },
    // Employer NI — Class 1 secondary (from April 2025: 15% above £5,000)
    employerNi: { secondaryThreshold: 5000, rate: 0.15, employmentAllowance: 10500 },
    apprenticeshipLevy: 0.005, // 0.5% of pay bill — large employers (most umbrellas)
    dividends: { allowance: 500, basic: 0.0875, higher: 0.3375, additional: 0.3935 },
    corporationTax: { smallRate: 0.19, mainRate: 0.25, lowerLimit: 50000, upperLimit: 250000, marginalFraction: 3 / 200 },
    studentLoan: {
      plan1: { threshold: 26065, rate: 0.09 },
      plan2: { threshold: 28470, rate: 0.09 },
      plan4: { threshold: 32745, rate: 0.09 },
      plan5: { threshold: 25000, rate: 0.09 },
      postgrad: { threshold: 21000, rate: 0.06 },
    },
  },

  "2026/27": {
    label: "2026/27",
    personalAllowance: 12570, // frozen to April 2028
    paTaperThreshold: 100000,
    basicRateBand: 37700,
    higherRateThreshold: 125140,
    incomeTax: { basic: 0.2, higher: 0.4, additional: 0.45 },
    ni: { primaryThreshold: 12570, upperEarningsLimit: 50270, mainRate: 0.08, upperRate: 0.02 },
    employerNi: { secondaryThreshold: 5000, rate: 0.15, employmentAllowance: 10500 },
    apprenticeshipLevy: 0.005,
    // Dividend ordinary and upper rates each rise 2pp from 6 April 2026 (Autumn 2025 Budget)
    dividends: { allowance: 500, basic: 0.1075, higher: 0.3575, additional: 0.3935 },
    corporationTax: { smallRate: 0.19, mainRate: 0.25, lowerLimit: 50000, upperLimit: 250000, marginalFraction: 3 / 200 },
    studentLoan: {
      plan1: { threshold: 26900, rate: 0.09 },
      plan2: { threshold: 29385, rate: 0.09 },
      plan4: { threshold: 33795, rate: 0.09 },
      plan5: { threshold: 25000, rate: 0.09 },
      postgrad: { threshold: 21000, rate: 0.06 },
    },
  },
};

export const DEFAULT_YEAR = "2026/27"; // current tax year (started 6 April 2026)
export const TAX_YEARS = Object.keys(RATES_BY_YEAR);
export const TAX_YEAR = DEFAULT_YEAR; // back-compat single-label export

/** Resolve a rates object from a tax-year key, falling back to the default year. */
export function getRates(taxYear) {
  return RATES_BY_YEAR[taxYear] || RATES_BY_YEAR[DEFAULT_YEAR];
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Building blocks (each takes an explicit rates object)
// ---------------------------------------------------------------------------

/** Personal allowance after the £100k taper. */
export function personalAllowance(totalIncome, rates = getRates(DEFAULT_YEAR)) {
  const { personalAllowance: pa, paTaperThreshold } = rates;
  if (totalIncome <= paTaperThreshold) return pa;
  const reduction = Math.floor((totalIncome - paTaperThreshold) / 2);
  return Math.max(0, pa - reduction);
}

/** Employee (Class 1 primary) National Insurance on an annual salary. */
export function employeeNI(salary, rates = getRates(DEFAULT_YEAR)) {
  const { primaryThreshold, upperEarningsLimit, mainRate, upperRate } = rates.ni;
  if (salary <= primaryThreshold) return 0;
  const main = Math.min(salary, upperEarningsLimit) - primaryThreshold;
  const upper = Math.max(0, salary - upperEarningsLimit);
  return round2(main * mainRate + upper * upperRate);
}

/** Employer (Class 1 secondary) NI. Employment Allowance off by default (sole-director PSC). */
export function employerNI(salary, { employmentAllowance = false } = {}, rates = getRates(DEFAULT_YEAR)) {
  const { secondaryThreshold, rate, employmentAllowance: ea } = rates.employerNi;
  const liable = Math.max(0, salary - secondaryThreshold) * rate;
  return round2(employmentAllowance ? Math.max(0, liable - ea) : liable);
}

/** Corporation tax with marginal relief (assumes no associated companies). */
export function corporationTax(profit, rates = getRates(DEFAULT_YEAR)) {
  if (profit <= 0) return 0;
  const { smallRate, mainRate, lowerLimit, upperLimit, marginalFraction } = rates.corporationTax;
  if (profit <= lowerLimit) return round2(profit * smallRate);
  if (profit >= upperLimit) return round2(profit * mainRate);
  const main = profit * mainRate;
  const relief = (upperLimit - profit) * marginalFraction;
  return round2(main - relief);
}

/**
 * Student loan repayment for the chosen plans on a given income.
 * Per gov.uk: multiple undergraduate plans (1/2/4/5) are collected as a SINGLE
 * 9% deduction on income above the LOWEST selected threshold, not stacked.
 * A postgraduate loan (6%) is charged separately and adds on top.
 */
export function studentLoan(income, plans = [], rates = getRates(DEFAULT_YEAR)) {
  let total = 0;
  const undergrad = plans
    .filter((k) => k !== "postgrad")
    .map((k) => rates.studentLoan[k])
    .filter(Boolean);
  if (undergrad.length) {
    const lowestThreshold = Math.min(...undergrad.map((p) => p.threshold));
    total += Math.max(0, income - lowestThreshold) * 0.09; // one 9% deduction
  }
  if (plans.includes("postgrad")) {
    const pg = rates.studentLoan.postgrad;
    total += Math.max(0, income - pg.threshold) * pg.rate; // 6% on top
  }
  return round2(total);
}

/**
 * Income tax on a salary-plus-dividends mix with correct dividend stacking.
 * Dividends are treated as the top slice of income; the dividend allowance is
 * a 0% band that still consumes rate-band space.
 */
export function incomeTaxSalaryAndDividends(salary, dividends, rates = getRates(DEFAULT_YEAR)) {
  const totalIncome = salary + dividends;
  const pa = personalAllowance(totalIncome, rates);
  const { basicRateBand, higherRateThreshold, incomeTax } = rates;
  const { allowance: divAllowance, basic: dB, higher: dH, additional: dA } = rates.dividends;

  // Allocate personal allowance to salary first, then to dividends.
  const salaryTaxable = Math.max(0, salary - pa);
  const paLeftForDiv = Math.max(0, pa - salary);
  const dividendsTaxable = Math.max(0, dividends - paLeftForDiv);

  // --- Non-dividend (salary) sits at the bottom of the band structure ---
  const sBasic = Math.min(salaryTaxable, basicRateBand);
  const sHigher = Math.min(Math.max(salaryTaxable - basicRateBand, 0), higherRateThreshold - basicRateBand);
  const sAdditional = Math.max(salaryTaxable - higherRateThreshold, 0);
  const salaryTax = sBasic * incomeTax.basic + sHigher * incomeTax.higher + sAdditional * incomeTax.additional;

  // --- Dividends stack on top, starting at the band position salary reached ---
  let pos = salaryTaxable;
  const allowanceUsed = Math.min(dividendsTaxable, divAllowance);
  pos += allowanceUsed;
  let remaining = dividendsTaxable - allowanceUsed;

  const dInBasic = Math.min(Math.max(basicRateBand - pos, 0), remaining);
  remaining -= dInBasic;
  const dInHigher = Math.min(Math.max(higherRateThreshold - Math.max(pos, basicRateBand), 0), remaining);
  remaining -= dInHigher;
  const dInAdditional = remaining;

  const dividendTax = dInBasic * dB + dInHigher * dH + dInAdditional * dA;

  return {
    personalAllowance: pa,
    salaryTax: round2(salaryTax),
    dividendTax: round2(dividendTax),
    dividendAllowanceUsed: round2(allowanceUsed),
    incomeTaxTotal: round2(salaryTax + dividendTax),
  };
}

// ---------------------------------------------------------------------------
// Scenario: Outside IR35 via a personal limited company
// ---------------------------------------------------------------------------

export function outsideIR35({
  annualBilling,
  directorSalary,
  expenses = 0,
  employerPension = 0,
  studentLoanPlans = [],
  taxYear = DEFAULT_YEAR,
}) {
  const rates = getRates(taxYear);
  const empNI = employerNI(directorSalary, { employmentAllowance: false }, rates);

  // Company P&L
  const preTaxProfit = Math.max(0, annualBilling - directorSalary - empNI - employerPension - expenses);
  const ct = corporationTax(preTaxProfit, rates);
  const distributableProfit = Math.max(0, preTaxProfit - ct);
  const dividends = distributableProfit; // assume full distribution

  // Personal taxes
  const tax = incomeTaxSalaryAndDividends(directorSalary, dividends, rates);
  const eeNI = employeeNI(directorSalary, rates);
  const sl = studentLoan(directorSalary + dividends, studentLoanPlans, rates);

  const takeHome = round2(directorSalary + dividends - tax.incomeTaxTotal - eeNI - sl);
  const totalTaxAndNI = round2(empNI + ct + tax.incomeTaxTotal + eeNI + sl);

  return {
    label: "Outside IR35 (Limited Company)",
    taxYear: rates.label,
    annualBilling: round2(annualBilling),
    inputs: { directorSalary, expenses, employerPension },
    company: {
      directorSalary: round2(directorSalary),
      employerNI: empNI,
      employerPension: round2(employerPension),
      expenses: round2(expenses),
      preTaxProfit: round2(preTaxProfit),
      corporationTax: ct,
      dividends: round2(dividends),
    },
    personal: {
      salaryTax: tax.salaryTax,
      dividendTax: tax.dividendTax,
      employeeNI: eeNI,
      studentLoan: sl,
      personalAllowance: tax.personalAllowance,
    },
    pensionPot: round2(employerPension),
    takeHome,
    takeHomeMonthly: round2(takeHome / 12),
    totalDeductions: totalTaxAndNI,
    retainedPct: annualBilling > 0 ? round2((takeHome / annualBilling) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Scenario: Inside IR35 via an umbrella company
// ---------------------------------------------------------------------------

export function insideIR35Umbrella({
  assignmentAnnual,
  marginAnnual = 0,
  pensionSacrifice = 0,
  includeApprenticeshipLevy = true,
  studentLoanPlans = [],
  taxYear = DEFAULT_YEAR,
}) {
  const rates = getRates(taxYear);
  const { secondaryThreshold, rate: erRate } = rates.employerNi;
  const levy = includeApprenticeshipLevy ? rates.apprenticeshipLevy : 0;

  // Pool available for employment after the umbrella's margin and any sacrifice.
  const pool = Math.max(0, assignmentAnnual - marginAnnual - pensionSacrifice);

  // pool = grossPay + employerNI(grossPay) + levy*grossPay
  //      = grossPay * (1 + erRate + levy) - erRate*secondaryThreshold   [if grossPay > threshold]
  // => grossPay = (pool + erRate*secondaryThreshold) / (1 + erRate + levy)
  let grossPay = (pool + erRate * secondaryThreshold) / (1 + erRate + levy);

  // If that solution falls below the secondary threshold, no employer NI is due.
  if (grossPay <= secondaryThreshold) {
    grossPay = pool / (1 + levy);
  }
  grossPay = Math.max(0, grossPay);

  const empNI = employerNI(grossPay, { employmentAllowance: false }, rates);
  const appLevy = round2(grossPay * levy);

  // Personal taxes on gross pay (no dividends here).
  const tax = incomeTaxSalaryAndDividends(grossPay, 0, rates);
  const eeNI = employeeNI(grossPay, rates);
  const sl = studentLoan(grossPay, studentLoanPlans, rates);

  const takeHome = round2(grossPay - tax.incomeTaxTotal - eeNI - sl);
  const totalTaxAndNI = round2(empNI + appLevy + tax.incomeTaxTotal + eeNI + sl);

  return {
    label: "Inside IR35 (Umbrella)",
    taxYear: rates.label,
    assignmentAnnual: round2(assignmentAnnual),
    inputs: { marginAnnual, pensionSacrifice, includeApprenticeshipLevy },
    umbrella: {
      margin: round2(marginAnnual),
      employerNI: empNI,
      apprenticeshipLevy: appLevy,
      pensionSacrifice: round2(pensionSacrifice),
      grossPay: round2(grossPay),
    },
    personal: {
      incomeTax: tax.incomeTaxTotal,
      employeeNI: eeNI,
      studentLoan: sl,
      personalAllowance: tax.personalAllowance,
    },
    pensionPot: round2(pensionSacrifice),
    takeHome,
    takeHomeMonthly: round2(takeHome / 12),
    totalDeductions: totalTaxAndNI,
    retainedPct: assignmentAnnual > 0 ? round2((takeHome / assignmentAnnual) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Scenario: Permanent employee (for "what salary matches this take-home?")
// ---------------------------------------------------------------------------

/** Net take-home for a permanent employee on a given gross salary. */
export function permanentNet(grossSalary, studentLoanPlans = [], taxYear = DEFAULT_YEAR) {
  const rates = getRates(taxYear);
  const tax = incomeTaxSalaryAndDividends(grossSalary, 0, rates);
  const eeNI = employeeNI(grossSalary, rates);
  const sl = studentLoan(grossSalary, studentLoanPlans, rates);
  return round2(grossSalary - tax.incomeTaxTotal - eeNI - sl);
}

/** Reverse: gross permanent salary needed to match a target net take-home. */
export function permanentSalaryForNet(targetNet, studentLoanPlans = [], taxYear = DEFAULT_YEAR) {
  if (targetNet <= 0) return 0;
  let lo = 0;
  let hi = Math.max(targetNet * 2, 200000);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (permanentNet(mid, studentLoanPlans, taxYear) < targetNet) lo = mid;
    else hi = mid;
  }
  return round2((lo + hi) / 2);
}

// ---------------------------------------------------------------------------
// Top-level helper used by the UI
// ---------------------------------------------------------------------------

export function compute(cfg) {
  const {
    dayRate,
    umbrellaDayRate,
    daysPerWeek = 5,
    weeksPerYear = 44,
    directorSalary = 12570,
    expenses = 0,
    employerPension = 0,
    umbrellaMarginPerWeek = 25,
    umbrellaPension = 0,
    includeApprenticeshipLevy = true,
    studentLoanPlans = [],
    taxYear = DEFAULT_YEAR,
  } = cfg;

  const annualBilling = dayRate * daysPerWeek * weeksPerYear;
  const assignmentAnnual = (umbrellaDayRate ?? dayRate) * daysPerWeek * weeksPerYear;

  const outside = outsideIR35({
    annualBilling,
    directorSalary,
    expenses,
    employerPension,
    studentLoanPlans,
    taxYear,
  });

  const inside = insideIR35Umbrella({
    assignmentAnnual,
    marginAnnual: umbrellaMarginPerWeek * weeksPerYear,
    pensionSacrifice: umbrellaPension,
    includeApprenticeshipLevy,
    studentLoanPlans,
    taxYear,
  });

  return { outside, inside, annualBilling, assignmentAnnual, taxYear };
}
