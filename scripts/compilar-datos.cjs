"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const directory = path.join(root, "datos");
const schema = JSON.parse(fs.readFileSync(path.join(directory, "schema.json"), "utf8"));
const fragmentNames = ["hipotecas.json", "depositos.json", "fondos.json", "pensiones-broker.json"];
const allowedCategories = new Set(["savings", "term-deposit", "pension-mandatory", "pension-voluntary", "money-market", "income-fund", "equity-fund", "real-estate-fund", "development-fund", "other-fund", "broker"]);
const allowedBases = new Set(["gross", "net-of-fees", "net-of-tax", "net-of-fees-and-tax", "unknown"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function threeMonthsLater(date) {
  const parsed = new Date(`${date}T12:00:00Z`);
  const day = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + 3);
  const last = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
  parsed.setUTCDate(Math.min(day, last));
  return parsed.toISOString().slice(0, 10);
}
function validateShape(value, rule = schema, context = "catalogo") {
  if (rule.$ref) rule = schema.$defs[rule.$ref.split("/").at(-1)];
  if (rule.type) {
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    assert(types.some(type => type === "null" ? value === null
      : type === "array" ? Array.isArray(value)
      : type === "integer" ? Number.isInteger(value)
      : type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
      : typeof value === type), `${context}: tipo incorrecto.`);
  }
  if (rule.const !== undefined) assert(value === rule.const, `${context}: valor constante incorrecto.`);
  if (rule.enum) assert(rule.enum.includes(value), `${context}: valor no reconocido ${value}`);
  if (typeof value === "number") {
    assert(Number.isFinite(value), `${context}: numero no finito.`);
    if (rule.minimum !== undefined) assert(value >= rule.minimum, `${context}: inferior al minimo.`);
    if (rule.maximum !== undefined) assert(value <= rule.maximum, `${context}: superior al maximo.`);
  }
  if (rule.format === "date") assert(validDate(value), `${context}: fecha invalida.`);
  if (Array.isArray(value) && rule.items) value.forEach((item, index) => validateShape(item, rule.items, `${context}[${index}]`));
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of rule.required || []) assert(Object.hasOwn(value, key), `${context}: falta ${key}`);
    for (const [key, propertyRule] of Object.entries(rule.properties || {})) {
      if (Object.hasOwn(value, key)) validateShape(value[key], propertyRule, `${context}.${key}`);
    }
  }
}
function validate(data) {
  validateShape(data);
  assert(data.schemaVersion === 1, "Version de esquema incorrecta.");
  assert(validDate(data.asOf) && validDate(data.nextReview), "Fechas de revision invalidas.");
  const sources = new Map(data.sources.map(item => [item.id, item]));
  const institutions = new Set(data.institutions.map(item => item.id));
  assert(sources.size === data.sources.length, "IDs de fuentes repetidos.");
  assert(institutions.size === data.institutions.length, "IDs de instituciones repetidos.");
  const identifiers = new Set();
  const checkRefs = (refs, context) => {
    assert(Array.isArray(refs), `${context}: sourceIds debe ser un arreglo.`);
    for (const id of refs) assert(sources.has(id), `${context}: fuente inexistente ${id}`);
  };
  for (const source of data.sources) {
    assert(/^[a-z0-9][a-z0-9._-]*$/i.test(source.id), `ID de fuente invalido: ${source.id}`);
    const url = new URL(source.url);
    assert(["https:", "http:"].includes(url.protocol), `URL no publica: ${source.id}`);
    assert(validDate(source.accessedOn), `Fecha de acceso invalida: ${source.id}`);
    assert(source.accessedOn <= data.asOf, `Consulta posterior al corte: ${source.id}`);
    assert(["verified", "blocked", "unavailable"].includes(source.status), `Estado de fuente invalido: ${source.id}`);
    assert(source.title?.trim(), `Fuente sin titulo: ${source.id}`);
  }
  for (const institution of data.institutions) {
    assert(institution.name && institution.regulator, `Institucion incompleta: ${institution.id}`);
    checkRefs(institution.sourceIds, institution.id);
  }
  for (const item of [...data.mortgages, ...data.investments]) {
    assert(/^[a-z0-9][a-z0-9._-]*$/i.test(item.id), `ID de producto invalido: ${item.id}`);
    assert(!identifiers.has(item.id), `Producto duplicado: ${item.id}`);
    identifiers.add(item.id);
    assert(institutions.has(item.institutionId), `${item.id}: institucion inexistente ${item.institutionId}`);
    assert(validDate(item.reviewedOn), `${item.id}: fecha de revision invalida.`);
    assert(item.reviewedOn <= data.asOf, `${item.id}: fecha posterior al corte.`);
    checkRefs(item.sourceIds, item.id);
    assert(item.sourceIds.length, `${item.id}: falta evidencia o referencia de la brecha.`);
  }
  for (const offer of data.mortgages) {
    assert(["CRC", "USD"].includes(offer.currency), `Moneda hipotecaria invalida: ${offer.id}`);
    assert(["published", "starting-from", "quote-required", "historical"].includes(offer.status), `Estado hipotecario invalido: ${offer.id}`);
    assert(Array.isArray(offer.requirements) && Array.isArray(offer.notes), `${offer.id}: requisitos/notas invalidos.`);
    assert(offer.maxLtv == null || offer.maxLtv > 0 && offer.maxLtv <= 1, `${offer.id}: maxLtv debe estar entre 0 y 1.`);
    let previousEnd = 0;
    for (let i = 0; i < offer.rates.length; i += 1) {
      const rate = offer.rates[i];
      assert(Number.isInteger(rate.fromMonth) && rate.fromMonth === previousEnd + 1, `${offer.id}: fases solapadas o con huecos.`);
      assert(rate.toMonth == null ? i === offer.rates.length - 1 : Number.isInteger(rate.toMonth) && rate.toMonth >= rate.fromMonth, `${offer.id}: fin de fase invalido.`);
      previousEnd = rate.toMonth;
      assert(["fixed", "indexed"].includes(rate.kind), `${offer.id}: tipo de tasa invalido.`);
      if (rate.kind === "fixed") assert(typeof rate.annualPct === "number" && rate.annualPct >= 0 && rate.annualPct <= 100, `${offer.id}: tasa fija invalida.`);
      else assert(rate.benchmark && typeof rate.spreadPct === "number", `${offer.id}: referencia/margen incompletos.`);
      checkRefs(rate.sourceIds, `${offer.id} tasa`);
      assert(rate.sourceIds.some(id => sources.get(id).status === "verified"), `${offer.id}: tasa sin una fuente consultada.`);
      assert(rate.floorPct == null || rate.capPct == null || rate.floorPct <= rate.capPct, `${offer.id}: piso superior al techo.`);
    }
    if (offer.validUntil) assert(validDate(offer.validUntil), `${offer.id}: vencimiento invalido.`);
    for (const phase of offer.prepaymentFees || []) {
      checkRefs(phase.sourceIds, `${offer.id} penalizacion`);
      assert(phase.toMonth == null || phase.toMonth >= phase.fromMonth, `${offer.id}: etapa de penalizacion invalida.`);
    }
    if (offer.requiresPriorSavings) assert(offer.requiredSavingsMonths > 0, `${offer.id}: falta duracion del ahorro previo.`);
    for (const term of offer.allowedTermsMonths || []) assert((offer.minTermMonths == null || term >= offer.minTermMonths) && (offer.maxTermMonths == null || term <= offer.maxTermMonths), `${offer.id}: plazo permitido fuera de limites.`);
  }
  for (const item of data.investments) {
    assert(allowedCategories.has(item.category), `${item.id}: categoria invalida.`);
    assert(["CRC", "USD", "EUR", "CAD", "MULTI"].includes(item.currency), `${item.id}: moneda invalida.`);
    assert(["published", "quote-required", "registered-no-public-terms", "inactive"].includes(item.status), `${item.id}: estado invalido.`);
    assert(allowedBases.has(item.returnBasis), `${item.id}: base de rendimiento invalida.`);
    assert(["nominal", "effective", "unknown"].includes(item.rateBasis), `${item.id}: convencion de tasa invalida.`);
    assert(item.annualRatePct === null || typeof item.annualRatePct === "number" && item.annualRatePct >= -100, `${item.id}: tasa invalida, usar null si no hay dato.`);
    assert(Array.isArray(item.risks), `${item.id}: riesgos debe ser un arreglo.`);
    for (const fee of item.fees) {
      assert(fee.value === null || typeof fee.value === "number" && fee.value >= 0, `${item.id}: comision invalida.`);
      checkRefs(fee.sourceIds, `${item.id} comision`);
      assert(fee.minimum == null || fee.maximum == null || fee.minimum <= fee.maximum, `${item.id}: limites invertidos de comision.`);
    }
    for (const row of item.history) {
      assert(sources.has(row.sourceId), `${item.id}: fuente historica inexistente.`);
      assert(sources.get(row.sourceId).status === "verified", `${item.id}: historia sin fuente leida.`);
      assert(typeof row.valuePct === "number" && row.valuePct >= -100, `${item.id}: observacion invalida.`);
      assert(allowedBases.has(row.returnBasis), `${item.id}: base historica invalida.`);
      assert(["calendar-year", "trailing-12-month", "annualized-period", "year-to-date", "quoted-rate"].includes(row.measure), `${item.id}: medida historica invalida.`);
    }
    for (const tier of item.rateTiers || []) {
      assert(tier.annualRatePct == null || typeof tier.annualRatePct === "number", `${item.id}: tasa de tramo invalida.`);
      if (tier.sourceIds) checkRefs(tier.sourceIds, `${item.id} tramo`);
      assert(tier.minAmount == null || tier.maxAmount == null || tier.minAmount <= tier.maxAmount, `${item.id}: limites invertidos del tramo.`);
    }
    for (const route of item.transferRoutes || []) {
      checkRefs(route.sourceIds, `${item.id} ruta ${route.id}`);
      assert(route.sourceIds.length && route.sourceIds.every(id => sources.get(id).status === "verified"), `${item.id}: ruta sin fuente verificada.`);
      assert(route.transferMaximum === 0 || route.transferMaximum >= route.transferMinimum, `${item.id}: limites de ruta invertidos.`);
    }
    if (item.prospectus?.sourceId) checkRefs([item.prospectus.sourceId], `${item.id} prospecto`);
    if (item.prospectus?.reviewStatus === "read") assert(item.prospectus.sourceId && sources.get(item.prospectus.sourceId).status === "verified", `${item.id}: prospecto marcado leido sin fuente verificada.`);
    if (item.tax?.sourceIds) checkRefs(item.tax.sourceIds, `${item.id} impuesto`);
  }
  for (const item of data.benchmarks) {
    checkRefs(item.sourceIds, item.id);
    assert(item.value == null || Number.isFinite(item.value), `${item.id}: referencia invalida.`);
    if (item.value != null) {
      assert(validDate(item.observedOn), `${item.id}: referencia sin fecha observada.`);
      assert(item.sourceIds.some(id => sources.get(id).status === "verified"), `${item.id}: referencia sin fuente verificada.`);
    }
  }
  for (const row of data.coverage) {
    checkRefs(row.registrySourceIds, row.scope);
    assert(Array.isArray(row.gaps) && row.notes, `${row.scope}: faltan notas de cobertura.`);
    for (const gap of row.gaps) if (gap.sourceIds) checkRefs(gap.sourceIds, row.scope);
  }
}

