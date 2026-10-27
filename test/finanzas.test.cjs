const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../js/finanzas.js");

const fixed = annualPct => [{fromMonth: 1, toMonth: null, kind: "fixed", annualPct}];
const near = (actual, expected, tolerance = 0.02) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const loan = extra => ({principal: 50000000, months: 360, rates: fixed(9), propertyValue: 65000000, ...extra});

test("cuota y amortización reproducen el ejemplo hipotecario del libro", () => {
  near(F.payment(50000000, 9, 180), 507133.29);
  const result = F.mortgage(loan());
  near(result.totalInterest, 94832071.04, 5);
  near(result.remainingBalance, 0);
  near(result.rows.reduce((sum, row) => sum + row.principalPaid + row.extraPayment, 0), 50000000);
});

test("interés cero, cancelación parcial y abonos con penalización", () => {
  const result = F.mortgage(loan({principal: 1200, months: 12, rates: fixed(0), extraMonthly: 250, prepaymentFeePct: 2, prepaymentFeeUntilMonth: 2}));
  assert.equal(result.months, 4);
  assert.equal(result.rows.at(-1).payment, 150);
  assert.equal(result.totalPenalty, 10);
  assert.equal(result.totalInterest, 0);
});

test("penalización por etapas aplica a los abonos, no a toda la cuota", () => {
  const result = F.mortgage(loan({
    principal: 1200, months: 12, rates: fixed(0), extraMonthly: 50,
    prepaymentFees: [{fromMonth: 1, toMonth: 2, pct: 3}, {fromMonth: 3, toMonth: 4, pct: 2}]
  }));
  assert.equal(result.totalPenalty, 5);
  assert.equal(result.rows[0].prepaymentFee, 1.5);
  assert.equal(result.rows[2].prepaymentFee, 1);
  assert.equal(result.rows[4].prepaymentFee, 0);
});

test("fases, benchmark, piso y recálculo sobre saldo restante", () => {
  const rates = [
    {fromMonth: 1, toMonth: 12, kind: "fixed", annualPct: 4},
    {fromMonth: 13, toMonth: null, kind: "indexed", benchmark: "TBP", spreadPct: 3, floorPct: 8}
  ];
  const result = F.mortgage(loan({months: 240, rates, benchmarks: {TBP: 4}}));
  assert.equal(result.rows[11].annualPct, 4);
  assert.equal(result.rows[12].annualPct, 8);
  near(result.rows[12].payment, F.payment(result.rows[11].balance, 8, 228));
  assert.throws(() => F.phaseRate(rates, 13, {}), /TBP/);
  assert.throws(() => F.mortgage(loan({rates: [{fromMonth: 1, toMonth: 2, kind: "fixed", annualPct: 4}]})), /mes 3/);
});

test("seguros separados por saldo y por valor del inmueble", () => {
  const result = F.mortgage(loan({principal: 12000, months: 12, rates: fixed(0), propertyValue: 24000, lifeAnnualPct: 1.2, propertyAnnualPct: 0.6}));
  assert.equal(result.rows[0].lifeInsurance, 12);
  assert.equal(result.rows[1].lifeInsurance, 11);
  assert.equal(result.rows[1].propertyInsurance, 12);
  assert.equal(result.firstPayment, 1024);
});

test("financiar apertura resuelve la comisión sobre el principal ampliado", () => {
  const quote = F.closingCosts({price: 100000, downPayment: 20000, legalPct: 3, appraisal: 200, originationPct: 2, financeClosing: true});
  near(quote.principal, (80000 + 3200) / 0.98);
  near(quote.principal, 80000 + quote.total);
  assert.equal(quote.cashRequired, 20000);
  const cash = F.closingCosts({price: 100000, downPayment: 100000, legalPct: 3, appraisal: 0, originationPct: 2, minimumOriginationFee: 500});
  assert.equal(cash.origination, 0);
});

test("un CDP nominal distingue 360 días, retención y rendimiento neto", () => {
  const result = F.depositMaturity({principal: 1000000, annualPct: 6, days: 180, dayBasis: 360, taxPct: 15, rateBasis: "nominal"});
  assert.equal(result.grossInterest, 30000);
  assert.equal(result.tax, 4500);
  assert.equal(result.finalBalance, 1025500);
  near(F.depositMaturity({principal: 1000, annualPct: 10, days: 365, rateBasis: "effective"}).finalBalance, 1100);
});

