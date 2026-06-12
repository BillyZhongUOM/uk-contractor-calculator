/*
 * NetRate — UK Contractor Take-Home Engine
 * Tax year 2025/26 (6 April 2025 to 5 April 2026), rest-of-UK rates (England, Wales, NI).
 * Scotland has different income-tax bands and is out of scope for v1.
 *
 * This file is a pure calculation module with no DOM dependencies so it can be
 * unit-tested under Node (see test.mjs) and imported by the browser UI (app.js).
 *
 * Sources for every figure are cited inline. All amounts are annual unless noted.
 * This is an estimate, not financial or tax advice.
 */

// ---------------------------------------------------------------------------
// Constants (2025/26)
// ---------------------------------------------------------------------------

export const TAX_YEAR = "2025/26";

export const RATES = {
  // Income tax (rUK) — HMRC / House of Commons Library CBP-10237
  personalAllowance: 12570,
  paTaperThreshold: 100000, // PA reduced £1 for every £2 of income above this
  basicRateBand: 37700, // width of the 20% band (taxable income 0–37,700)
  higherRateThreshold: 125140, // taxable income above this is taxed at the additional rate
  incomeTax: { basic: 0.2, higher: 0.4, additional: 0.45 },

  // Employee NI — Class 1 primary (HMRC, 2025/26: main rate 8%)
  ni: {
    primaryThreshold: 12570,
    upperEarningsLimit: 50270,
    mainRate: 0.08,
    upperRate: 0.02,
  },

  // Employer NI — Class 1 secondary (from April 2025: 15% above £5,000)
  employerNi: {
    secondaryThreshold: 5000,
    rate: 0.15,
    employmentAllowance: 10500, // NOT available to single-director PSCs
  },

  apprenticeshipLevy: 0.005, // 0.5% of pay bill — large employers (most umbrellas)

  // Dividends (2025/26)
  dividends: {
    allowance: 500,
    basic: 0.0875,
    higher: 0.3375,
    additional: 0.3935,
  },

  // Corporation tax (2025/26)
  corporationTax: {
    smallRate: 0.19,
    mainRate: 0.25,
    lowerLimit: 50000,
    upperLimit: 250000,
    marginalFraction: 3 / 200, // standard marginal relief fraction
  },

  // Student loan repayment thresholds (2025/26), 9% above threshold (6% for PG)
  studentLoan: {
    plan1: { threshold: 26065, rate: 0.09 },
    plan2: { threshold: 28470, rate: 0.09 },
    plan4: { threshold: 32745, rate: 0.09 },
    plan5: { threshold: 25000, rate: 0.09 },
    postgrad: { threshold: 21000, rate: 0.06 },
  },
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Personal allowance after the £100k taper. */
export function personalAllowance(totalIncome) {
  const { personalAllowance: pa, paTaperThreshold } = RATES;
  if (totalIncome <= paTaperThreshold) return pa;
  const reduction = Math.floor((totalIncome - paTaperThreshold) / 2);
  return Math.max(0, pa - reduction);
}

/** Employee (Class 1 primary) National Insurance on an annual salary. */
export function employeeNI(salary) {
  const { primaryThreshold, upperEarningsLimit, mainRate, upperRate } = RATES.ni;
  if (salary <= primaryThreshold) return 0;
  const main = Math.min(salary, upperEarningsLimit) - primaryThreshold;
  const upper = Math.max(0, salary - upperEarningsLimit);
  return round2(main * mainRate + upper * upperRate);
}

/** Employer (Class 1 secondary) NI. Employment Allowance off by default (sole-director PSC). */
export function employerNI(salary, { employmentAllowance = false } = {}) {
  const { secondaryThreshold, rate, employmentAllowance: ea } = RATES.employerNi;
  const liable = Math.max(0, salary - secondaryThreshold) * rate;
  return round2(employmentAllowance ? Math.max(0, liable - ea) : liable);
}

/** Corporation tax with marginal relief (assumes no associated companies). */
export function corporationTax(profit) {
  if (profit <= 0) return 0;
  const { smallRate, mainRate, lowerLimit, upperLimit, marginalFraction } =
    RATES.corporationTax;
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
export function studentLoan(income, plans = []) {
  let total = 0;
  const undergrad = plans
    .filter((k) => k !== "postgrad")
    .map((k) => RATES.studentLoan[k])
    .filter(Boolean);
  if (undergrad.length) {
    const lowestThreshold = Math.min(...undergrad.map((p) => p.threshold));
    total += Math.max(0, income - lowestThreshold) * 0.09; // one 9% deduction
  }
  if (plans.includes("postgrad")) {
    const pg = RATES.studentLoan.postgrad;
    total += Math.max(0, income - pg.threshold) * pg.rate; // 6% on top
  }
  return round2(total);
}

/**
 * Income tax on a salary-plus-dividends mix with correct dividend stacking.
 * Dividends are treated as the top slice of income; the dividend allowance is
 * a 0% band that still consumes rate-band space.
 * Returns a detailed breakdown.
 */
export function incomeTaxSalaryAndDividends(salary, dividends) {
  const totalIncome = salary + dividends;
  const pa = personalAllowance(totalIncome);
  const { basicRateBand, higherRateThreshold, incomeTax } = RATES;
  const { allowance: divAllowance, basic: dB, higher: dH, additional: dA } =
    RATES.dividends;

  // Allocate personal allowance to salary first, then to dividends.
  const salaryTaxable = Math.max(0, salary - pa);
  const paLeftForDiv = Math.max(0, pa - salary);
  const dividendsTaxable = Math.max(0, dividends - paLeftForDiv);

  // --- Non-dividend (salary) sits at the bottom of the band structure ---
  const sBasic = Math.min(salaryTaxable, basicRateBand);
  const sHigher = Math.min(
    Math.max(salaryTaxable - basicRateBand, 0),
    higherRateThreshold - basicRateBand
  );
  const sAdditional = Math.max(salaryTaxable - higherRateThreshold, 0);
  const salaryTax =
    sBasic * incomeTax.basic +
    sHigher * incomeTax.higher +
    sAdditional * incomeTax.additional;

  // --- Dividends stack on top, starting at the band position salary reached ---
  let pos = salaryTaxable; // taxable-income position already consumed by salary

  // Dividend allowance: 0% but consumes band space.
  const allowanceUsed = Math.min(dividendsTaxable, divAllowance);
  pos += allowanceUsed;
  let remaining = dividendsTaxable - allowanceUsed;

  // Spread remaining dividends across the basic / higher / additional bands.
  const dInBasic = Math.min(Math.max(basicRateBand - pos, 0), remaining);
  remaining -= dInBasic;
  const dInHigher = Math.min(
    Math.max(higherRateThreshold - Math.max(pos, basicRateBand), 0),
    remaining
  );
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

/**
 * @param {object} p
 * @param {number} p.annualBilling  company revenue (day rate × days × weeks)
 * @param {number} p.directorSalary gross director's salary
 * @param {number} [p.expenses]     allowable business expenses
 * @param {number} [p.employerPension] employer pension contribution (company expense, into pension pot)
 * @param {string[]} [p.studentLoanPlans]
 */
export function outsideIR35({
  annualBilling,
  directorSalary,
  expenses = 0,
  employerPension = 0,
  studentLoanPlans = [],
}) {
  const empNI = employerNI(directorSalary, { employmentAllowance: false });

  // Company P&L
  const preTaxProfit = Math.max(
    0,
    annualBilling - directorSalary - empNI - employerPension - expenses
  );
  const ct = corporationTax(preTaxProfit);
  const distributableProfit = Math.max(0, preTaxProfit - ct);
  const dividends = distributableProfit; // assume full distribution

  // Personal taxes
  const tax = incomeTaxSalaryAndDividends(directorSalary, dividends);
  const eeNI = employeeNI(directorSalary);
  const sl = studentLoan(directorSalary + dividends, studentLoanPlans);

  const takeHome = round2(
    directorSalary + dividends - tax.incomeTaxTotal - eeNI - sl
  );

  const totalTaxAndNI = round2(
    empNI + ct + tax.incomeTaxTotal + eeNI + sl
  );

  return {
    label: "Outside IR35 (Limited Company)",
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

/**
 * The assignment rate (what the umbrella invoices) must cover the umbrella's
 * margin plus the employment costs (employer NI + apprenticeship levy) before
 * any gross pay reaches the worker. We invert those costs to find gross pay.
 *
 * @param {object} p
 * @param {number} p.assignmentAnnual  annual assignment income (rate × days × weeks)
 * @param {number} [p.marginAnnual]    umbrella's retained margin (annual)
 * @param {number} [p.pensionSacrifice] salary-sacrifice pension (no NI, into pension pot)
 * @param {boolean} [p.includeApprenticeshipLevy]
 * @param {string[]} [p.studentLoanPlans]
 */
export function insideIR35Umbrella({
  assignmentAnnual,
  marginAnnual = 0,
  pensionSacrifice = 0,
  includeApprenticeshipLevy = true,
  studentLoanPlans = [],
}) {
  const { secondaryThreshold, rate: erRate } = RATES.employerNi;
  const levy = includeApprenticeshipLevy ? RATES.apprenticeshipLevy : 0;

  // Pool available for employment after the umbrella's margin and any sacrifice.
  const pool = Math.max(0, assignmentAnnual - marginAnnual - pensionSacrifice);

  // pool = grossPay + employerNI(grossPay) + levy*grossPay
  //      = grossPay * (1 + erRate + levy) - erRate*secondaryThreshold   [if grossPay > threshold]
  // => grossPay = (pool + erRate*secondaryThreshold) / (1 + erRate + levy)
  let grossPay =
    (pool + erRate * secondaryThreshold) / (1 + erRate + levy);

  // If that solution falls below the secondary threshold, no employer NI is due.
  if (grossPay <= secondaryThreshold) {
    grossPay = pool / (1 + levy);
  }
  grossPay = Math.max(0, grossPay);

  const empNI = employerNI(grossPay, { employmentAllowance: false });
  const appLevy = round2(grossPay * levy);

  // Personal taxes on gross pay (no dividends here).
  const tax = incomeTaxSalaryAndDividends(grossPay, 0);
  const eeNI = employeeNI(grossPay);
  const sl = studentLoan(grossPay, studentLoanPlans);

  const takeHome = round2(grossPay - tax.incomeTaxTotal - eeNI - sl);

  const totalTaxAndNI = round2(
    empNI + appLevy + tax.incomeTaxTotal + eeNI + sl
  );

  return {
    label: "Inside IR35 (Umbrella)",
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
    retainedPct:
      assignmentAnnual > 0 ? round2((takeHome / assignmentAnnual) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Scenario: Permanent employee (for "what salary matches this take-home?")
// ---------------------------------------------------------------------------

/** Net take-home for a permanent employee on a given gross salary. */
export function permanentNet(grossSalary, studentLoanPlans = []) {
  const tax = incomeTaxSalaryAndDividends(grossSalary, 0);
  const eeNI = employeeNI(grossSalary);
  const sl = studentLoan(grossSalary, studentLoanPlans);
  return round2(grossSalary - tax.incomeTaxTotal - eeNI - sl);
}

/** Reverse: gross permanent salary needed to match a target net take-home. */
export function permanentSalaryForNet(targetNet, studentLoanPlans = []) {
  if (targetNet <= 0) return 0;
  let lo = 0;
  let hi = Math.max(targetNet * 2, 200000);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (permanentNet(mid, studentLoanPlans) < targetNet) lo = mid;
    else hi = mid;
  }
  return round2((lo + hi) / 2);
}

// ---------------------------------------------------------------------------
// Top-level helper used by the UI
// ---------------------------------------------------------------------------

/**
 * Compute both scenarios from a single set of UI inputs.
 * @param {object} cfg
 * @param {number} cfg.dayRate
 * @param {number} [cfg.umbrellaDayRate]   override rate for the inside scenario
 * @param {number} [cfg.daysPerWeek]
 * @param {number} [cfg.weeksPerYear]
 * @param {number} [cfg.directorSalary]
 * @param {number} [cfg.expenses]
 * @param {number} [cfg.employerPension]
 * @param {number} [cfg.umbrellaMarginPerWeek]
 * @param {number} [cfg.umbrellaPension]
 * @param {boolean} [cfg.includeApprenticeshipLevy]
 * @param {string[]} [cfg.studentLoanPlans]
 */
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
  } = cfg;

  const annualBilling = dayRate * daysPerWeek * weeksPerYear;
  const assignmentAnnual =
    (umbrellaDayRate ?? dayRate) * daysPerWeek * weeksPerYear;

  const outside = outsideIR35({
    annualBilling,
    directorSalary,
    expenses,
    employerPension,
    studentLoanPlans,
  });

  const inside = insideIR35Umbrella({
    assignmentAnnual,
    marginAnnual: umbrellaMarginPerWeek * weeksPerYear,
    pensionSacrifice: umbrellaPension,
    includeApprenticeshipLevy,
    studentLoanPlans,
  });

  return { outside, inside, annualBilling, assignmentAnnual };
}
