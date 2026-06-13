/* NetRate UI — wires the tax engine to the page.
   No framework, no build step: an ES module the browser loads directly. */
import { compute, permanentSalaryForNet } from "./engine.js";

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const plain0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const money = (n) => gbp0.format(Math.round(n));
const signed = (n) => (n <= 0 ? money(n) : "−" + money(n)); // deductions shown as minus

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
const els = {
  dayRate: $("dayRate"),
  daysPerWeek: $("daysPerWeek"),
  weeksPerYear: $("weeksPerYear"),
  salaryStrategy: $("salaryStrategy"),
  customSalary: $("customSalary"),
  customSalaryWrap: $("customSalaryWrap"),
  expenses: $("expenses"),
  employerPension: $("employerPension"),
  umbrellaMargin: $("umbrellaMargin"),
  umbrellaPension: $("umbrellaPension"),
  diffRate: $("diffRate"),
  umbrellaDayRate: $("umbrellaDayRate"),
  umbrellaRateWrap: $("umbrellaRateWrap"),
  appLevy: $("appLevy"),
  studentLoan: $("studentLoan"),
};

const num = (el, fallback = 0) => {
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
};
const radio = (name) => {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
};

function readInputs() {
  const strategy = els.salaryStrategy.value;
  const directorSalary =
    strategy === "custom" ? num(els.customSalary, 12570) : parseFloat(strategy);
  const plans = [...els.studentLoan.querySelectorAll("input:checked")].map((c) => c.value);

  return {
    dayRate: num(els.dayRate),
    umbrellaDayRate: els.diffRate.checked ? num(els.umbrellaDayRate) : undefined,
    daysPerWeek: num(els.daysPerWeek, 5),
    weeksPerYear: num(els.weeksPerYear, 44),
    directorSalary,
    expenses: num(els.expenses),
    employerPension: num(els.employerPension),
    umbrellaMarginPerWeek: num(els.umbrellaMargin, 25),
    umbrellaPension: num(els.umbrellaPension),
    includeApprenticeshipLevy: els.appLevy.checked,
    studentLoanPlans: plans,
    taxYear: radio("year") || "2026/27",
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const displayed = { outTakeHome: 0, inTakeHome: 0 };
const rafIds = {};

function animateNumber(el, key, to) {
  const from = displayed[key] || 0;
  displayed[key] = to;
  // Cancel any in-flight animation for this number so rapid changes can't
  // leave two rAF loops fighting over the same element.
  if (rafIds[key]) cancelAnimationFrame(rafIds[key]);
  if (reduceMotion || document.hidden || from === to) {
    el.textContent = plain0.format(Math.round(to));
    rafIds[key] = null;
    return;
  }
  const start = performance.now();
  const dur = 480;
  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = plain0.format(Math.round(from + (to - from) * eased));
    rafIds[key] = t < 1 ? requestAnimationFrame(tick) : null;
  }
  rafIds[key] = requestAnimationFrame(tick);
}

function setBar(el, segments, total) {
  el.innerHTML = "";
  if (total <= 0) return;
  for (const [cls, value] of segments) {
    if (value <= 0) continue;
    const span = document.createElement("span");
    span.className = cls;
    span.style.width = (value / total) * 100 + "%";
    el.appendChild(span);
  }
}

function ledgerRow(label, amount, kind, swatch) {
  const row = document.createElement("div");
  row.className = "lrow" + (kind ? " " + kind : "");
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  if (swatch) {
    const s = document.createElement("span");
    s.className = "swatch";
    s.style.background = swatch;
    lbl.appendChild(s);
  }
  lbl.appendChild(document.createTextNode(label));
  const amt = document.createElement("span");
  amt.className = "ledger-amount";
  amt.textContent = kind === "deduct" ? signed(-Math.abs(amount)) : money(amount);
  row.append(lbl, amt);
  return row;
}

const C = {
  take: "var(--accent)",
  tax: "var(--amber)",
  ni: "var(--slate)",
  other: "var(--negative)",
};

function renderOutside(o, billing) {
  setBar(
    $("outBar"),
    [
      ["seg-take", o.takeHome],
      ["seg-tax", o.company.corporationTax + o.personal.salaryTax + o.personal.dividendTax + o.personal.studentLoan],
      ["seg-ni", o.company.employerNI + o.personal.employeeNI],
      ["seg-other", o.company.expenses + o.company.employerPension],
    ],
    billing
  );

  const rows = $("outRows");
  rows.innerHTML = "";
  rows.appendChild(ledgerRow("Annual billing", billing, "start"));
  rows.appendChild(
    ledgerRow(
      `via ${money(o.company.directorSalary)} salary + ${money(o.company.dividends)} dividends`,
      0,
      "muted-row"
    )
  ).querySelector(".ledger-amount").textContent = "";
  rows.appendChild(ledgerRow("Corporation tax", o.company.corporationTax, "deduct"));
  rows.appendChild(ledgerRow("Employer NI", o.company.employerNI, "deduct"));
  rows.appendChild(ledgerRow("Income tax", o.personal.salaryTax + o.personal.dividendTax, "deduct"));
  if (o.personal.employeeNI > 0) rows.appendChild(ledgerRow("Employee NI", o.personal.employeeNI, "deduct"));
  if (o.personal.studentLoan > 0) rows.appendChild(ledgerRow("Student loan", o.personal.studentLoan, "deduct"));
  if (o.company.expenses > 0) rows.appendChild(ledgerRow("Business expenses", o.company.expenses, "deduct"));
  if (o.company.employerPension > 0) rows.appendChild(ledgerRow("Pension pot (kept)", o.company.employerPension, "muted-row"));
  rows.appendChild(ledgerRow("Take-home pay", o.takeHome, "total"));
}

function renderInside(u, assignment) {
  setBar(
    $("inBar"),
    [
      ["seg-take", u.takeHome],
      ["seg-tax", u.personal.incomeTax + u.personal.studentLoan],
      ["seg-ni", u.umbrella.employerNI + u.personal.employeeNI + u.umbrella.apprenticeshipLevy],
      ["seg-other", u.umbrella.margin + u.umbrella.pensionSacrifice],
    ],
    assignment
  );

  const rows = $("inRows");
  rows.innerHTML = "";
  rows.appendChild(ledgerRow("Assignment income", assignment, "start"));
  rows.appendChild(ledgerRow("Umbrella margin", u.umbrella.margin, "deduct"));
  rows.appendChild(ledgerRow("Employer NI", u.umbrella.employerNI, "deduct"));
  if (u.umbrella.apprenticeshipLevy > 0) rows.appendChild(ledgerRow("Apprenticeship levy", u.umbrella.apprenticeshipLevy, "deduct"));
  rows.appendChild(ledgerRow("= Gross pay", u.umbrella.grossPay, "muted-row"));
  rows.appendChild(ledgerRow("Income tax", u.personal.incomeTax, "deduct"));
  rows.appendChild(ledgerRow("Employee NI", u.personal.employeeNI, "deduct"));
  if (u.personal.studentLoan > 0) rows.appendChild(ledgerRow("Student loan", u.personal.studentLoan, "deduct"));
  if (u.umbrella.pensionSacrifice > 0) rows.appendChild(ledgerRow("Pension pot (kept)", u.umbrella.pensionSacrifice, "muted-row"));
  rows.appendChild(ledgerRow("Take-home pay", u.takeHome, "total"));
}

function render() {
  const cfg = readInputs();
  const { outside, inside, annualBilling, assignmentAnnual } = compute(cfg);

  $("yearBadge").textContent = "Tax year " + cfg.taxYear;

  animateNumber($("outTakeHome"), "outTakeHome", outside.takeHome);
  animateNumber($("inTakeHome"), "inTakeHome", inside.takeHome);
  $("outMonthly").textContent = money(outside.takeHomeMonthly);
  $("inMonthly").textContent = money(inside.takeHomeMonthly);
  $("outPct").textContent = outside.retainedPct.toFixed(0) + "%";
  $("inPct").textContent = inside.retainedPct.toFixed(0) + "%";

  renderOutside(outside, annualBilling);
  renderInside(inside, assignmentAnnual);

  // Winner highlight + delta
  const outCard = document.querySelector('[data-scenario="outside"]');
  const inCard = document.querySelector('[data-scenario="inside"]');
  const diff = outside.takeHome - inside.takeHome;
  const outWins = diff >= 0;
  outCard.dataset.winner = String(outWins);
  inCard.dataset.winner = String(!outWins);
  $("outWinner").hidden = !outWins;
  $("inWinner").hidden = outWins;

  const deltaEl = $("delta");
  if (Math.abs(diff) < 1 || annualBilling <= 0) {
    deltaEl.innerHTML = "Enter a day rate to compare the two routes.";
  } else {
    const winner = outWins ? "Outside IR35 (limited company)" : "Inside IR35 (umbrella)";
    deltaEl.innerHTML = `${winner} keeps <strong>${money(Math.abs(diff))}</strong> more per year, about <strong>${money(Math.abs(diff) / 12)}</strong> a month.`;
  }

  // Permanent-salary equivalent, based on the winning route
  const best = outWins ? outside : inside;
  const bestLabel = outWins ? "Outside IR35" : "Umbrella";
  if (best.takeHome > 0) {
    const equiv = Math.round(permanentSalaryForNet(best.takeHome, cfg.studentLoanPlans, cfg.taxYear) / 500) * 500;
    $("equivLine").innerHTML = `${bestLabel}, your <strong>${money(best.takeHome)}</strong> take-home is like a permanent salary of about <strong>${money(equiv)}</strong>.`;
  } else {
    $("equivLine").textContent = "Enter your day rate to see the permanent-salary equivalent.";
  }

  syncURL(cfg);
}

// ---------------------------------------------------------------------------
// URL state (shareable links)
// ---------------------------------------------------------------------------
function syncURL(cfg) {
  const p = new URLSearchParams();
  p.set("r", cfg.dayRate);
  if (cfg.daysPerWeek !== 5) p.set("d", cfg.daysPerWeek);
  if (cfg.weeksPerYear !== 44) p.set("w", cfg.weeksPerYear);
  if (cfg.directorSalary !== 12570) p.set("s", cfg.directorSalary);
  if (cfg.expenses) p.set("e", cfg.expenses);
  if (cfg.employerPension) p.set("ep", cfg.employerPension);
  if (cfg.umbrellaMarginPerWeek !== 25) p.set("um", cfg.umbrellaMarginPerWeek);
  if (cfg.umbrellaPension) p.set("up", cfg.umbrellaPension);
  if (cfg.umbrellaDayRate !== undefined) p.set("ur", cfg.umbrellaDayRate);
  if (!cfg.includeApprenticeshipLevy) p.set("al", "0");
  if (cfg.studentLoanPlans.length) p.set("sl", cfg.studentLoanPlans.join(","));
  if (cfg.taxYear && cfg.taxYear !== "2026/27") p.set("y", cfg.taxYear);
  history.replaceState(null, "", "?" + p.toString());
}

function applyURL() {
  const p = new URLSearchParams(location.search);
  if (![...p.keys()].length) return;
  const set = (el, key) => { if (p.has(key)) el.value = p.get(key); };
  if (p.get("y") === "2025/26") { const r = document.getElementById("year2526"); if (r) r.checked = true; }
  set(els.dayRate, "r");
  set(els.daysPerWeek, "d");
  set(els.weeksPerYear, "w");
  set(els.expenses, "e");
  set(els.employerPension, "ep");
  set(els.umbrellaMargin, "um");
  set(els.umbrellaPension, "up");
  if (p.has("s")) {
    const s = p.get("s");
    if (s === "12570" || s === "5000") {
      els.salaryStrategy.value = s;
    } else {
      els.salaryStrategy.value = "custom";
      els.customSalary.value = s;
      els.customSalaryWrap.hidden = false;
    }
  }
  if (p.has("ur")) {
    els.diffRate.checked = true;
    els.umbrellaDayRate.value = p.get("ur");
    els.umbrellaRateWrap.hidden = false;
  }
  if (p.get("al") === "0") els.appLevy.checked = false;
  if (p.has("sl")) {
    const plans = p.get("sl").split(",");
    els.studentLoan.querySelectorAll("input").forEach((c) => { c.checked = plans.includes(c.value); });
  }
  if ([...p.keys()].some((k) => ["s", "e", "ep", "um", "up", "ur", "al", "sl"].includes(k))) {
    openAdvanced();
  }
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------
function openAdvanced() {
  $("advanced").hidden = false;
  $("advancedToggle").setAttribute("aria-expanded", "true");
}

function wire() {
  // Live recompute
  $("calcForm").addEventListener("input", render);
  $("calcForm").addEventListener("change", render);

  // Advanced disclosure
  $("advancedToggle").addEventListener("click", () => {
    const adv = $("advanced");
    const open = adv.hidden;
    adv.hidden = !open;
    $("advancedToggle").setAttribute("aria-expanded", String(open));
  });

  // Salary strategy custom field
  els.salaryStrategy.addEventListener("change", () => {
    els.customSalaryWrap.hidden = els.salaryStrategy.value !== "custom";
  });

  // Different umbrella rate
  els.diffRate.addEventListener("change", () => {
    els.umbrellaRateWrap.hidden = !els.diffRate.checked;
    if (els.diffRate.checked && !els.umbrellaDayRate.value) els.umbrellaDayRate.value = els.dayRate.value;
  });

  // Share link
  $("shareBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      const b = $("shareBtn");
      b.classList.add("copied");
      b.textContent = "Link copied";
      setTimeout(() => { b.classList.remove("copied"); b.textContent = "Copy share link"; }, 1800);
    } catch { /* clipboard blocked: no-op */ }
  });

  // Print / PDF
  $("printBtn").addEventListener("click", () => window.print());

  // Theme
  $("themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("netrate-theme", next); } catch {}
  });
}

function initTheme() {
  let theme;
  try { theme = localStorage.getItem("netrate-theme"); } catch {}
  if (!theme) theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
}

// ---------------------------------------------------------------------------
initTheme();
applyURL();
wire();
render();
