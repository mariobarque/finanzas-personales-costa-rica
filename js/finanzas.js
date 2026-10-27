(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Finanzas = api;
})(globalThis, function () {
  "use strict";

  function number(value, name, min = 0, max = 1e15) {
    if (value === "" || value === null || typeof value === "boolean") {
      throw new RangeError(`Falta ${name}.`);
    }
    const result = Number(value);
    if (!Number.isFinite(result) || result < min || result > max) {
      throw new RangeError(`${name}: usa un valor entre ${min} y ${max}.`);
    }
    return result;
  }

  function integer(value, name, min, max) {
    const result = number(value, name, min, max);
    if (!Number.isInteger(result)) throw new RangeError(`${name} debe ser un entero.`);
    return result;
  }

  const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const monthlyEffective = annualPct => Math.expm1(Math.log1p(number(annualPct, "rendimiento", -99.99, 500) / 100) / 12);

  function payment(principal, annualPct, months) {
    const amount = number(principal, "principal");
    const n = integer(months, "plazo en meses", 1, 600);
    const rate = number(annualPct, "tasa anual", 0, 100) / 1200;
    return rate === 0 ? amount / n : amount * rate / -Math.expm1(-n * Math.log1p(rate));
  }

  function phaseRate(phases, month, benchmarks = {}) {
    const phase = phases.find(item => month >= item.fromMonth && (item.toMonth == null || month <= item.toMonth));
    if (!phase) throw new RangeError(`No hay una tasa documentada para el mes ${month}. Ingresa tu cotización.`);
    let rate;
    if (phase.kind === "fixed") {
      rate = number(phase.annualPct, "tasa fija", 0, 100);
    } else if (phase.kind === "indexed") {
      const key = String(phase.benchmark).toUpperCase();
      const reference = benchmarks[key];
      rate = number(reference, `referencia ${key}`, -10, 100) + number(phase.spreadPct, "margen de la tasa", -10, 100);
    } else {
      throw new RangeError("El tipo de tasa no se reconoce.");
    }
    if (phase.floorPct != null) rate = Math.max(rate, number(phase.floorPct, "piso", 0, 100));
    if (phase.capPct != null) rate = Math.min(rate, number(phase.capPct, "techo", 0, 100));
    return number(rate, "tasa resultante", 0, 100);
  }

  function closingCosts(options) {
    const price = number(options.price, "precio", 1);
    const down = number(options.downPayment, "prima", 0, price);
    const legal = price * number(options.legalPct, "gastos legales y de traspaso", 0, 20) / 100;
    const appraisal = number(options.appraisal, "avalúo");
    const feeRate = number(options.originationPct, "comisión de apertura", 0, 20) / 100;
    const minimum = number(options.minimumOriginationFee ?? 0, "comisión mínima");
    const base = price - down;
    let principal = base;
    if (options.financeClosing) {
      // The bank fee is calculated on the loan that includes the financed fee.
      principal = (base + legal + appraisal) / (1 - feeRate);
      if (principal * feeRate < minimum) principal = base + legal + appraisal + minimum;
    }
    const origination = principal > 0 ? Math.max(minimum, principal * feeRate) : 0;
    const total = money(legal + appraisal + origination);
    return {
      principal: money(principal),
      legal: money(legal),
      appraisal: money(appraisal),
      origination: money(origination),
      total,
      cashRequired: money(down + (options.financeClosing ? 0 : total)),
      ltv: principal / price
    };
  }

  function mortgage(options) {
    let balance = money(number(options.principal, "principal"));
    const term = integer(options.months, "plazo en meses", 1, 600);
    const propertyValue = number(options.propertyValue, "valor asegurable");
    const lifePct = number(options.lifeAnnualPct ?? 0, "seguro de vida anual", 0, 20) / 1200;
    const propertyInsurance = money(propertyValue * number(options.propertyAnnualPct ?? 0, "seguro de inmueble anual", 0, 20) / 1200);
    const extra = number(options.extraMonthly ?? 0, "abono extraordinario");
    const penalty = number(options.prepaymentFeePct ?? 0, "comisión de abono", 0, 30) / 100;
    const penaltyUntil = integer(options.prepaymentFeeUntilMonth ?? term, "vigencia de penalización", 0, 600);
    const phases = options.rates || [];
    if (balance > 0 && !phases.length) throw new RangeError("Falta una tasa pública completa o tu cotización.");
    const rows = [];
    let lastRate = null;
    let scheduled = 0;
    let totalInterest = 0;
    let totalInsurance = 0;
    let totalPenalty = 0;
    let totalPayments = 0;
    for (let month = 1; month <= term && balance > 0.005; month += 1) {
      const rate = phaseRate(phases, month, options.benchmarks);
      if (rate !== lastRate) {
        scheduled = payment(balance, rate, term - month + 1);
        lastRate = rate;
      }
      const opening = balance;
      const interest = money(opening * rate / 1200);
      const scheduledPayment = money(Math.min(opening + interest, scheduled));
      const principalPaid = money(Math.max(0, scheduledPayment - interest));
      const extraPayment = money(Math.min(extra, Math.max(0, opening - principalPaid)));
      const penaltyPhase = options.prepaymentFees?.find(phase => month >= phase.fromMonth && (phase.toMonth == null || month <= phase.toMonth));
      const penaltyRate = penaltyPhase ? number(penaltyPhase.pct, "penalización de la etapa", 0, 30) / 100 : month <= penaltyUntil ? penalty : 0;
      const prepaymentFee = money(extraPayment * penaltyRate);
      const lifeInsurance = money(opening * lifePct);
      balance = money(Math.max(0, opening - principalPaid - extraPayment));
      if (month === term && balance <= 1) {
        // Close only a cent-level residual introduced by monthly rounding.
        rows.push({
          month, annualPct: rate, opening, interest,
          principalPaid: money(principalPaid + balance),
          payment: money(scheduledPayment + extraPayment + balance),
          extraPayment, balance: 0, lifeInsurance, propertyInsurance, prepaymentFee,
          total: money(scheduledPayment + extraPayment + balance + lifeInsurance + propertyInsurance + prepaymentFee)
        });
        balance = 0;
      } else {
        rows.push({
          month, annualPct: rate, opening, interest, principalPaid,
          payment: money(scheduledPayment + extraPayment), extraPayment, balance,
          lifeInsurance, propertyInsurance, prepaymentFee,
          total: money(scheduledPayment + extraPayment + lifeInsurance + propertyInsurance + prepaymentFee)
        });
      }
      totalInterest += interest;
      totalInsurance += lifeInsurance + propertyInsurance;
      totalPenalty += prepaymentFee;
      totalPayments += rows.at(-1).total;
    }
    return {
      rows, months: rows.length, remainingBalance: balance,
      firstPayment: rows[0]?.total ?? 0,
      maxPayment: rows.length ? Math.max(...rows.map(row => row.total)) : 0,
      totalInterest: money(totalInterest),
      totalInsurance: money(totalInsurance),
      totalPenalty: money(totalPenalty),
      totalPayments: money(totalPayments)
    };
  }

  function depositMaturity(options) {
    const principal = number(options.principal, "depósito", 0);
    const days = integer(options.days, "días", 1, 3660);
    const basis = number(options.dayBasis ?? 360, "base de días", 360, 365);
    const rate = number(options.annualPct, "tasa del depósito", 0, 100) / 100;
    const tax = number(options.taxPct ?? 0, "retención", 0, 100) / 100;
    const interest = options.rateBasis === "effective"
      ? principal * Math.expm1(Math.log1p(rate) * days / 365)
      : principal * rate * days / basis;
    const withholding = interest * tax;
    const netInterest = interest - withholding;
    const annualNetPct = principal > 0
      ? Math.expm1(Math.log1p(netInterest / principal) * 365 / days) * 100 : 0;
    return {
      grossInterest: money(interest), tax: money(withholding), netInterest: money(netInterest),
      finalBalance: money(principal + netInterest), annualNetPct
    };
  }

  function historySummary(history) {
    const calendar = history.filter(row => row.measure === "calendar-year" && /^\d{4}$/.test(row.period));
    const years = [...new Set(calendar.map(row => row.period))].sort();
    const duplicates = years.some(year => calendar.filter(row => row.period === year).length !== 1);
    const bases = new Set(calendar.map(row => row.returnBasis));
    const consecutive = years.every((year, index) => !index || Number(year) === Number(years[index - 1]) + 1);
    if (years.length < 3 || duplicates || bases.size !== 1 || bases.has("unknown") || !consecutive) {
      return {usable: false, years: years.length, reason: "Se necesitan al menos tres años calendario consecutivos, no duplicados y de la misma base."};
    }
    let logGrowth = 0;
    for (const row of calendar) {
      const value = number(row.valuePct, "rendimiento histórico", -100, 1000);
      if (value === -100) return {usable: true, years: years.length, cagrPct: -100, returnBasis: calendar[0].returnBasis};
      logGrowth += Math.log1p(value / 100);
    }
    return {
      usable: true, years: years.length, cagrPct: Math.expm1(logGrowth / years.length) * 100,
      firstYear: years[0], lastYear: years.at(-1), returnBasis: calendar[0].returnBasis
    };
  }

  function investment(options) {
    const initial = number(options.initial, "aporte inicial");
    const contribution = number(options.monthlyContribution ?? 0, "aporte mensual");
    const months = integer(options.months, "horizonte en meses", 1, 720);
    const growth = monthlyEffective(options.annualReturnPct);
    const inflation = monthlyEffective(options.inflationPct ?? 0);
    const annualFee = options.returnIncludesFees ? 0 : number(options.annualFeePct ?? 0, "comisión anual", 0, 30) / 1200;
    const performanceRate = options.returnIncludesFees ? 0 : number(options.performanceFeePct ?? 0, "comisión sobre rendimiento", 0, 100) / 100;
    const contributionFee = number(options.contributionFeePct ?? 0, "comisión sobre aporte", 0, 100) / 100;
    const transferFee = number(options.transferFixed ?? 0, "costo por envío");
    const transferBaseFixed = number(options.transferBaseFixed ?? 0, "cargo bancario dentro de los límites");
    const transferPct = number(options.transferPct ?? 0, "comisión porcentual de envío", 0, 100) / 100;
    const transferMinimum = number(options.transferMinimum ?? 0, "mínimo por envío");
    const transferMaximum = options.transferMaximum == null || options.transferMaximum === 0
      ? Infinity : number(options.transferMaximum, "máximo por envío", transferMinimum);
    const tradeFee = number(options.tradeFixed ?? 0, "costo por compra");
    const monthlyFixed = number(options.monthlyFixed ?? 0, "mantenimiento mensual");
    const fxSpread = number(options.fxSpreadPct ?? 0, "costo cambiario", 0, 100) / 100;
    const exitFee = number(options.exitFixed ?? 0, "retiro final");
    const exitPct = number(options.exitPct ?? 0, "costo porcentual al salir", 0, 100) / 100;
    const cadence = integer(options.contributionEveryMonths ?? 1, "frecuencia de envíos", 1, 12);
    const taxPct = number(options.taxPct ?? 0, "impuesto", 0, 100) / 100;
    const taxMode = options.taxMode || "annual-gain";
    if (!["annual-gain", "monthly-gain", "exit-gain", "dividends", "none"].includes(taxMode)) throw new RangeError("Tratamiento tributario no reconocido.");
    const dividendYield = number(options.dividendYieldPct ?? 0, "dividendos supuestos", 0, 100) / 1200;
    let costs = 0;
    let taxes = 0;
    let investedBasis = 0;
    let yearGain = 0;
    let cash = 0;
    let contributed = initial;
    const warnings = [];
    const investCash = amount => {
      if (amount <= 0) return 0;
      const bankCommission = Math.min(transferMaximum, Math.max(transferMinimum, amount * transferPct + transferBaseFixed));
      const fees = transferFee + bankCommission + tradeFee + amount * (contributionFee + fxSpread);
      if (fees >= amount) {
        warnings.push("Un envío no cubre sus costos: ese aporte permanece en efectivo; agrupa los envíos.");
        return null;
      }
      costs += fees;
      const net = amount - fees;
      investedBasis += net;
      return net;
    };
    const starting = investCash(initial);
    let balance = starting ?? 0;
    if (starting === null) cash = initial;
    const rows = [{month: 0, balance: money(balance + cash), contributions: initial, costs: money(costs), taxes: 0}];
    for (let month = 1; month <= months; month += 1) {
      const profit = balance * growth;
      balance += profit;
      const fee = Math.min(Math.max(0, balance), Math.max(0, balance) * annualFee + monthlyFixed + Math.max(0, profit) * performanceRate);
      balance -= fee;
      costs += fee;
      yearGain += profit - fee;
      if (taxMode === "monthly-gain") {
        const withheld = Math.min(balance, Math.max(0, profit) * taxPct);
        balance -= withheld;
        taxes += withheld;
      }
      if (taxMode === "dividends") {
        const dividendTax = Math.min(balance, Math.max(0, balance) * dividendYield * taxPct);
        balance -= dividendTax;
        taxes += dividendTax;
      }
      if (taxMode === "annual-gain" && (month % 12 === 0 || month === months)) {
        const withheld = Math.min(balance, Math.max(0, yearGain) * taxPct);
        balance -= withheld;
        taxes += withheld;
        yearGain = 0;
      }
      cash += contribution;
      contributed += contribution;
      if (month % cadence === 0 || month === months) {
        const added = investCash(cash);
        if (added !== null) {
          balance += added;
          cash = 0;
        }
      }
      if (month % 12 === 0 || month === months) {
        rows.push({month, balance: money(balance + cash), contributions: money(contributed), costs: money(costs), taxes: money(taxes)});
      }
    }
    if (taxMode === "exit-gain") {
      const withheld = Math.max(0, balance - investedBasis) * taxPct;
      balance -= withheld;
      taxes += withheld;
    }
    const exitCharged = Math.min(balance + cash, exitFee + Math.max(0, balance + cash) * exitPct);
    const final = Math.max(0, balance + cash - exitCharged);
    costs += exitCharged;
    rows[rows.length - 1] = {
      month: months, balance: money(final), contributions: money(contributed),
      costs: money(costs), taxes: money(taxes)
    };
    return {
      rows, finalBalance: money(final), contributions: money(contributed),
      gain: money(final - contributed), costs: money(costs), taxes: money(taxes),
      realBalance: money(final / (1 + inflation) ** months),
      cashNotInvested: money(cash), warnings: [...new Set(warnings)]
    };
  }

  function compareHousing(options) {
    const price = number(options.price, "precio de vivienda", 1);
    const savings = number(options.savings, "ahorro inicial");
    const budget = number(options.monthlyBudget, "presupuesto mensual", 1);
    const rent = number(options.rent, "alquiler mensual", 0);
    const months = integer(options.months, "horizonte de comparación", 12, 480);
    const downPct = number(options.downPct, "prima al comprar ahora", 1, 100) / 100;
    const targetPct = number(options.targetDownPct, "prima objetivo al esperar", 1, 100) / 100;
    const homeGrowth = monthlyEffective(options.homeGrowthPct);
    const rentGrowth = monthlyEffective(options.rentGrowthPct);
    const savingsGrowth = monthlyEffective(options.savingsReturnPct);
    const budgetGrowth = monthlyEffective(options.budgetGrowthPct ?? 0);
    const maintenance = number(options.maintenanceAnnualPct, "mantenimiento anual", 0, 20) / 1200;
    const propertyTax = number(options.propertyTaxAnnualPct, "impuesto anual del inmueble", 0, 10) / 1200;
    const propertyInsurance = number(options.loan.propertyAnnualPct, "seguro de inmueble", 0, 20) / 1200;
    const hoa = number(options.hoa ?? 0, "cuota de condominio");
    const saleCost = number(options.saleCostPct, "costo de vender", 0, 20) / 100;
    const scenarios = [];
    for (const strategy of ["buy-now", "save-then-buy", "rent"]) {
      let cash = savings;
      let own = false;
      let buyMonth = null;
      let loanRows = [];
      let principal = 0;
      let unfunded = 0;
      let spent = 0;
      let initialShortfall = 0;
      const rows = [];
      for (let month = 0; month <= months; month += 1) {
        const marketPrice = price * (1 + homeGrowth) ** month;
        if (month > 0) {
          const available = budget * (1 + budgetGrowth) ** (month - 1);
          const rentCost = rent * (1 + rentGrowth) ** (month - 1);
          const row = own ? loanRows[month - buyMonth - 1] : null;
          if (row) principal = row.balance;
          const insuredValue = price * (1 + homeGrowth) ** (month - 1);
          const ownerCost = (row ? row.payment + row.lifeInsurance + row.prepaymentFee : 0)
            + insuredValue * (maintenance + propertyTax + propertyInsurance) + hoa;
          const housingCost = own ? ownerCost : rentCost;
          spent += housingCost;
          cash = cash * (1 + savingsGrowth) + available - housingCost;
          if (cash < 0) {
            unfunded -= cash;
            cash = 0;
          }
        }
        if (!own && strategy !== "rent") {
          const ratio = strategy === "buy-now" ? downPct : targetPct;
          const quote = closingCosts({
            ...options.closing, price: marketPrice, downPayment: marketPrice * ratio
          });
          if (month === 0 && strategy === "buy-now" && quote.cashRequired > cash) {
            initialShortfall = quote.cashRequired - cash;
          }
          const mayBuy = strategy === "save-then-buy" || month === 0;
          if (mayBuy && cash + 0.005 >= quote.cashRequired) {
            own = true;
            buyMonth = month;
            cash -= quote.cashRequired;
            principal = quote.principal;
            spent += quote.cashRequired;
            loanRows = mortgage({
              ...options.loan, principal, propertyValue: marketPrice, extraMonthly: 0
            }).rows;
          }
        }
        if (month % 12 === 0 || month === months) {
          const equity = own ? marketPrice * (1 - saleCost) - principal : 0;
          rows.push({month, liquid: money(cash), equity: money(equity), netWorth: money(cash + equity - unfunded)});
        }
      }
      const last = rows.at(-1);
      scenarios.push({
        strategy, buyMonth, feasible: initialShortfall === 0 && unfunded < 0.01,
        initialShortfall: money(initialShortfall), unfunded: money(unfunded),
        liquid: last.liquid, equity: last.equity, netWorth: last.netWorth,
        housingOutflows: money(spent), rows
      });
    }
    return scenarios;
  }

  return {number, integer, money, monthlyEffective, payment, phaseRate, closingCosts, mortgage, depositMaturity, historySummary, investment, compareHousing};
});
