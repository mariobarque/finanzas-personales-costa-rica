(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const F = globalThis.Finanzas;
  const data = globalThis.MERCADO;
  const categories = {
    savings: "Cuentas de ahorro", "term-deposit": "Depósitos a plazo",
    "pension-mandatory": "Pensión obligatoria", "pension-voluntary": "Pensión voluntaria",
    "money-market": "Mercado de dinero", "income-fund": "Fondos de ingreso / deuda",
    "equity-fund": "Fondos accionarios", "real-estate-fund": "Fondos inmobiliarios",
    "development-fund": "Desarrollo de proyectos", "other-fund": "Otros fondos", broker: "Bróker internacional"
  };
  const institutionTypes = {
    bank: "Banco", finance: "Financiera", mutual: "Mutual", cooperative: "Cooperativa",
    pension: "Operadora de pensiones", safi: "Administradora de fondos",
    broker: "Intermediario internacional", exchange: "Bolsa de valores",
    public: "Institución pública", other: "Otra entidad"
  };
  const statusLabels = {
    published: "Condiciones publicadas", "starting-from": "Tasa desde",
    "quote-required": "Necesita cotización", "registered-no-public-terms": "Registro sin términos completos",
    historical: "Oferta histórica", inactive: "Inactivo",
    verified: "Contenido consultado", blocked: "Acceso bloqueado", unavailable: "No disponible"
  };
  const basisLabels = {
    gross: "bruto", "net-of-fees": "neto de administración", "net-of-tax": "neto de retención",
    "net-of-fees-and-tax": "neto de administración e impuestos", unknown: "base no confirmada"
  };
  const measureLabels = {
    "calendar-year": "Año calendario", "trailing-12-month": "Últimos 12 meses",
    "annualized-period": "Periodo anualizado", "year-to-date": "Acumulado del año", "quoted-rate": "Tasa cotizada"
  };
  const feeLabels = {
    "annual-assets-pct": "% anual del patrimonio", "contribution-pct": "% sobre aporte",
    "transaction-fixed": "por transacción", "transaction-pct": "% de transacción",
    "exit-fixed": "al retirar", "transfer-fixed": "por transferencia", "transfer-pct": "% del envío",
    "performance-pct": "% de resultados", other: "ver condiciones"
  };
  const feeStatuses = {
    "published-current": "Tarifa publicada", "published-maximum": "Máximo del documento",
    estimated: "Estimación", "quote-required": "Cotizar"
  };
  let latestMortgage = null;
  let selectedInvestment = null;
  let page = 0;
  let previousCurrency = "CRC";
  const pageSize = 9;
  const today = new Date().toISOString().slice(0, 10);
  const money = (value, currency = "CRC") => currency === "MULTI"
    ? `${new Intl.NumberFormat("es-CR", {maximumFractionDigits: 2}).format(value)} (moneda por confirmar)`
    : new Intl.NumberFormat("es-CR", {
    style: "currency", currency: currency === "MULTI" ? "USD" : currency,
    maximumFractionDigits: currency === "CRC" ? 0 : 2
  }).format(value);
  const pct = value => new Intl.NumberFormat("es-CR", {maximumFractionDigits: 3}).format(value) + " %";
  const plain = value => new Intl.NumberFormat("es-CR", {maximumFractionDigits: 2}).format(value);
  const normalize = value => String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/\bs\s*&?\s*p\s*500\b/g, "sp500");
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function option(value, text) {
    const node = element("option", text);
    node.value = value;
    return node;
  }
  function setValue(id, value) { $(id).value = value == null ? "" : value; }
  function input(id) { return F.number($(id).value, $(id).closest("label")?.childNodes[0]?.textContent?.trim() || id, -1e15); }
  function validForm(id) {
    const form = $(id);
    for (const control of form.elements) {
      if (control.willValidate && !control.checkValidity()) {
        let parent = control.parentElement;
        while (parent && parent !== form) {
          if (parent.tagName === "DETAILS") parent.open = true;
          parent = parent.parentElement;
        }
        control.reportValidity();
        return false;
      }
    }
    return true;
  }
  function error(id, message) {
    $(id).textContent = message || "";
    $(id).hidden = !message;
  }
  function table(headers, rows, numeric = []) {
    const wrap = element("div", null, "table-wrap");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", headers.join(", "));
    const node = element("table");
    const head = element("thead");
    const header = element("tr");
    for (const title of headers) {
      const th = element("th", title);
      th.scope = "col";
      header.append(th);
    }
    head.append(header);
    const body = element("tbody");
    for (const cells of rows) {
      const row = element("tr");
      cells.forEach((value, index) => {
        const cell = element("td", null, numeric.includes(index) ? "numeric" : "");
        if (value instanceof Node) cell.append(value);
        else cell.textContent = value == null ? "No publicado" : String(value);
        row.append(cell);
      });
      body.append(row);
    }
    node.append(head, body);
    wrap.append(node);
    return wrap;
  }
  function list(items) {
    const ul = element("ul");
    for (const item of items || []) ul.append(element("li", item));
    return ul;
  }
  function tag(label, style = "") { return element("span", label, `tag ${style}`); }
  function kpis(items) {
    const grid = element("div", null, "kpi-grid");
    for (const [label, value, note] of items) {
      const card = element("div", null, "kpi");
      card.append(element("span", label, "kpi-label"), element("strong", value));
      if (note) card.append(element("small", note));
      grid.append(card);
    }
    return grid;
  }
  function download(name, text, type = "text/csv;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([text], {type}));
    const anchor = element("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function sourceLink(source, label) {
    if (!source) return element("span", "Fuente no identificada");
    const url = new URL(source.url);
    if (!["https:", "http:"].includes(url.protocol)) return element("span", source.title);
    const link = element("a", label || source.title);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = `${source.title} · consulta ${source.accessedOn}`;
    return link;
  }
  function chart(target, series, currency, description) {
    target.replaceChildren();
    const points = series.flatMap(item => item.points);
    if (!points.length) {
      target.append(element("p", "No hay saldo financiado que representar.", "help"));
      return;
    }
    const ns = "http://www.w3.org/2000/svg";
    const svgNode = (name, attrs = {}) => {
      const node = document.createElementNS(ns, name);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      return node;
    };
    const svg = svgNode("svg", {viewBox: "0 0 640 300", role: "img", "aria-label": description});
    const title = svgNode("title");
    title.textContent = description;
    svg.append(title);
    const maxX = Math.max(1, ...points.map(point => point[0]));
    const minY = Math.min(0, ...points.map(point => point[1]));
    const maxY = Math.max(1, ...points.map(point => point[1]));
    const x = value => 85 + value / maxX * 530;
    const y = value => 245 - (value - minY) / (maxY - minY) * 220;
    const compact = new Intl.NumberFormat("es-CR", {notation: "compact", maximumFractionDigits: 1});
    for (let i = 0; i <= 4; i += 1) {
      const value = minY + (maxY - minY) * i / 4;
      svg.append(svgNode("line", {x1: 85, x2: 615, y1: y(value), y2: y(value), stroke: "#dce1d7"}));
      const label = svgNode("text", {x: 76, y: y(value) + 4, "text-anchor": "end", fill: "#59665d", "font-size": 12});
      label.textContent = compact.format(value);
      svg.append(label);
    }
    for (let i = 0; i <= 4; i += 1) {
      const month = maxX * i / 4;
      const label = svgNode("text", {x: x(month), y: 272, "text-anchor": "middle", fill: "#59665d", "font-size": 12});
      label.textContent = `${plain(month / 12)} a.`;
      svg.append(label);
    }
    const colors = ["#24543f", "#b17b31", "#667a95"];
    const legend = element("div", null, "chart-legend");
    series.forEach((item, index) => {
      const color = colors[index % colors.length];
      svg.append(svgNode("polyline", {points: item.points.map(point => `${x(point[0])},${y(point[1])}`).join(" "), fill: "none", stroke: color, "stroke-width": 3, "stroke-linejoin": "round"}));
      const label = element("span", item.name);
      const dot = element("span", null, "legend-dot");
      dot.style.backgroundColor = color;
      label.prepend(dot);
      legend.append(label);
    });
    target.append(svg, legend, element("p", `Importes en ${currency}. Eje horizontal: años.`, "help"));
  }

  function route() {
    const wanted = location.hash.slice(1) || "inicio";
    const id = ["inicio", "hipoteca", "alquilar", "inversiones", "fuentes"].includes(wanted) ? wanted : "inicio";
    for (const section of document.querySelectorAll("[data-view]")) section.hidden = section.id !== id;
    for (const link of document.querySelectorAll(".header-inner nav a")) {
      if (link.hash === `#${id}`) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    document.title = `${$(id).querySelector("h1").textContent} · El método aburrido`;
    if (id === "alquilar" && data) updateRentSummary();
  }
  addEventListener("hashchange", () => {
    route();
    const heading = document.querySelector("[data-view]:not([hidden]) h1");
    heading?.focus({preventScroll: true});
    scrollTo(0, 0);
  });
  document.querySelector(".skip").addEventListener("click", event => {
    event.preventDefault();
    $("contenido").focus({preventScroll: true});
    $("contenido").scrollIntoView({block: "start"});
  });
  route();
  if (!data || !F) {
    $("data-error").hidden = false;
    $("data-error").textContent = "No se pudo cargar el catálogo local. Conserva juntas todas las carpetas del sitio; el libro sigue disponible. El catálogo se genera con npm run datos.";
    for (const control of document.querySelectorAll("form button, form input, form select")) control.disabled = true;
    return;
  }
  const institutions = new Map(data.institutions.map(item => [item.id, item]));
  const sources = new Map(data.sources.map(item => [item.id, item]));
  const benchmarks = new Map((data.benchmarks || []).map(item => [item.id.toUpperCase(), item]));
  const institutionName = id => institutions.get(id)?.name || id;
  function sourceLinks(ids) {
    const box = element("div", null, "source-links");
    for (const id of [...new Set(ids || [])]) box.append(sourceLink(sources.get(id), sources.get(id)?.title || id));
    return box;
  }
  function isCurrent(offer) {
    return offer.status !== "historical" && (!offer.validUntil || offer.validUntil >= today);
  }
  function product() { return data.mortgages.find(item => item.id === $("m-product").value); }
  function currency() { return $("m-currency").value; }
  function investmentsCurrency(item = selectedInvestment) { return !item || item.category === "broker" && item.currency === "MULTI" ? "USD" : item.currency; }
  function setMortgageProducts() {
    const options = data.mortgages.filter(item => item.currency === currency() && isCurrent(item));
    const readiness = offer => !offer.rates.length ? 3 : offer.requiresPriorSavings ? 2 : offer.rates.some(rate => rate.kind === "indexed" && benchmarks.get(rate.benchmark.toUpperCase())?.value == null) ? 1 : 0;
    options.sort((a, b) => readiness(a) - readiness(b) || institutionName(a.institutionId).localeCompare(institutionName(b.institutionId), "es"));
    $("m-product").replaceChildren(...options.map(item => option(item.id, `${institutionName(item.institutionId)} · ${item.name}${!item.rates.length ? " · cotizar" : ""}`)));
    if (!options.length) $("m-product").append(option("", "No hay ofertas documentadas de esta moneda"));
    configureMortgage();
  }
  function setCostField(id, published, fallback, noteId) {
    setValue(id, published ?? fallback);
    if (noteId) $(noteId).textContent = published == null ? "Supuesto editable; tarifa no confirmada para esta oferta." : "Dato publicado; revisa sus condiciones y la fuente de la oferta.";
  }
  function configureMortgage() {
    const offer = product();
    latestMortgage = null;
    $("m-results").hidden = true;
    $("m-empty").hidden = false;
    $("m-rate-summary").replaceChildren();
    $("m-benchmarks").replaceChildren();
    $("m-product-detail").replaceChildren();
    if (!offer) return;
    const selected = currency();
    if (offer.maxTermMonths && input("m-years") * 12 > offer.maxTermMonths) setValue("m-years", Math.floor(offer.maxTermMonths / 12));
    if (offer.allowedTermsMonths?.length && !offer.allowedTermsMonths.includes(input("m-years") * 12)) setValue("m-years", offer.allowedTermsMonths[0] / 12);
    if (offer.minTermMonths && input("m-years") * 12 < offer.minTermMonths) setValue("m-years", Math.ceil(offer.minTermMonths / 12));
    setCostField("m-opening", offer.originationFeePct, 1.5, "m-opening-note");
    setCostField("m-min-opening", offer.minimumOriginationFee, 0);
    setCostField("m-appraisal", offer.appraisalFixed, selected === "CRC" ? 100000 : 200, "m-appraisal-note");
    setCostField("m-life", offer.lifeInsuranceAnnualPct, 0.36, "m-life-note");
    setCostField("m-property-ins", offer.propertyInsuranceAnnualPct, 0.2, "m-property-ins-note");
    setCostField("m-prepay", offer.prepaymentFeePct, 0);
    setCostField("m-prepay-until", offer.prepaymentFeeUntilMonth, offer.prepaymentFeePct ? offer.maxTermMonths || 360 : 0);
    $("m-prior-savings-label").hidden = !offer.requiresPriorSavings;
    $("m-prior-savings").checked = false;
    $("m-prepay-public-label").hidden = !offer.prepaymentFees?.length;
    $("m-prepay-public").checked = Boolean(offer.prepaymentFees?.length);
    $("m-prepay-summary").textContent = (offer.prepaymentFees || []).map(phase => `Mes ${phase.fromMonth}–${phase.toMonth ?? "final"}: ${pct(phase.pct)} sobre el abono.`).join(" ");
    updatePrepayment();
    for (const phase of offer.rates) {
      const rateText = phase.kind === "fixed" ? pct(phase.annualPct) : `${phase.benchmark} + ${pct(phase.spreadPct)}`;
      const floor = phase.floorPct == null ? "" : ` · piso ${pct(phase.floorPct)}`;
      const cap = phase.capPct == null ? "" : ` · techo ${pct(phase.capPct)}`;
      $("m-rate-summary").append(element("p", `Mes ${phase.fromMonth}–${phase.toMonth ?? "final"}: ${rateText}${floor}${cap}`));
    }
    if (!offer.rates.length) $("m-rate-summary").append(element("p", "La institución no tiene una tasa completa verificable en este catálogo. Necesitas ingresar tu cotización.", "notice warning"));
    if (offer.advertisedAnnualPct != null) $("m-rate-summary").append(element("p", `Tasa anunciada: ${pct(offer.advertisedAnnualPct)}. No se extiende a todo el plazo: faltan condiciones para modelar sus fases.`, "notice warning"));
    if (offer.requiresPriorSavings) $("m-rate-summary").append(element("p", `Antes del crédito se exige un plan de ahorro de ${offer.requiredSavingsMonths} meses. Esta calculadora no incluye el costo ni el tiempo de esa etapa.`, "notice warning"));
    const keys = [...new Set(offer.rates.filter(rate => rate.kind === "indexed").map(rate => rate.benchmark.toUpperCase()))];
    for (const key of keys) {
      const observation = benchmarks.get(key);
      const label = element("label", `${key} asumida para la proyección (%)`);
      const field = element("input");
      field.type = "number"; field.min = "-10"; field.max = "100"; field.step = "0.001";
      field.dataset.benchmark = key; field.required = true;
      field.value = observation?.value ?? "";
      label.append(field, element("small", observation?.value != null
        ? `Observación ${observation.observedOn || "sin fecha de valor"}; se mantiene constante en este escenario.`
        : "Sin observación verificable: ingresa una referencia de tu cotización. No se usa un promedio inventado."));
      $("m-benchmarks").append(label);
    }
    $("m-manual").checked = !offer.rates.length;
    setValue("m-rate", "");
    updateManual();
    const detail = $("m-product-detail");
    detail.append(element("p", institutionName(offer.institutionId), "eyebrow"), element("h2", offer.name));
    const tags = element("div", null, "tags");
    tags.append(tag(statusLabels[offer.status], offer.status === "published" ? "" : "warning"));
    if (offer.maxLtv != null) tags.append(tag(`Hasta ${pct(offer.maxLtv * 100)} del valor`));
    if (offer.maxTermMonths) tags.append(tag(`Hasta ${plain(offer.maxTermMonths / 12)} años`));
    detail.append(tags);
    if (offer.minLoan != null) detail.append(element("p", `Monto mínimo: ${money(offer.minLoan, selected)}.`));
    if (offer.maxLoan != null) detail.append(element("p", `Monto máximo: ${money(offer.maxLoan, selected)}.`));
    detail.append(element("h3", "Requisitos y condiciones"), list(offer.requirements));
    if (offer.notes.length) detail.append(list(offer.notes));
    detail.append(element("p", `Revisión: ${offer.reviewedOn}. El precio «desde» o publicado no garantiza la tasa de tu perfil.`, "help"), sourceLinks(offer.sourceIds));
    updateRentSummary();
  }
  function updateManual() {
    const manual = $("m-manual").checked;
    $("m-manual-label").hidden = !manual;
    $("m-rate").disabled = !manual;
    $("m-rate").required = manual;
    for (const field of $("m-benchmarks").querySelectorAll("input")) field.disabled = manual;
  }
  function updatePrepayment() {
    const usePublic = $("m-prepay-public").checked;
    $("m-prepay").disabled = usePublic;
    $("m-prepay-until").disabled = usePublic;
  }
  function mortgageOptions(offer = product(), compare = false) {
    if (!offer) throw new RangeError("Selecciona una oferta documentada.");
    if (offer.requiresPriorSavings && (offer.id !== product()?.id || !$("m-prior-savings").checked)) throw new RangeError("El plan exige ahorro previo cumplido; selecciona su ficha y confirma el alcance de la simulación.");
    const reference = Object.fromEntries([...benchmarks].filter(([, value]) => value.value != null).map(([key, value]) => [key, value.value]));
    for (const field of $("m-benchmarks").querySelectorAll("input")) {
      if (!field.disabled && field.value !== "") reference[field.dataset.benchmark] = F.number(field.value, field.dataset.benchmark, -10, 100);
    }
    const manual = !compare && $("m-manual").checked;
    const rates = manual ? [{fromMonth: 1, toMonth: null, kind: "fixed", annualPct: input("m-rate")}] : offer.rates;
    const publishedOrInput = (key, id) => compare && offer[key] != null ? offer[key] : input(id);
    const closing = {
      price: input("m-price"), downPayment: input("m-down"), legalPct: input("m-legal"),
      appraisal: publishedOrInput("appraisalFixed", "m-appraisal"),
      originationPct: publishedOrInput("originationFeePct", "m-opening"),
      minimumOriginationFee: publishedOrInput("minimumOriginationFee", "m-min-opening"),
      financeClosing: $("m-finance-closing").checked
    };
    const quote = F.closingCosts(closing);
    const loan = {
      principal: quote.principal, propertyValue: closing.price, months: input("m-years") * 12,
      rates, benchmarks: reference, extraMonthly: input("m-extra"),
      lifeAnnualPct: publishedOrInput("lifeInsuranceAnnualPct", "m-life"),
      propertyAnnualPct: publishedOrInput("propertyInsuranceAnnualPct", "m-property-ins"),
      prepaymentFeePct: publishedOrInput("prepaymentFeePct", "m-prepay"),
      prepaymentFeeUntilMonth: publishedOrInput("prepaymentFeeUntilMonth", "m-prepay-until")
    };
    if (offer.prepaymentFees?.length && (compare || $("m-prepay-public").checked)) {
      loan.prepaymentFees = offer.prepaymentFees;
      loan.prepaymentFeePct = 0;
      loan.prepaymentFeeUntilMonth = 0;
    }
    if (offer.allowedTermsMonths?.length && !offer.allowedTermsMonths.includes(loan.months)) throw new RangeError(`El plan admite únicamente estos plazos en años: ${offer.allowedTermsMonths.map(value => value / 12).join(", ")}.`);
    if (offer.minTermMonths && loan.months < offer.minTermMonths) throw new RangeError("El plazo es menor que el mínimo publicado.");
    if (compare && offer.maxTermMonths && loan.months > offer.maxTermMonths) throw new RangeError("Plazo mayor que el máximo publicado.");
    return {offer, quote, loan, closing, manual, currency: currency()};
  }
  function mortgageWarnings(model, result) {
    const {offer, quote, loan} = model;
    const warnings = [];
    if (model.manual) warnings.push("La tasa es personal: no es una oferta pública verificada ni se modelan cambios posteriores.");
    if (offer.status === "starting-from") warnings.push("La tasa es «desde». La entidad puede ofrecer otra según tu perfil.");
    if (offer.maxLtv != null && quote.ltv > offer.maxLtv + 0.00001) warnings.push("El monto financiado supera la proporción máxima publicada: necesitas más prima o una cotización distinta.");
    if (offer.minLoan != null && quote.principal < offer.minLoan && quote.principal > 0) warnings.push("El crédito queda por debajo del monto mínimo publicado.");
    if (offer.maxLoan != null && quote.principal > offer.maxLoan) warnings.push("El crédito supera el monto máximo publicado.");
    if (offer.maxTermMonths && loan.months > offer.maxTermMonths) warnings.push("El plazo elegido supera el máximo publicado; este escenario no corresponde a esa oferta.");
    if (offer.prepaymentFeePct == null && !loan.prepaymentFees?.length && loan.extraMonthly > 0) warnings.push("No se confirmó la penalización de abonos extraordinarios. Una tarifa no incluida puede cambiar el resultado.");
    if (loan.prepaymentFees?.length && result.rows.some(row => row.extraPayment > 0 && !loan.prepaymentFees.some(phase => row.month >= phase.fromMonth && (phase.toMonth == null || row.month <= phase.toMonth)))) warnings.push("Hay abonos fuera de las etapas de penalización recuperadas. En esos meses no se incluyó comisión; debes confirmar el tratamiento con el banco.");
    if (offer.requiresPriorSavings) warnings.push("Solo se está calculando la etapa de préstamo. Las cuotas y el tiempo del ahorro previo no están incluidos.");
    if (result.remainingBalance > 1) warnings.push("Queda saldo al final del plazo. Revisa tasas y condiciones.");
    if (["originationFeePct", "appraisalFixed", "lifeInsuranceAnnualPct", "propertyInsuranceAnnualPct"].some(key => offer[key] == null)) warnings.push("Parte del cierre o de los seguros usa supuestos editables, no tarifas confirmadas.");
    if (offer.rates.some(rate => rate.kind === "indexed")) warnings.push("Las referencias futuras se mantienen constantes. El escenario de riesgo sube las referencias, no modifica una fase fija contratada.");
    return warnings;
  }
  function calculateMortgage(event) {
    event?.preventDefault();
    error("m-error");
    if (!validForm("m-form")) return;
    try {
      const model = mortgageOptions();
      const result = F.mortgage(model.loan);
      const extraCosts = model.closing.price * (input("m-property-tax") + input("m-maintenance")) / 1200 + input("m-hoa");
      const stressBench = Object.fromEntries(Object.entries(model.loan.benchmarks).map(([key, value]) => [key, value + input("m-stress")]));
      const stressed = F.mortgage({...model.loan, benchmarks: stressBench});
      const fx = input("m-fx");
      const incomeCurrency = $("m-income-currency").value;
      const conversion = currency() === incomeCurrency ? 1 : currency() === "USD" ? fx : 1 / fx;
      const monthlyHome = result.firstPayment + extraCosts;
      const totalBurden = monthlyHome * conversion + input("m-other-debt");
      const income = input("m-income");
      const ratio = income > 0 ? totalBurden / income * 100 : null;
      latestMortgage = {model, result};
      $("m-empty").hidden = true; $("m-results").hidden = false;
      $("m-scenario-label").textContent = model.manual
        ? "Escenario con tu tasa personal. Los costos y requisitos de la ficha no convierten esa tasa en oferta del banco."
        : `Estimación con ${model.offer.name}. Revisión ${model.offer.reviewedOn}; referencias futuras y costos no publicados son supuestos.`;
      $("m-kpis").replaceChildren(...kpis([
        ["Cuota inicial + seguros", money(result.firstPayment, currency()), "Capital, interés, vida e inmueble; incluye abono extra si lo ingresaste."],
        ["Efectivo necesario al inicio", money(model.quote.cashRequired, currency()), "Prima y costos no financiados."],
        ["Vivienda al mes, más completa", money(monthlyHome, currency()), "Agrega impuesto, mantenimiento y condominio."],
        ["Intereses durante el crédito", money(result.totalInterest, currency()), `${result.months} meses simulados; sin descontar inflación.`]
      ]).children);
      const first = result.rows[0];
      const breakdown = [
        ["Crédito inicial", money(model.quote.principal, currency())],
        ["Apertura", money(model.quote.origination, currency())],
        ["Traspaso, timbres y honorarios estimados", money(model.quote.legal, currency())],
        ["Avalúo", money(model.quote.appraisal, currency())],
        ["Capital + interés + extra del primer mes", money(first?.payment ?? 0, currency())],
        ["Vida del primer mes", money(first?.lifeInsurance ?? 0, currency())],
        ["Seguro del inmueble por mes", money(first?.propertyInsurance ?? 0, currency())],
        ["Impuesto, mantenimiento y condominio por mes", money(extraCosts, currency())],
        ["Mayor cuota bancaria del escenario base", money(result.maxPayment, currency())],
        [`Mayor cuota con referencias +${plain(input("m-stress"))} puntos`, money(stressed.maxPayment, currency())],
        ["Total pagado al crédito, seguros y penalización", money(result.totalPayments, currency())],
        ["Seguros durante el crédito", money(result.totalInsurance, currency())]
      ];
      if (currency() === "USD") breakdown.push([`Primera cuota en CRC si el dólar sube ${pct(input("m-fx-stress"))}`, money(result.firstPayment * fx * (1 + input("m-fx-stress") / 100), "CRC")]);
      $("m-breakdown").replaceChildren(table(["Concepto", `Importe (${currency()})`], breakdown, [1]));
      const warnings = mortgageWarnings(model, result);
      if (ratio == null) warnings.push("Sin ingreso informado no se evalúa el presupuesto.");
      else warnings.push(`Vivienda y otras cuotas consumen aproximadamente ${pct(ratio)} del ingreso ingresado. ${ratio > input("m-budget-limit") ? "Supera" : "No supera"} tu límite personal de ${pct(input("m-budget-limit"))}; no implica aprobación bancaria.`);
      if (incomeCurrency !== currency()) warnings.push("El ingreso y la deuda están en monedas distintas. El tipo de cambio puede deteriorar el presupuesto.");
      $("m-warnings").replaceChildren(list(warnings));
      chart($("m-chart"), [{name: "Saldo del crédito", points: [[0, model.quote.principal], ...result.rows.filter(row => row.month % 12 === 0 || row.balance === 0).map(row => [row.month, row.balance])]}], currency(), "Saldo del crédito al cierre de cada año.");
      $("m-comparison").replaceChildren();
      $("m-live").textContent = `Primera cuota con seguros: ${money(result.firstPayment, currency())}. Efectivo inicial: ${money(model.quote.cashRequired, currency())}.`;
      updateRentSummary();
    } catch (problem) {
      error("m-error", problem.message);
      $("m-results").hidden = true; $("m-empty").hidden = false; latestMortgage = null;
    }
  }
  function compareOffers() {
    if (!validForm("m-form")) return;
    const rows = [];
    for (const offer of data.mortgages.filter(item => item.currency === currency() && isCurrent(item))) {
      try {
        if (!offer.rates.length) throw new RangeError("Tasa no publicada: cotizar.");
        const model = mortgageOptions(offer, true);
        const result = F.mortgage(model.loan);
        const restricted = mortgageWarnings(model, result).filter(text => /supera|debajo/.test(text));
        rows.push([`${institutionName(offer.institutionId)} · ${offer.name}`, money(result.firstPayment, currency()), money(result.maxPayment, currency()), restricted.join(" ") || "Estimación; revisar perfil y costos."]);
      } catch (problem) {
        rows.push([`${institutionName(offer.institutionId)} · ${offer.name}`, "No calculable", "—", problem.message]);
      }
    }
    $("m-comparison").replaceChildren(table(["Oferta", "Inicial + seguros", "Mayor cuota base", "Condiciones"], rows, [1, 2]));
  }
  function updateRentSummary() {
    const offer = product();
    $("r-loan-summary").textContent = offer
      ? `${institutionName(offer.institutionId)} · ${offer.name} · ${currency()} · plazo ${$("m-years").value} años. Costos y referencias tomados de Hipoteca; la prima se elige aquí.`
      : "Selecciona primero una oferta hipotecaria y sus condiciones.";
  }
  function calculateRent(event) {
    event.preventDefault();
    error("r-error");
    if (!validForm("r-form")) return;
    try {
      const model = mortgageOptions();
      if (model.offer.requiresPriorSavings) throw new RangeError("La comparación de alquiler no modela planes de ahorro contractual previo. Selecciona una línea de crédito directo; la ficha INVU permite simular por separado su etapa de préstamo.");
      const opts = {
        price: input("m-price"), savings: input("r-savings"), monthlyBudget: input("r-budget"),
        rent: input("r-rent"), months: input("r-years") * 12, downPct: input("r-down"),
        targetDownPct: input("r-target"), homeGrowthPct: input("r-home-growth"),
        rentGrowthPct: input("r-rent-growth"), savingsReturnPct: input("r-return"),
        budgetGrowthPct: input("r-budget-growth"), maintenanceAnnualPct: input("m-maintenance"),
        propertyTaxAnnualPct: input("m-property-tax"), hoa: input("m-hoa"), saleCostPct: input("r-sale-cost"),
        closing: model.closing, loan: model.loan
      };
      const scenarios = F.compareHousing(opts);
      const names = {"buy-now": "Comprar ahora", "save-then-buy": "Ahorrar una prima mayor", rent: "Seguir alquilando"};
      const results = $("r-results");
      results.classList.remove("empty");
      results.replaceChildren(element("h2", "Tres caminos, los mismos recursos"));
      results.append(table(["Camino", "Compra", "Efectivo final", "Patrimonio final neto", "Flujo"], scenarios.map(item => [
        names[item.strategy], item.buyMonth === 0 ? "Hoy" : item.buyMonth == null ? "No compra en el horizonte" : `Mes ${item.buyMonth}`,
        money(item.liquid, currency()), money(item.netWorth, currency()),
        item.initialShortfall > 0 ? `Falta prima/cierre: ${money(item.initialShortfall, currency())}` : item.unfunded > 0 ? `Faltante acumulado: ${money(item.unfunded, currency())}` : "Presupuesto cubierto bajo los supuestos"
      ]), [2, 3]));
      const graph = element("div", null, "chart");
      results.append(graph);
      chart(graph, scenarios.filter(item => item.initialShortfall === 0).map(item => ({name: names[item.strategy], points: item.rows.map(row => [row.month, row.netWorth])})), currency(), "Patrimonio neto al final de cada año bajo tres decisiones de vivienda.");
      const notes = ["No se declara un ganador universal: cambiar apreciación, tasas, alquiler o rendimiento del ahorro puede cambiar el resultado.", "El presupuesto crece según tu supuesto. Al comprar después se reutilizan las condiciones hipotecarias actuales, no una oferta garantizada para esa fecha."];
      if (model.offer.maxLtv != null && (1 - opts.downPct / 100 > model.offer.maxLtv || 1 - opts.targetDownPct / 100 > model.offer.maxLtv)) notes.push("Una de las primas queda por debajo del mínimo derivado del financiamiento máximo publicado. El escenario no acredita elegibilidad.");
      if (model.loan.months > (model.offer.maxTermMonths || 600)) notes.push("El plazo supera el máximo publicado de esta oferta.");
      results.append(list(notes));
      $("r-live").textContent = "Comparación de tres caminos calculada. Revisa los faltantes y el efectivo, no solo el patrimonio.";
    } catch (problem) { error("r-error", problem.message); }
  }

  function allFilteredInvestments() {
    const words = normalize($("i-search").value).split(/\s+/).filter(Boolean);
    return data.investments.filter(item => {
      const haystack = normalize(`${item.name} ${institutionName(item.institutionId)} ${(item.notes || []).join(" ")} ${item.registryId || ""}`);
      return item.status !== "inactive" && words.every(word => haystack.includes(word))
        && (!$("i-category").value || item.category === $("i-category").value)
        && (!$("i-currency-filter").value || item.currency === $("i-currency-filter").value)
        && (!$("i-history-only").checked || item.history.length > 0);
    });
  }
  function rateDescription(item) {
    if (item.annualRatePct != null) return `${pct(item.annualRatePct)} anual ${item.rateBasis === "unknown" ? "(base por confirmar)" : item.rateBasis === "nominal" ? "nominal" : "efectivo"} · ${basisLabels[item.returnBasis]}`;
    if (item.rateTiers?.length) return `${item.rateTiers.length} tramos o plazos publicados; el monto y el plazo importan.`;
    return item.category === "broker" ? "El bróker no tiene un rendimiento propio." : "Sin tasa contratada o pública para cargar automáticamente.";
  }
  function renderCatalog() {
    const entries = allFilteredInvestments();
    const pages = Math.max(1, Math.ceil(entries.length / pageSize));
    page = Math.min(page, pages - 1);
    $("i-count").textContent = `${entries.length} fichas y variantes de ${data.investments.filter(item => item.status !== "inactive").length} catalogadas.`;
    $("i-page").textContent = `Página ${page + 1} de ${pages}`;
    $("i-prev").disabled = page === 0; $("i-next").disabled = page === pages - 1;
    $("i-catalog").replaceChildren();
    if (!entries.length) $("i-catalog").append(element("p", "No hay coincidencias. Revisa la cobertura en Datos y fuentes; la ausencia no demuestra que el producto no exista.", "notice"));
    for (const item of entries.slice(page * pageSize, (page + 1) * pageSize)) {
      const card = element("article", null, `catalog-card${selectedInvestment?.id === item.id ? " is-selected" : ""}`);
      card.append(element("p", institutionName(item.institutionId), "institution"), element("h3", item.name));
      const tags = element("div", null, "tags");
      tags.append(tag(/\bFCL\b/i.test(item.name) ? "Ahorro laboral · FCL" : categories[item.category] || item.category), tag(item.currency === "MULTI" ? item.category === "broker" ? "Multimoneda" : "Moneda por confirmar" : item.currency), tag(statusLabels[item.status], item.status === "published" ? "" : "warning"));
      card.append(tags);
      const facts = element("div", null, "card-facts");
      facts.append(element("p", rateDescription(item)));
      facts.append(element("p", `Historia: ${item.history.length} observaciones. ${item.prospectus ? `Prospecto: ${{read: "revisado", partial: "revisión parcial", unavailable: "sin lectura verificable", "not-applicable": "no aplica"}[item.prospectus.reviewStatus]}.` : ""}`));
      card.append(facts);
      const button = element("button", item.currency === "MULTI" && item.category !== "broker" ? "Ver ficha →" : "Ver y proyectar →", "button quiet");
      button.type = "button";
      button.dataset.productId = item.id;
      button.addEventListener("click", () => selectInvestment(item));
      card.append(button);
      $("i-catalog").append(card);
    }
  }
  function preferredFees(item, kind) {
    const fees = item.fees.filter(fee => fee.kind === kind && fee.value != null && fee.status !== "quote-required");
    // Current and maximum tariffs of the same kind are alternatives, not additive fees.
    for (const status of ["published-current", "published-maximum", "estimated"]) {
      const selected = fees.filter(fee => fee.status === status);
      if (selected.length) return selected;
    }
    return [];
  }
  function feeAmount(fee, item) {
    if (fee.value == null) return "No publicado";
    const percentage = fee.kind.endsWith("-pct");
    const format = value => new Intl.NumberFormat("es-CR", {maximumFractionDigits: 8}).format(value);
    const unit = fee.currency || investmentsCurrency(item);
    const limits = [
      fee.minimum == null ? "" : `mín. ${format(fee.minimum)}${fee.currency ? ` ${fee.currency}` : ""}`,
      fee.maximum == null ? "" : `máx. ${format(fee.maximum)}${fee.currency ? ` ${fee.currency}` : ""}`
    ].filter(Boolean).join(" · ");
    return `${format(fee.value)} ${percentage ? "%" : unit} · ${feeLabels[fee.kind]}${limits ? ` · ${limits}` : ""}`;
  }
  function renderInvestmentDetail(item) {
    const root = $("i-detail");
    root.replaceChildren();
    const tags = element("div", null, "tags");
    tags.append(tag(statusLabels[item.status], item.status === "published" ? "" : "warning"), tag(`Revisión ${item.reviewedOn}`));
    if (item.registryId) tags.append(tag(item.registryId, "muted"));
    root.append(tags);
    const columns = element("div", null, "detail-grid");
    const terms = element("div");
    terms.append(element("h3", "Condiciones y liquidez"));
    terms.append(list([
      `Monto inicial mínimo: ${item.minInitial == null ? "no confirmado" : money(item.minInitial, investmentsCurrency(item))}.`,
      `Aporte mínimo: ${item.minContribution == null ? "no confirmado" : money(item.minContribution, investmentsCurrency(item))}.`,
      `Liquidez: ${item.liquidity || "no confirmada; consulta antes de aportar"}.`,
      ...(item.requirements || []), ...(item.notes || [])
    ]));
    if (item.tax?.notes) terms.append(element("p", `Impuestos: ${item.tax.notes}`));
    if (item.prospectus) {
      terms.append(element("h3", "Prospecto"));
      const status = {read: "Documento revisado", partial: "Revisión parcial", unavailable: "No se pudo verificar su contenido", "not-applicable": "No aplica"};
      terms.append(element("p", `${status[item.prospectus.reviewStatus]}. Fecha: ${item.prospectus.documentDate || "no identificada"}. ${item.prospectus.notes || ""}`));
      if (item.prospectus.sourceId) terms.append(sourceLinks([item.prospectus.sourceId]));
    }
    const risks = element("div");
    risks.append(element("h3", "Riesgos y condiciones que importan"), list(item.risks));
    risks.append(element("p", "La supervisión no garantiza rendimientos, liquidez o devolución inmediata. Confirma la vigencia de la oferta antes de contratar.", "notice warning"));
    columns.append(terms, risks);
    root.append(columns);
    root.append(element("h3", "Costos documentados"));
    if (item.fees.length) root.append(table(["Cobro", "Tarifa / base", "Alcance", "Condiciones"], item.fees.map(fee => [
      fee.label, feeAmount(fee, item), feeStatuses[fee.status], fee.notes || "Ver documento."
    ])));
    else root.append(element("p", "No se recuperó un tarifario suficiente. Esto no significa que el producto sea gratuito.", "notice warning"));
    root.append(element("h3", "Histórico disponible"));
    if (item.history.length) {
      root.append(table(["Periodo", "Dato", "Medida", "Base", "Fuente"], item.history.map(row => [
        row.period, pct(row.valuePct), measureLabels[row.measure], basisLabels[row.returnBasis],
        sourceLink(sources.get(row.sourceId), row.notes || "Documento")
      ]), [1]));
    } else root.append(element("p", "No hay una serie verificable cargada para este producto. No se sustituyó con el rendimiento de otro fondo, del índice o de una moneda diferente.", "notice"));
    root.append(sourceLinks([...item.sourceIds, ...item.fees.flatMap(fee => fee.sourceIds || []), ...(item.tax?.sourceIds || [])]));
  }
  function fillRateTiers(item) {
    const tiers = item.rateTiers || [];
    $("i-tier-label").hidden = tiers.length === 0;
    const coupons = {monthly: "interés mensual", "at-maturity": "al vencimiento", quarterly: "interés trimestral", annual: "interés anual", semiannual: "interés semestral"};
    $("i-tier").replaceChildren(...tiers.map((tier, index) => {
      const term = tier.minTermDays && tier.maxTermDays && tier.minTermDays !== tier.maxTermDays
        ? `${tier.minTermDays}–${tier.maxTermDays} días`
        : tier.termDays || item.termDays ? `${tier.termDays || item.termDays} días` : "Tramo de saldo";
      return option(index, `${term}${coupons[tier.couponFrequency] ? ` · ${coupons[tier.couponFrequency]}` : ""} · ${tier.annualRatePct == null ? "cotizar" : pct(tier.annualRatePct)}${tier.minAmount != null ? ` · desde ${money(tier.minAmount, investmentsCurrency(item))}` : ""}${tier.maxAmount != null ? ` hasta ${money(tier.maxAmount, investmentsCurrency(item))}` : ""}`);
    }));
    if (tiers.length) {
      const available = tiers.findIndex(tier => (tier.minAmount == null || input("i-initial") >= tier.minAmount) && (tier.maxAmount == null || input("i-initial") <= tier.maxAmount));
      $("i-tier").value = String(Math.max(0, available));
      applyRateTier();
    }
  }
  function scenarioRateBasis(item, tier) {
    const basis = tier?.rateBasis && tier.rateBasis !== "unknown" ? tier.rateBasis : item.rateBasis;
    return basis === "effective" ? "effective" : basis === "nominal" || ["savings", "term-deposit"].includes(item.category) ? "nominal" : "effective";
  }
  function depositDays(item, tier) {
    const days = $("i-deposit-days");
    const deposit = item.category === "term-deposit";
    $("i-deposit-days-label").hidden = !deposit;
    days.disabled = !deposit;
    days.required = deposit;
    days.min = tier?.minTermDays || tier?.termDays || item.termDays || 1;
    days.max = tier?.maxTermDays || tier?.termDays || item.termDays || 3660;
    days.value = tier?.termDays || tier?.minTermDays || item.termDays || "";
    if (deposit && days.value && input("i-years") * 365 < Number(days.value)) setValue("i-years", Math.ceil(Number(days.value) / 365));
  }
  function applyRateTier() {
    if (!selectedInvestment) return;
    const tier = selectedInvestment.rateTiers?.[Number($("i-tier").value)];
    if (!tier) return;
    setValue("i-rate", tier.annualRatePct);
    $("i-rate-basis").value = scenarioRateBasis(selectedInvestment, tier);
    setValue("i-day-basis", tier.dayBasis || selectedInvestment.dayBasis || 360);
    depositDays(selectedInvestment, tier);
    $("i-rate-note").textContent = `Tasa del tramo elegido. Verifica moneda, plazo, monto y vigencia. ${tier.rateBasis === "unknown" || selectedInvestment.rateBasis === "unknown" ? "La convención nominal/efectiva no está confirmada: el selector muestra un supuesto editable. " : ""}Mantener esta tasa en el futuro es un supuesto; el crecimiento del saldo puede cambiar el tramo real.`;
  }
  function selectInvestment(item) {
    selectedInvestment = item;
    const unknownCurrency = item.currency === "MULTI" && item.category !== "broker";
    $("i-form").hidden = unknownCurrency;
    $("i-currency-warning").hidden = !unknownCurrency;
    $("i-selected").hidden = false;
    $("i-selected-title").textContent = `${institutionName(item.institutionId)} · ${item.name}`;
    $("i-selected-currency").textContent = unknownCurrency ? "Moneda por confirmar" : investmentsCurrency(item);
    for (const node of document.querySelectorAll("[data-i-currency]")) node.textContent = investmentsCurrency(item);
    renderInvestmentDetail(item);
    const usd = investmentsCurrency(item) !== "CRC";
    setValue("i-initial", Math.max(item.minInitial || 0, usd ? 5000 : 1000000));
    setValue("i-monthly", item.category === "term-deposit" ? 0 : Math.max(item.minContribution || 0, usd ? 100 : 25000));
    setValue("i-years", item.category === "term-deposit" ? 1 : 10);
    setValue("i-rate", item.annualRatePct);
    $("i-rate-basis").value = scenarioRateBasis(item);
    $("i-day-basis-label").hidden = item.category !== "term-deposit";
    setValue("i-day-basis", item.dayBasis || 360);
    $("i-net-fees").checked = ["net-of-fees", "net-of-fees-and-tax"].includes(item.returnBasis);
    const annual = preferredFees(item, "annual-assets-pct");
    const entry = preferredFees(item, "contribution-pct");
    const performance = preferredFees(item, "performance-pct");
    setValue("i-annual-fee", annual.reduce((sum, fee) => sum + fee.value, 0));
    setValue("i-performance-fee", performance.reduce((sum, fee) => sum + fee.value, 0));
    setValue("i-entry-fee", entry.reduce((sum, fee) => sum + fee.value, 0));
    const afterTax = ["net-of-tax", "net-of-fees-and-tax"].includes(item.returnBasis);
    const pension = item.category.startsWith("pension") || /\bFCL\b/i.test(item.name);
    setValue("i-tax", item.tax?.withholdingPct ?? (item.category === "broker" ? 30 : pension ? 0 : 15));
    $("i-tax-mode").value = afterTax || pension ? "none" : item.category === "broker" ? "dividends" : item.category === "savings" ? "monthly-gain" : "annual-gain";
    for (const id of ["i-monthly-fixed", "i-transfer-fixed", "i-transfer-base-fixed", "i-transfer-pct", "i-transfer-min", "i-transfer-max", "i-trade-fixed", "i-fx-spread", "i-exit-fixed", "i-exit-pct"]) setValue(id, 0);
    setValue("i-cadence", 1);
    $("i-transfer-details").open = item.category === "broker";
    $("i-transfer-note").textContent = "Costos no confirmados se dejan en cero como exclusión del modelo, no como gratuidad. Introduce los que figuren en tu contrato.";
    if (item.category === "broker") {
      setValue("i-transfer-fixed", 40);
      setValue("i-trade-fixed", 1);
      setValue("i-exit-fixed", 40);
      $("i-transfer-note").textContent = "Inicio ilustrativo: 40 por envío, 1 por orden y 40 al retirar, en USD. Son supuestos, no un tarifario de IBKR ni de tu banco. Elige una ruta documentada y agrega corresponsales y recepción según tu cotización.";
    }
    $("i-transfer-route").replaceChildren(option("", "Costos editables / mi cotización"));
    (item.transferRoutes || []).forEach((route, index) => {
      if (route.status === "published-current" && route.currency === investmentsCurrency(item)) $("i-transfer-route").append(option(index, route.label));
    });
    $("i-rate-note").textContent = item.annualRatePct != null
      ? `${rateDescription(item)}. ${item.rateBasis === "unknown" ? "La convención del selector es un supuesto editable, no un dato confirmado. " : ""}Mantener esta tasa en el futuro es un supuesto, no una promesa.`
      : "No hay una tasa contratada para cargar. Ingresa un escenario propio; la existencia de historia no permite pronosticar una rentabilidad.";
    const summary = F.historySummary(item.history);
    $("i-use-history").hidden = !summary.usable || summary.cagrPct <= -99;
    $("i-cost-note").textContent = `${annual.some(fee => fee.status === "published-maximum") ? "La administración usa un máximo del documento, no una tarifa actual confirmada. " : ""}${performance.length ? "La comisión sobre rendimiento usa un devengo mensual simplificado, no reglas contractuales completas. " : ""}${item.category === "broker" ? "Agrega los gastos internos del ETF o activo elegido: la custodia cero del bróker no los elimina. " : ""}Las tarifas especiales o sin una base suficiente se muestran en la ficha y requieren ajuste manual. Los ceros no confirman gratuidad.`;
    depositDays(item);
    fillRateTiers(item);
    toggleInvestmentTax();
    $("i-results").className = "panel empty";
    $("i-results").replaceChildren(element("h2", "Revisa antes de proyectar"), element("p", "Comprueba tasa, plazo, mínimos, impuestos y costos. No se ha calculado un rendimiento futuro para este producto."));
    renderCatalog();
    $("i-selected").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
    $("i-selected-title").focus({preventScroll: true});
  }
  function toggleInvestmentTax() { $("i-dividend-label").hidden = $("i-tax-mode").value !== "dividends"; }
  function applyTransferRoute() {
    const key = $("i-transfer-route").value;
    if (key === "" || !selectedInvestment) return;
    const route = selectedInvestment.transferRoutes?.[Number(key)];
    if (!route) return;
    setValue("i-transfer-fixed", route.transferFixed);
    setValue("i-transfer-base-fixed", route.transferBaseFixed);
    setValue("i-transfer-pct", route.transferPct);
    setValue("i-transfer-min", route.transferMinimum);
    setValue("i-transfer-max", route.transferMaximum);
    $("i-transfer-note").textContent = `${route.label}: ${route.notes || "ver fuente"}. Solo se cargó esta ruta saliente. Los cargos externos no incluidos se agregan al fijo por envío; retiro y recepción al final se configuran aparte, no se cargan como envíos.`;
  }
  function calculateInvestment(event) {
    event.preventDefault();
    error("i-error");
    if (!validForm("i-form") || !selectedInvestment) return;
    try {
      const item = selectedInvestment;
      if (item.currency === "MULTI" && item.category !== "broker") throw new RangeError("La moneda del producto no está confirmada; no se proyecta como USD.");
      const initial = input("i-initial");
      const monthly = input("i-monthly");
      if (item.minInitial != null && initial < item.minInitial) throw new RangeError("El aporte inicial no llega al mínimo publicado.");
      if (monthly > 0 && item.minContribution != null && monthly < item.minContribution) throw new RangeError("El aporte mensual no llega al mínimo publicado. Usa cero o un monto compatible.");
      if (item.category === "term-deposit" && monthly > 0) throw new RangeError("El CDP se proyecta como un depósito a la vez, sin agregar dinero al contrato. Usa aporte mensual cero; un CDP nuevo necesita evaluar su mínimo y plazo.");
      const tier = item.rateTiers?.length ? item.rateTiers[Number($("i-tier").value)] : null;
      if (tier?.minAmount != null && initial < tier.minAmount) throw new RangeError("El aporte es inferior al mínimo del tramo elegido.");
      if (tier?.maxAmount != null && initial > tier.maxAmount) throw new RangeError("El aporte supera el máximo del tramo elegido.");
      let assumedRate = input("i-rate");
      let deposit = null;
      let taxMode = $("i-tax-mode").value;
      const rateBasis = $("i-rate-basis").value;
      if (item.category === "term-deposit") {
        const termDays = input("i-deposit-days");
        if (input("i-years") * 365 < termDays) throw new RangeError("El horizonte elegido termina antes del vencimiento. No se presupone que puedas retirar anticipadamente.");
        deposit = F.depositMaturity({
          principal: initial, annualPct: assumedRate, days: termDays,
          dayBasis: input("i-day-basis"), rateBasis,
          taxPct: taxMode === "none" ? 0 : input("i-tax")
        });
        assumedRate = deposit.annualNetPct;
        taxMode = "none";
      } else if (rateBasis === "nominal") {
        assumedRate = ((1 + assumedRate / 1200) ** 12 - 1) * 100;
      }
      const opts = {
        initial, monthlyContribution: monthly, months: input("i-years") * 12,
        annualReturnPct: assumedRate, inflationPct: input("i-inflation"),
        annualFeePct: input("i-annual-fee"), returnIncludesFees: $("i-net-fees").checked,
        performanceFeePct: input("i-performance-fee"),
        contributionFeePct: input("i-entry-fee"), monthlyFixed: input("i-monthly-fixed"),
        transferFixed: input("i-transfer-fixed"), transferPct: input("i-transfer-pct"),
        transferBaseFixed: input("i-transfer-base-fixed"),
        transferMinimum: input("i-transfer-min"), transferMaximum: input("i-transfer-max"),
        tradeFixed: input("i-trade-fixed"), fxSpreadPct: input("i-fx-spread"),
        exitFixed: input("i-exit-fixed"), exitPct: input("i-exit-pct"),
        contributionEveryMonths: input("i-cadence"),
        taxMode, taxPct: input("i-tax"), dividendYieldPct: input("i-dividend")
      };
      const base = F.investment(opts);
      const spread = input("i-range");
      const low = F.investment({...opts, annualReturnPct: Math.max(-99, assumedRate - spread)});
      const high = F.investment({...opts, annualReturnPct: Math.min(100, assumedRate + spread)});
      const output = $("i-results");
      output.className = "panel";
      output.replaceChildren(element("h2", "Una proyección condicionada"));
      output.append(kpis([
        ["Valor final del escenario base", money(base.finalBalance, investmentsCurrency()), "No es un valor garantizado ni necesariamente disponible para retirar."],
        ["Dinero que aportas", money(base.contributions, investmentsCurrency()), "Antes de costos de entrada y envíos."],
        ["Comisiones modeladas", money(base.costs, investmentsCurrency()), "No incluye conceptos sin una cifra o base en el formulario."],
        ["Poder de compra de hoy", money(base.realBalance, investmentsCurrency()), `Con inflación supuesta de ${pct(input("i-inflation"))}.`]
      ]));
      if (deposit) {
        output.append(element("h3", "Capital e intereses del primer plazo"));
        output.append(table(["Concepto", "Monto"], [
          ["Interés con la tasa ingresada", money(deposit.grossInterest, investmentsCurrency())],
          ["Retención adicional modelada", money(deposit.tax, investmentsCurrency())],
          ["Capital + intereses después de esa retención", money(deposit.finalBalance, investmentsCurrency())]
        ], [1]));
        output.append(element("p", `Plazo: ${plain(input("i-deposit-days"))} días; base elegida: ${plain(input("i-day-basis"))}. La tabla suma los intereses del plazo: si se pagan mensualmente, no se entregan todos al vencimiento. No incluye cargos de envío o mantenimiento. La proyección larga y sus bandas usan un equivalente anual después de la retención modelada, con reinversión a la misma tasa. Plazo, base de días y capitalización no confirmados son supuestos, no términos del banco.`, "help"));
      }
      const graph = element("div", null, "chart");
      output.append(graph);
      chart(graph, [
        {name: "Escenario base", points: base.rows.map(row => [row.month, row.balance])},
        {name: "Aportes acumulados", points: base.rows.map(row => [row.month, row.contributions])}
      ], investmentsCurrency(), "Proyección del saldo frente al dinero aportado; no representa retornos históricos observados.");
      output.append(table(["Supuesto", "Rendimiento anual modelado", "Valor final"], [
        ["Menor rendimiento", pct(Math.max(-99, assumedRate - spread)), money(low.finalBalance, investmentsCurrency())],
        ["Base", pct(assumedRate), money(base.finalBalance, investmentsCurrency())],
        ["Mayor rendimiento", pct(Math.min(100, assumedRate + spread)), money(high.finalBalance, investmentsCurrency())]
      ], [1, 2]));
      const warnings = [...base.warnings, "Las bandas son escenarios elegidos, no intervalos estadísticos ni probabilidades.", `Impuestos deducidos en la proyección: ${money(base.taxes, investmentsCurrency())}${deposit ? "; la retención del CDP ya está incorporada en su tasa neta, no se vuelve a restar" : ""}.`];
      if (base.cashNotInvested > 0) warnings.push(`${money(base.cashNotInvested, investmentsCurrency())} permanece en efectivo, sin rendimiento, porque no alcanza para el costo del envío.`);
      if (item.category.startsWith("pension")) warnings.push("El saldo proyectado no equivale a dinero de libre retiro. No se modelan beneficios fiscales por planilla, aportes legales exactos ni devolución de incentivos por retiro anticipado.");
      if (item.category === "pension-mandatory" || /\bFCL\b/i.test(item.name)) warnings.push("En ROP/FCL ingresa el aporte legal que efectivamente recibe el fondo: no es un producto abierto para aportes voluntarios arbitrarios.");
      if (["real-estate-fund", "development-fund"].includes(item.category)) warnings.push("En fondos cerrados, el precio de negociación y el plazo para vender pueden diferir del valor de participación; consulta el puesto de bolsa.");
      if (item.category === "broker") warnings.push("El rendimiento pertenece a los activos que elijas, no al bróker. No se incluyen impuestos sucesorios ni toda obligación fiscal individual.");
      output.append(list(warnings));
      const exportButton = element("button", "Descargar escenario anual CSV", "button secondary");
      exportButton.type = "button";
      exportButton.addEventListener("click", () => download("proyeccion-inversion.csv", "\ufeffMes;Saldo;Aportes;Comisiones_modeladas;Impuestos_modelados\n" + base.rows.map(row => [row.month, row.balance, row.contributions, row.costs, row.taxes].join(";")).join("\n")));
      output.append(exportButton);
      $("i-live").textContent = `Valor final del escenario: ${money(base.finalBalance, investmentsCurrency())}. No garantizado.`;
    } catch (problem) {
      error("i-error", problem.message);
      $("i-results").replaceChildren(element("h2", "Hace falta corregir el escenario"), element("p", problem.message));
    }
  }

  function renderSources() {
    const query = normalize($("source-search").value);
    const selected = data.sources.filter(item => normalize(`${item.title} ${item.url} ${item.id}`).includes(query));
    $("source-list").replaceChildren();
    $("source-list").append(element("p", `${selected.length} fuentes. «Consultada» no equivale a garantía de vigencia de todas sus condiciones.`, "help"));
    for (const item of selected) {
      const row = element("article", null, "source-item");
      const heading = element("h3");
      heading.append(sourceLink(item));
      row.append(heading, tag(statusLabels[item.status], item.status === "verified" ? "" : "warning"));
      row.append(element("p", `Consulta ${item.accessedOn} · Fecha del documento: ${item.documentDate || "no identificada"}`));
      if (item.notes) row.append(element("p", item.notes));
      row.append(element("code", item.id));
      $("source-list").append(row);
    }
  }
  function renderDataInfo() {
    $("snapshot-label").textContent = `Datos revisados: ${data.asOf} · Próxima revisión: ${data.nextReview}`;
    if (today > data.nextReview) {
      $("stale-notice").hidden = false;
      $("stale-notice").textContent = `La revisión trimestral venció el ${data.nextReview}. Este catálogo sigue siendo el corte ${data.asOf}; confirma nuevas tarifas y condiciones antes de decidir. No se actualiza automáticamente.`;
    }
    const stats = [
      [data.institutions.length, "instituciones en el inventario"],
      [data.mortgages.length, "fichas hipotecarias"],
      [data.investments.length, "fichas y variantes de inversión"],
      [data.sources.filter(item => item.status === "verified").length, "fuentes consultadas"]
    ];
    $("home-stats").replaceChildren();
    for (const [count, text] of stats) {
      const part = element("div");
      part.append(element("dt", plain(count)), element("dd", text));
      $("home-stats").append(part);
    }
    $("data-summary").append(element("p", `Corte de revisión: ${data.asOf}. Próxima revisión manual: ${data.nextReview}. Los documentos conservan su propia fecha; consultar un documento antiguo no lo vuelve una oferta vigente.`));
    const read = data.investments.filter(item => item.prospectus?.reviewStatus === "read").length;
    const partial = data.investments.filter(item => item.prospectus?.reviewStatus === "partial").length;
    const history = data.investments.filter(item => item.history.length).length;
    $("data-summary").append(element("p", `${read} fichas con prospecto o folleto íntegramente revisado, ${partial} con revisión parcial y ${history} con alguna observación histórica. Se cuentan fichas, no documentos distintos; no significa cobertura total del mercado.`));
    const quotes = data.mortgages.filter(item => isCurrent(item) && !item.rates.length).length;
    const priced = data.investments.filter(item => item.annualRatePct != null || item.rateTiers?.some(tier => tier.annualRatePct != null)).length;
    $("data-summary").append(element("p", `${quotes} fichas hipotecarias activas requieren completar la tasa mediante cotización. ${priced} fichas de ahorro/inversión contienen una tasa o tramos numéricos; la vigencia, convención y base deben revisarse. Las demás no reciben una tasa inventada.`));
    for (const scope of data.coverage) {
      const panel = element("article", null, "panel");
      const head = element("div", null, "coverage-head");
      head.append(element("h2", scope.scope), tag(scope.universeCount == null ? "Universo no certificado" : `${scope.universeCount} elementos en el universo de referencia`, scope.universeCount == null ? "warning" : ""));
      panel.append(head, element("p", scope.notes), sourceLinks(scope.registrySourceIds));
      if (scope.gaps.length) {
        const details = element("details");
        details.append(element("summary", `${scope.gaps.length} brechas o limitaciones documentadas`));
        const gaps = element("div", null, "coverage-gaps");
        gaps.tabIndex = 0;
        gaps.setAttribute("aria-label", `Brechas de ${scope.scope}`);
        gaps.append(list(scope.gaps.map(gap => `${gap.name}: ${gap.reason}`)));
        details.append(gaps); panel.append(details);
      }
      $("coverage-list").append(panel);
    }
    $("institution-table").append(table(["Institución", "Tipo", "Supervisión / ámbito"], [...data.institutions].sort((a, b) => a.name.localeCompare(b.name, "es")).map(item => [item.name, institutionTypes[item.type] || item.type, item.regulator])));
    renderSources();
  }
  $("m-form").addEventListener("submit", calculateMortgage);
  $("m-product").addEventListener("change", configureMortgage);
  $("m-manual").addEventListener("change", updateManual);
  $("m-prepay-public").addEventListener("change", updatePrepayment);
  $("m-currency").addEventListener("change", () => {
    const next = currency();
    const fx = Math.max(1, Number($("m-fx").value) || 500);
    const factor = previousCurrency === "CRC" ? 1 / fx : fx;
    if (next !== previousCurrency) {
      for (const id of ["m-price", "m-down", "m-extra", "m-hoa", "r-savings", "r-budget", "r-rent"]) setValue(id, F.money(Number($(id).value) * factor));
      previousCurrency = next;
    }
    for (const node of document.querySelectorAll("[data-m-currency]")) node.textContent = next;
    setMortgageProducts();
  });
  $("m-compare").addEventListener("click", compareOffers);
  $("m-csv").addEventListener("click", () => {
    if (!latestMortgage) return;
    const rows = latestMortgage.result.rows;
    const header = "\ufeffMes;Tasa_nominal_anual;Saldo_inicial;Pago_capital_interes_extra;Intereses;Capital_ordinario;Extra;Vida;Inmueble;Comision_extra;Total;Saldo_final\n";
    download("amortizacion-hipoteca.csv", header + rows.map(row => [row.month, row.annualPct, row.opening, row.payment, row.interest, row.principalPaid, row.extraPayment, row.lifeInsurance, row.propertyInsurance, row.prepaymentFee, row.total, row.balance].join(";")).join("\n"));
  });
  $("m-use-rent").addEventListener("click", () => {
    if (input("m-price") > 0) setValue("r-down", Math.max(1, input("m-down") / input("m-price") * 100));
    location.hash = "alquilar";
  });
  $("r-form").addEventListener("submit", calculateRent);
  for (const id of ["i-search", "i-category", "i-currency-filter", "i-history-only"]) $(id).addEventListener(id === "i-search" ? "input" : "change", () => { page = 0; renderCatalog(); });
  $("i-prev").addEventListener("click", () => { page -= 1; renderCatalog(); });
  $("i-next").addEventListener("click", () => { page += 1; renderCatalog(); });
  $("i-tier").addEventListener("change", applyRateTier);
  $("i-tax-mode").addEventListener("change", toggleInvestmentTax);
  $("i-transfer-route").addEventListener("change", applyTransferRoute);
  $("i-use-history").addEventListener("click", () => {
    const result = F.historySummary(selectedInvestment.history);
    if (!result.usable) return;
    setValue("i-rate", Number(result.cagrPct.toFixed(4)));
    $("i-rate-basis").value = "effective";
    $("i-net-fees").checked = ["net-of-fees", "net-of-fees-and-tax"].includes(result.returnBasis);
    if (["net-of-tax", "net-of-fees-and-tax"].includes(result.returnBasis)) $("i-tax-mode").value = "none";
    $("i-rate-note").textContent = `Crecimiento geométrico observado ${result.firstYear}–${result.lastYear}: ${pct(result.cagrPct)}, ${basisLabels[result.returnBasis]}. Repetirlo es un supuesto, no una expectativa garantizada.`;
    toggleInvestmentTax();
  });
  $("i-rate").addEventListener("input", () => {
    $("i-rate-note").textContent = "Tasa o rendimiento editado por ti. Es un supuesto de simulación, no una cotización o pronóstico de la institución.";
  });
  $("i-form").addEventListener("submit", calculateInvestment);
  $("source-search").addEventListener("input", renderSources);
  for (const [value, label] of Object.entries(categories)) $("i-category").append(option(value, label));
  const exchange = benchmarks.get("USDCRC_SELL") || benchmarks.get("USDCRC_VENTA") || benchmarks.get("USD-CRC-VENTA") || benchmarks.get("USDCRC");
  if (exchange?.value != null) {
    setValue("m-fx", exchange.value);
    $("m-fx-note").textContent = `Referencia observada ${exchange.observedOn || "sin fecha de valor"}. Tu banco puede aplicar otro precio y margen.`;
  }
  setMortgageProducts();
  renderCatalog();
  renderDataInfo();
})();
