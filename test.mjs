/*
 * Engine verification — run with: node test.mjs
 * Hand-computed reference values are documented next to each assertion.
 * Building blocks are called with an explicit rates object; scenarios with an
 * explicit taxYear, so the 2025/26 reference values stay pinned to 2025/26.
 */
import {
  getRates,
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

const R25 = getRates("2025/26");
const R26 = getRates("2026/27");

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
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${detail ? ": " + detail : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}: condition failed${detail ? " (" + detail + ")" : ""}`);
  }
}

console.log("\n— Building blocks (2025/26) —");
approx("PA @ £50k", personalAllowance(50000, R25), 12570);
approx("PA @ £110k (taper)", personalAllowance(110000, R25), 7570);
approx("PA @ £125,140 (gone)", personalAllowance(125140, R25), 0);

approx("EE NI @ £12,570", employeeNI(12570, R25), 0);
approx("EE NI @ £50,270 (UEL)", employeeNI(50270, R25), 3016); // 37,700 × 8%
approx("EE NI @ £60,000", employeeNI(60000, R25), 3210.6); // 3016 + 9,730×2%

approx("ER NI @ £12,570", employerNI(12570, { employmentAllowance: false }, R25), 1135.5); // 7,570 × 15%
approx("ER NI @ £5,000 (threshold)", employerNI(5000, { employmentAllowance: false }, R25), 0);

approx("CT @ £50k (small)", corporationTax(50000, R25), 9500);
approx("CT @ £250k (main)", corporationTax(250000, R25), 62500);
approx("CT @ £100k (marginal)", corporationTax(100000, R25), 22750); // 25k − 150k×1.5%

approx("Plan 2 SL @ £40k", studentLoan(40000, ["plan2"], R25), 1037.7); // (40,000−28,470)×9%
approx("Plan 1+2 SL @ £40k (lowest threshold once)", studentLoan(40000, ["plan1", "plan2"], R25), 1254.15);
approx("Plan 2+PG SL @ £40k", studentLoan(40000, ["plan2", "postgrad"], R25), 2177.7);

const t = incomeTaxSalaryAndDividends(12570, 50000, R25);
approx("Income tax (12,570 + 50,000 div)", t.incomeTaxTotal, 7406.25);

console.log("\n— Scenario: Outside IR35 (Ltd), £110k billing, £12,570 salary (2025/26) —");
const o = outsideIR35({ annualBilling: 110000, directorSalary: 12570, taxYear: "2025/26" });
approx("employer NI", o.company.employerNI, 1135.5);
approx("pre-tax profit", o.company.preTaxProfit, 96294.5);
approx("corporation tax", o.company.corporationTax, 21768.04, 1.0);
approx("dividends", o.company.dividends, 74526.46, 1.5);
approx("income tax total", o.personal.salaryTax + o.personal.dividendTax, 15683.93, 1.5);
approx("TAKE-HOME", o.takeHome, 71412.53, 2.0);

console.log("\n— Scenario: Inside IR35 (Umbrella), £110k assignment, £25/wk margin (2025/26) —");
const u = insideIR35Umbrella({ assignmentAnnual: 110000, marginAnnual: 25 * 44, taxYear: "2025/26" });
approx("gross pay (inverted)", u.umbrella.grossPay, 94935.06, 1.0);
const reconstructed = u.umbrella.grossPay + u.umbrella.employerNI + u.umbrella.apprenticeshipLevy + u.umbrella.margin;
approx("pool reconciliation == assignment", reconstructed, 110000, 1.0);
approx("employer NI", u.umbrella.employerNI, 13490.26, 1.0);
approx("income tax", u.personal.incomeTax, 25406.02, 1.5);
approx("employee NI", u.personal.employeeNI, 3909.3, 1.0);
approx("TAKE-HOME", u.takeHome, 65619.74, 2.0);

console.log("\n— Sanity: Outside should beat Umbrella at this rate —");
approx("outside − umbrella gap", o.takeHome - u.takeHome, 5792.79, 4.0);

console.log("\n— Permanent equivalent round-trip (2025/26) —");
const net60 = permanentNet(60000, [], "2025/26");
approx("permanent net @ £60k", net60, 60000 - 11432 - 3210.6, 2.0); // tax 11,432 + NI
approx("reverse salary for that net", permanentSalaryForNet(net60, [], "2025/26"), 60000, 5.0);

console.log("\n— 2026/27: dividend rates up 2pp (ordinary 10.75%, upper 35.75%) —");
const t26 = incomeTaxSalaryAndDividends(12570, 50000, R26);
approx("Income tax (12,570 + 50k div, 2026/27)", t26.incomeTaxTotal, 8396.25); // 37,200×10.75% + 12,300×35.75%
approx("ER NI unchanged in 2026/27", employerNI(12570, { employmentAllowance: false }, R26), 1135.5);
approx("CT unchanged in 2026/27", corporationTax(100000, R26), 22750);
approx("Plan 2 SL threshold rose (2026/27 £29,385)", studentLoan(40000, ["plan2"], R26), 955.35); // (40,000−29,385)×9%

const o26 = outsideIR35({ annualBilling: 110000, directorSalary: 12570, taxYear: "2026/27" });
approx("Outside dividends unchanged (CT inputs unchanged)", o26.company.dividends, 74526.46, 1.5);
approx("Outside dividend tax higher in 2026/27", o26.personal.dividendTax, 17164.46, 1.5);
approx("Outside TAKE-HOME 2026/27", o26.takeHome, 69932.0, 2.5);
ok("2026/27 outside take-home is lower than 2025/26", o26.takeHome < o.takeHome, `${o26.takeHome} < ${o.takeHome}`);
approx("dividend-rise cost on £110k billing", o.takeHome - o26.takeHome, 1480.53, 2.5);

console.log("\n— compute() smoke test —");
const c25 = compute({ dayRate: 500, daysPerWeek: 5, weeksPerYear: 44, taxYear: "2025/26" });
approx("compute outside take-home (2025/26)", c25.outside.takeHome, 71412.53, 3.0);
approx("compute inside take-home (2025/26)", c25.inside.takeHome, 65619.74, 3.0);
const cDef = compute({ dayRate: 500, daysPerWeek: 5, weeksPerYear: 44 });
ok("compute defaults to 2026/27", cDef.taxYear === "2026/27", cDef.taxYear);
ok("default-year outside take-home below 2025/26", cDef.outside.takeHome < c25.outside.takeHome,
   `${cDef.outside.takeHome} < ${c25.outside.takeHome}`);

console.log(`\n${"=".repeat(40)}`);
console.log(`Result: ${pass} passed, ${fail} failed`);
console.log("=".repeat(40));
if (fail > 0) process.exit(1);
