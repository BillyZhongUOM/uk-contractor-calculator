/*
 * Engine verification — run with: node test.mjs
 * Hand-computed reference values are documented next to each assertion.
 */
import {
  personalAllowance,
  employeeNI,
  employerNI,
  corporationTax,
  studentLoan,
  incomeTaxSalaryAndDividends,
  outsideIR35,
  insideIR35Umbrella,
  permanentNet,
  permanentSalaryForNet,
  compute,
} from "./engine.js";

let pass = 0;
let fail = 0;

function approx(name, got, want, tol = 0.75) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}: ${got}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}: got ${got}, want ${want} (±${tol})`);
  }
}

console.log("\n— Building blocks —");
// Personal allowance taper
approx("PA @ £50k", personalAllowance(50000), 12570);
approx("PA @ £110k (taper)", personalAllowance(110000), 7570);
approx("PA @ £125,140 (gone)", personalAllowance(125140), 0);

// Employee NI
approx("EE NI @ £12,570", employeeNI(12570), 0);
approx("EE NI @ £50,270 (UEL)", employeeNI(50270), 3016); // 37,700 × 8%
approx("EE NI @ £60,000", employeeNI(60000), 3210.6); // 3016 + 9,730×2%

// Employer NI (sole-director PSC, no Employment Allowance)
approx("ER NI @ £12,570", employerNI(12570), 1135.5); // 7,570 × 15%
approx("ER NI @ £5,000 (threshold)", employerNI(5000), 0);

// Corporation tax
approx("CT @ £50k (small)", corporationTax(50000), 9500);
approx("CT @ £250k (main)", corporationTax(250000), 62500);
approx("CT @ £100k (marginal)", corporationTax(100000), 22750); // 25k − 150k×1.5%

// Student loan
approx("Plan 2 SL @ £40k", studentLoan(40000, ["plan2"]), 1037.7); // (40,000−28,470)×9%
// Multiple undergrad plans: ONE 9% deduction on the lowest threshold (not stacked)
approx("Plan 1+2 SL @ £40k (lowest threshold once)", studentLoan(40000, ["plan1", "plan2"]), 1254.15); // (40,000−26,065)×9%
// Undergrad + postgrad stack: 9% + 6%
approx("Plan 2+PG SL @ £40k", studentLoan(40000, ["plan2", "postgrad"]), 2177.7); // 1037.7 + (40,000−21,000)×6%

// Income tax with dividend stacking: £12,570 salary + £50,000 dividends
const t = incomeTaxSalaryAndDividends(12570, 50000);
approx("Income tax (12,570 + 50,000 div)", t.incomeTaxTotal, 7406.25);

console.log("\n— Scenario: Outside IR35 (Ltd), £110k billing, £12,570 salary —");
const o = outsideIR35({ annualBilling: 110000, directorSalary: 12570 });
approx("employer NI", o.company.employerNI, 1135.5);
approx("pre-tax profit", o.company.preTaxProfit, 96294.5);
approx("corporation tax", o.company.corporationTax, 21768.04, 1.0);
approx("dividends", o.company.dividends, 74526.46, 1.5);
approx("income tax total", o.personal.salaryTax + o.personal.dividendTax, 15683.93, 1.5);
approx("TAKE-HOME", o.takeHome, 71412.53, 2.0);

console.log("\n— Scenario: Inside IR35 (Umbrella), £110k assignment, £25/wk margin —");
const u = insideIR35Umbrella({
  assignmentAnnual: 110000,
  marginAnnual: 25 * 44,
});
approx("gross pay (inverted)", u.umbrella.grossPay, 94935.06, 1.0);
// Conservation check: grossPay + employerNI + levy + margin == assignment
const reconstructed =
  u.umbrella.grossPay +
  u.umbrella.employerNI +
  u.umbrella.apprenticeshipLevy +
  u.umbrella.margin;
approx("pool reconciliation == assignment", reconstructed, 110000, 1.0);
approx("employer NI", u.umbrella.employerNI, 13490.26, 1.0);
approx("income tax", u.personal.incomeTax, 25406.02, 1.5);
approx("employee NI", u.personal.employeeNI, 3909.3, 1.0);
approx("TAKE-HOME", u.takeHome, 65619.74, 2.0);

console.log("\n— Sanity: Outside should beat Umbrella at this rate —");
approx("outside − umbrella gap", o.takeHome - u.takeHome, 5792.79, 4.0);

console.log("\n— Permanent equivalent round-trip —");
const net60 = permanentNet(60000);
approx("permanent net @ £60k", net60, 60000 - 11432 - 3210.6, 2.0); // tax 11,432 + NI
approx("reverse salary for that net", permanentSalaryForNet(net60), 60000, 5.0);

console.log("\n— compute() smoke test —");
const c = compute({ dayRate: 500, daysPerWeek: 5, weeksPerYear: 44 });
approx("compute outside take-home", c.outside.takeHome, 71412.53, 3.0);
approx("compute inside take-home", c.inside.takeHome, 65619.74, 3.0);

console.log(`\n${"=".repeat(40)}`);
console.log(`Result: ${pass} passed, ${fail} failed`);
console.log("=".repeat(40));
if (fail > 0) process.exit(1);
