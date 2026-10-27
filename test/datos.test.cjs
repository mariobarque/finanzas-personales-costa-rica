const test = require("node:test");
const assert = require("node:assert/strict");
const {validate, threeMonthsLater} = require("../scripts/compilar-datos.cjs");
const base = () => ({
  schemaVersion: 1, asOf: "2026-10-27", nextReview: "2027-01-27",
  sources: [{id: "test-source", title: "Documento", url: "https://example.com/official", accessedOn: "2026-10-27", status: "verified"}],
  institutions: [{id: "test-bank", name: "Banco ficticio solo para pruebas", type: "bank", regulator: "Prueba", sourceIds: ["test-source"]}],
  mortgages: [], investments: [], benchmarks: [], coverage: []
});
const offer = () => ({
  id: "test-mortgage", institutionId: "test-bank", name: "Fixture", currency: "CRC",
  status: "published", sourceIds: ["test-source"], reviewedOn: "2026-10-27",
  requirements: [], notes: [], maxLtv: 0.8,
  rates: [{fromMonth: 1, toMonth: null, kind: "fixed", annualPct: 8, sourceIds: ["test-source"]}]
});

test("vencimiento trimestral respeta fin de mes y cambio de año", () => {
  assert.equal(threeMonthsLater("2026-10-27"), "2027-01-27");
  assert.equal(threeMonthsLater("2026-01-31"), "2026-04-30");
  assert.equal(threeMonthsLater("2026-11-30"), "2027-02-28");
});
test("catalogo rechaza tasas sin contenido primario verificado", () => {
  const data = base();
  data.mortgages.push(offer());
  validate(data);
  data.sources[0].status = "blocked";
  assert.throws(() => validate(data), /tasa sin/);
});
test("catalogo rechaza huecos y referencias inexistentes", () => {
  const data = base();
  const mortgage = offer();
  mortgage.rates[0].toMonth = 12;
  mortgage.rates.push({fromMonth: 14, toMonth: null, kind: "fixed", annualPct: 9, sourceIds: ["test-source"]});
  data.mortgages.push(mortgage);
  assert.throws(() => validate(data), /huecos/);
  mortgage.rates[1].fromMonth = 13;
  mortgage.rates[1].sourceIds = ["inexistente"];
  assert.throws(() => validate(data), /inexistente/);
});