test("el histórico no promedia ventanas móviles ni mezcla bases", () => {
  const years = [
    {period: "2023", valuePct: 10, measure: "calendar-year", returnBasis: "net-of-fees"},
    {period: "2024", valuePct: -10, measure: "calendar-year", returnBasis: "net-of-fees"},
    {period: "2025", valuePct: 20, measure: "calendar-year", returnBasis: "net-of-fees"}
  ];
  near(F.historySummary(years).cagrPct, ((1.1 * 0.9 * 1.2) ** (1 / 3) - 1) * 100);
  assert.equal(F.historySummary(years.slice(1)).usable, false);
  assert.equal(F.historySummary([...years, years[0]]).usable, false);
  assert.equal(F.historySummary(years.map(row => ({...row, measure: "trailing-12-month"}))).usable, false);
  assert.equal(F.historySummary(years.map((row, i) => ({...row, returnBasis: i ? "gross" : "net-of-fees"}))).usable, false);
});

test("capitalización mensual reproduce aportes de fin de mes del libro", () => {
  const result = F.investment({initial: 0, monthlyContribution: 50000, months: 240, annualReturnPct: 4, taxMode: "none"});
  near(result.finalBalance, 18192086.4, 1);
  assert.equal(result.contributions, 12000000);
});

test("un rendimiento neto no vuelve a descontar administración", () => {
  const common = {initial: 1000, months: 12, annualReturnPct: 10, annualFeePct: 2, taxMode: "none"};
  near(F.investment({...common, returnIncludesFees: true}).finalBalance, 1100);
  assert.ok(F.investment({...common, returnIncludesFees: false}).finalBalance < 1100);
});

test("comisión sobre rendimientos no se confunde con porcentaje del patrimonio", () => {
  const options = {initial: 10000, months: 12, annualReturnPct: 10, performanceFeePct: 10, taxMode: "none"};
  const result = F.investment(options);
  const monthly = 1.1 ** (1 / 12) - 1;
  near(result.finalBalance, 10000 * (1 + monthly * 0.9) ** 12);
  assert.ok(result.costs > 90 && result.costs < 110);
  near(F.investment({...options, returnIncludesFees: true}).finalBalance, 11000);
  near(F.investment({...options, annualReturnPct: -10}).costs, 0);
});

test("el impuesto a dividendos no se aplica a toda la valorización", () => {
  const common = {initial: 10000, months: 12, annualReturnPct: 10, taxPct: 30};
  const dividends = F.investment({...common, taxMode: "dividends", dividendYieldPct: 2});
  const allGain = F.investment({...common, taxMode: "annual-gain"});
  assert.ok(dividends.taxes < 70);
  assert.equal(allGain.taxes, 300);
  near(F.investment({...common, taxMode: "exit-gain"}).finalBalance, 10700);
});

test("retención mensual ocurre antes de reinvertir el interés de una cuenta", () => {
  const result = F.investment({initial: 10000, months: 12, annualReturnPct: ((1.01 ** 12) - 1) * 100, taxPct: 15, taxMode: "monthly-gain"});
  near(result.finalBalance, 10000 * (1 + 0.01 * 0.85) ** 12);
  assert.ok(result.taxes > 180);
  const loss = F.investment({initial: 10000, months: 12, annualReturnPct: -10, taxPct: 15, taxMode: "monthly-gain"});
  assert.equal(loss.taxes, 0);
  const withMaintenance = F.investment({initial: 10000, months: 1, annualReturnPct: ((1.01 ** 12) - 1) * 100, monthlyFixed: 10, taxPct: 15, taxMode: "monthly-gain"});
  near(withMaintenance.finalBalance, 10075);
  near(withMaintenance.taxes, 15);
});