function compile() {
  const fragments = fragmentNames.map(name => {
    const file = path.join(directory, name);
    assert(fs.existsSync(file), `Falta ${name}; no se publica un fragmento vacio como si hubiera investigacion.`);
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  });
  const dates = [...new Set(fragments.map(fragment => fragment.asOf))];
  assert(dates.length === 1 && validDate(dates[0]), "Los cuatro fragmentos deben compartir fecha de corte.");
  const data = {
    schemaVersion: 1, asOf: dates[0], nextReview: threeMonthsLater(dates[0]),
    sources: [], institutions: [], mortgages: [], investments: [], benchmarks: [], coverage: []
  };
  for (const key of ["sources", "institutions", "benchmarks"]) {
    const merged = new Map();
    for (const fragment of fragments) {
      for (const item of fragment[key] || []) {
        const previous = merged.get(item.id);
        if (!previous) merged.set(item.id, item);
        else if (key === "institutions") {
          merged.set(item.id, {...previous, sourceIds: [...new Set([...previous.sourceIds, ...item.sourceIds])], notes: [...new Set([previous.notes, item.notes].filter(Boolean))].join(" ")});
        } else {
          assert(JSON.stringify(previous) === JSON.stringify(item), `Conflicto en ${key}: ${item.id}`);
        }
      }
    }
    data[key] = [...merged.values()];
  }
  for (const key of ["mortgages", "investments", "coverage"]) data[key] = fragments.flatMap(fragment => fragment[key] || []);
  validate(data);
  const json = JSON.stringify(data, null, 2) + "\n";
  const output = path.join(directory, "mercado.json");
  const snapshot = path.join(directory, "historico", data.asOf);
  fs.mkdirSync(snapshot, {recursive: true});
  const historicalFile = path.join(snapshot, "mercado.json");
  if (fs.existsSync(historicalFile) && fs.readFileSync(historicalFile, "utf8") !== json && !process.argv.includes("--revisar-corte")) {
    throw new Error("Este corte ya existe con otro contenido. Revisa cambios; usa --revisar-corte solo para corregir este mismo corte antes de publicarlo.");
  }
  fs.writeFileSync(output, json);
  fs.writeFileSync(path.join(directory, "mercado.js"), `"use strict";\nglobalThis.MERCADO = ${JSON.stringify(data).replace(/</g, "\\u003c")};\n`);
  fs.writeFileSync(historicalFile, json);
  const manifest = {
    asOf: data.asOf, nextReview: data.nextReview,
    sha256: crypto.createHash("sha256").update(json).digest("hex"),
    institutions: data.institutions.length, mortgages: data.mortgages.length,
    investments: data.investments.length, sources: data.sources.length,
    historyObservations: data.investments.reduce((sum, item) => sum + item.history.length, 0),
    productsWithFullProspectusReview: data.investments.filter(item => item.prospectus?.reviewStatus === "read").length,
    productsWithPartialProspectusReview: data.investments.filter(item => item.prospectus?.reviewStatus === "partial").length,
    productsWithHistory: data.investments.filter(item => item.history.length).length
  };
  fs.writeFileSync(path.join(snapshot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest, null, 2));
}
if (require.main === module) compile();
module.exports = {validate, threeMonthsLater};