test("agrupar envíos reduce costos sin adelantar los aportes", () => {
  const options = {initial: 0, monthlyContribution: 100, months: 12, annualReturnPct: 0, transferFixed: 10, tradeFixed: 1, taxMode: "none"};
  const monthly = F.investment(options);
  const quarterly = F.investment({...options, contributionEveryMonths: 3});
  assert.equal(monthly.finalBalance, 1068);
  assert.equal(quarterly.finalBalance, 1156);
  assert.equal(quarterly.contributions, 1200);
});

test("un aporte menor que las comisiones queda en efectivo, no desaparece", () => {
  const result = F.investment({initial: 5, monthlyContribution: 0, months: 12, annualReturnPct: 10, transferFixed: 20, taxMode: "none"});
  assert.equal(result.finalBalance, 5);
  assert.equal(result.cashNotInvested, 5);
  assert.equal(result.costs, 0);
  assert.equal(result.warnings.length, 1);
});

test("transferencia con mínimo, máximo y corresponsal fijo", () => {
  const options = {months: 12, annualReturnPct: 0, transferFixed: 20, transferPct: 0.2, transferMinimum: 30, transferMaximum: 100, taxMode: "none"};
  assert.equal(F.investment({...options, initial: 1000}).costs, 50);
  assert.equal(F.investment({...options, initial: 100000}).costs, 120);
});

test("BN aplica límites al porcentaje más fijo interno; BCR añade SWIFT después", () => {
  const options = {months: 12, annualReturnPct: 0, taxMode: "none"};
  const bn = {transferPct: 0.35, transferBaseFixed: 7, transferMinimum: 22, transferMaximum: 85};
  assert.equal(F.investment({...options, ...bn, initial: 1000}).costs, 22);
  assert.equal(F.investment({...options, ...bn, initial: 10000}).costs, 42);
  assert.equal(F.investment({...options, ...bn, initial: 100000}).costs, 85);
  assert.equal(F.investment({...options, initial: 1000, transferPct: 0.35, transferMinimum: 15, transferMaximum: 85, transferFixed: 8}).costs, 23);
});

test("mantenimiento y costo porcentual de salida se descuentan", () => {
  const result = F.investment({initial: 1000, months: 12, annualReturnPct: 0, monthlyFixed: 2, exitFixed: 10, exitPct: 1, taxMode: "none"});
  assert.equal(result.finalBalance, 956.24);
  assert.equal(result.costs, 43.76);
});

test("compra frente a alquiler usa el mismo efectivo, horizonte y presupuesto", () => {
  const options = {
    price: 100000, savings: 30000, monthlyBudget: 1000, rent: 400,
    months: 120, downPct: 20, targetDownPct: 40,
    homeGrowthPct: 0, rentGrowthPct: 0, savingsReturnPct: 0,
    maintenanceAnnualPct: 0, propertyTaxAnnualPct: 0, hoa: 0, saleCostPct: 0,
    closing: {legalPct: 0, appraisal: 0, originationPct: 0},
    loan: {months: 120, rates: fixed(0), lifeAnnualPct: 0, propertyAnnualPct: 0}
  };
  const [now, later, renter] = F.compareHousing(options);
  assert.equal(now.buyMonth, 0);
  near(now.netWorth, 30000 + 120000, 1);
  assert.equal(renter.netWorth, 30000 + 120 * 600);
  assert.equal(later.buyMonth, 17);
  assert.ok(later.feasible);
  const failed = F.compareHousing({...options, savings: 0})[0];
  assert.equal(failed.feasible, false);
  assert.equal(failed.initialShortfall, 20000);
  const cashDeficit = F.compareHousing({...options, monthlyBudget: 1, savings: 20000})[0];
  assert.equal(cashDeficit.feasible, false);
  assert.ok(cashDeficit.unfunded > 0);
});

test("entradas imposibles y rendimientos de pérdida se tratan explícitamente", () => {
  assert.throws(() => F.payment(1000, 5, 0), /plazo/);
  assert.throws(() => F.number("", "importe"), /Falta/);
  assert.throws(() => F.number(Infinity, "importe"), /importe/);
  assert.throws(() => F.investment({initial: 1, months: 12, annualReturnPct: -100}), /rendimiento/);
  assert.ok(F.investment({initial: 1000, months: 12, annualReturnPct: -20, taxPct: 15}).finalBalance < 1000);
});
