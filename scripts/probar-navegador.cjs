"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const {spawn} = require("node:child_process");
const {pathToFileURL} = require("node:url");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const fixtureMode = process.argv.includes("--fixture");
const artifacts = path.resolve(process.env.FINANZAS_TEST_OUTPUT || os.tmpdir());
fs.mkdirSync(artifacts, {recursive: true});
const work = fs.mkdtempSync(path.join(artifacts, "finanzas-browser-"));
const profile = path.join(work, "perfil");
const site = path.join(work, "sitio");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function fixture() {
  const common = {sourceIds: ["fixture"], reviewedOn: "2026-10-27", notes: []};
  const investment = {
    ...common, institutionId: "prueba", currency: "USD", status: "published",
    annualRatePct: null, rateBasis: "effective", returnBasis: "net-of-fees",
    fees: [], history: [], risks: ["Datos ficticios exclusivos de la prueba automatizada."],
    minInitial: 100, minContribution: 0, liquidity: "Prueba", requirements: []
  };
  const mortgage = {
    ...common, institutionId: "prueba", currency: "CRC", status: "published",
    maxTermMonths: 360, maxLtv: 0.8, requirements: ["Ejemplo ficticio."],
    originationFeePct: 1.5, minimumOriginationFee: null, appraisalFixed: null,
    lifeInsuranceAnnualPct: null, propertyInsuranceAnnualPct: null,
    prepaymentFeePct: null, prepaymentFeeUntilMonth: null
  };
  return {
    schemaVersion: 1, asOf: "2026-10-27", nextReview: "2027-01-27",
    sources: [{id: "fixture", title: "PRUEBA, no es una fuente bancaria", url: "https://example.invalid", accessedOn: "2026-10-27", status: "verified"}],
    institutions: [{id: "prueba", name: "Institucion ficticia", type: "bank", regulator: "Prueba", sourceIds: ["fixture"]}],
    mortgages: [
      {...mortgage, id: "sin-tasa", name: "Sin tasa", rates: [], status: "quote-required"},
      {...mortgage, id: "con-tasa", name: "Fases de prueba", rates: [
        {fromMonth: 1, toMonth: 12, kind: "fixed", annualPct: 6, sourceIds: ["fixture"]},
        {fromMonth: 13, toMonth: null, kind: "indexed", benchmark: "TBP", spreadPct: 3, sourceIds: ["fixture"]}
      ]},
      {...mortgage, id: "usd", name: "Dolares de prueba", currency: "USD", rates: [{fromMonth: 1, toMonth: null, kind: "fixed", annualPct: 7, sourceIds: ["fixture"]}]}
    ],
    investments: [
      {...investment, id: "cdp", name: "CDP de prueba", category: "term-deposit", currency: "CRC", annualRatePct: 6, rateBasis: "nominal", returnBasis: "gross", minInitial: 100000, termDays: null, tax: {withholdingPct: 15}, rateTiers: [{termDays: 31, minTermDays: 31, maxTermDays: 89, couponFrequency: "monthly", annualRatePct: 6, minAmount: 100000, maxAmount: 10000000, rateBasis: "nominal", returnBasis: "gross", sourceIds: ["fixture"]}]},
      {...investment, id: "fondo", name: "Fondo S&P 500 ficticio", category: "equity-fund", fees: [{label: "Maximo contractual", kind: "annual-assets-pct", value: 5, status: "published-maximum", sourceIds: ["fixture"]}, {label: "Administracion vigente", kind: "annual-assets-pct", value: 1.5, status: "published-current", sourceIds: ["fixture"]}], history: [2023, 2024, 2025].map((year, index) => ({period: String(year), measure: "calendar-year", valuePct: [10, -5, 15][index], returnBasis: "net-of-fees", sourceId: "fixture"}))},
      {...investment, id: "broker", name: "Broker ficticio", category: "broker", currency: "MULTI", returnBasis: "gross", transferRoutes: [{id: "ruta", label: "Ruta de prueba", status: "published-current", currency: "USD", transferPct: 0.2, transferMinimum: 30, transferMaximum: 100, transferBaseFixed: 0, transferFixed: 0, sourceIds: ["fixture"], notes: "Solo prueba."}]},
      {...investment, id: "pension", name: "Pension ficticia", category: "pension-voluntary", returnBasis: "gross", fees: [{label: "Sobre rendimiento", kind: "performance-pct", value: 10, status: "published-current", sourceIds: ["fixture"]}]},
      {...investment, id: "moneda-desconocida", name: "Ficha sin moneda confirmada", category: "savings", currency: "MULTI", status: "quote-required", minInitial: null}
    ],
    benchmarks: [{id: "TBP", name: "Referencia ficticia", value: 4, observedOn: "2026-10-27", sourceIds: ["fixture"]}],
    coverage: [{scope: "Solo pruebas ficticias", universeCount: null, registrySourceIds: ["fixture"], notes: "No publicar este fixture como datos financieros.", gaps: []}]
  };
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.next = 0;
    this.pending = new Map();
    this.errors = [];
    this.requests = [];
    this.downloads = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
          else pending.resolve(message.result);
        }
      } else if (message.method === "Runtime.exceptionThrown") {
        this.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        this.errors.push(message.params.entry.text);
      } else if (message.method === "Network.requestWillBeSent") {
        this.requests.push(message.params.request.url);
      } else if (message.method === "Browser.downloadWillBegin") this.downloads.push(message.params.suggestedFilename);
    });
  }
  call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Tiempo agotado: ${method}`)); }, 30000);
      this.pending.set(id, {resolve, reject, timer});
      this.socket.send(JSON.stringify({id, method, params, sessionId}));
    });
  }
}

async function main() {
  let browser, client, server;
  const report = {fixture: fixtureMode, checks: [], errors: [], externalRequests: [], artifacts: work};
  try {
    fs.cpSync(root, site, {recursive: true, filter: source => !["node_modules", ".git"].includes(path.basename(source))});
    const data = fixtureMode ? fixture() : JSON.parse(fs.readFileSync(path.join(site, "datos", "mercado.json"), "utf8"));
    if (fixtureMode) {
      fs.writeFileSync(path.join(site, "datos", "mercado.js"), `globalThis.MERCADO = ${JSON.stringify(data)};`);
      fs.writeFileSync(path.join(site, "datos", "mercado.json"), JSON.stringify(data));
    }
    require(path.join(site, "scripts", "comprobar-sitio.cjs"));
    report.checks.push("Recursos, enlaces, anclas y contrato de datos consistentes");
    const executable = process.env.EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    assert.ok(fs.existsSync(executable), "Indica EDGE_PATH con un navegador Chromium instalado.");
    browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], {stdio: "ignore"});
    let launchError;
    browser.on("error", error => { launchError = error; });
    const endpointFile = path.join(profile, "DevToolsActivePort");
    const deadline = Date.now() + 30000;
    while (!fs.existsSync(endpointFile) && Date.now() < deadline && !launchError && browser.exitCode === null) await delay(100);
    if (launchError) throw launchError;
    assert.ok(fs.existsSync(endpointFile), `Edge no inicio. PID ${browser.pid}, salida ${browser.exitCode}`);
    const [port, endpoint] = fs.readFileSync(endpointFile, "utf8").trim().split(/\r?\n/);
    const socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true}); });
    client = new CDP(socket);
    const {targetId} = await client.call("Target.createTarget", {url: "about:blank"});
    const {sessionId} = await client.call("Target.attachToTarget", {targetId, flatten: true});
    const command = (method, params) => client.call(method, params, sessionId);
    for (const domain of ["Page", "Runtime", "Network", "Log"]) await command(`${domain}.enable`);
    await client.call("Browser.setDownloadBehavior", {behavior: "allow", downloadPath: work, eventsEnabled: true});
    await command("Emulation.setEmulatedMedia", {features: [{name: "prefers-reduced-motion", value: "reduce"}]});
    const evaluate = async expression => {
      const result = await command("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const check = async (label, expression) => {
      assert.ok(await evaluate(expression), label);
      report.checks.push(label);
    };
    const waitFor = async expression => {
      const end = Date.now() + 15000;
      while (Date.now() < end) { if (await evaluate(expression)) return; await delay(40); }
      throw new Error(`Condicion no alcanzada: ${expression}`);
    };
    const navigate = async url => {
      await command("Page.navigate", {url});
      await waitFor("document.readyState === 'complete'");
    };
    const route = async id => {
      await evaluate(`location.hash = ${JSON.stringify(id)}`);
      await waitFor(`!document.getElementById(${JSON.stringify(id)}).hidden`);
      await evaluate("scrollTo(0,0)");
    };
    const screenshot = async name => {
      const image = await command("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
      fs.writeFileSync(path.join(work, name + ".png"), Buffer.from(image.data, "base64"));
    };
    const dimensions = (width, height) => command("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: width < 600});
    const offline = value => command("Network.emulateNetworkConditions", {offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
    await offline(true);
    await dimensions(1365, 950);
    const file = pathToFileURL(path.join(site, "index.html")).href;
    await navigate(file + "#alquilar");
    await check("Acceso directo a alquiler sin errores de inicializacion", "!document.getElementById('alquilar').hidden && document.getElementById('data-error').hidden");
    await route("inicio");
    await check("Portada offline y catalogo cargados", "document.querySelector('.book-display img').naturalWidth > 0 && document.getElementById('home-stats').children.length === 4");
    await screenshot("inicio-escritorio");
    await route("hipoteca");
    await evaluate("document.querySelector('.skip').click()");
    await check("Saltar al contenido conserva la calculadora activa", "location.hash === '#hipoteca' && document.activeElement.id === 'contenido'");
    if (fixtureMode) await check("Tasa documentada se elige antes de cotizacion pendiente", "document.getElementById('m-product').value === 'con-tasa'");
    await evaluate("for (const input of document.querySelectorAll('#m-benchmarks input')) if (!input.value) input.value = '5'; if (document.getElementById('m-manual').checked) document.getElementById('m-rate').value = '8'; document.getElementById('m-form').requestSubmit()");
    await check("Hipoteca calcula cuota y amortizacion", "!document.getElementById('m-results').hidden && document.getElementById('m-error').hidden && !!document.querySelector('#m-chart svg')");
    await evaluate("document.getElementById('m-compare').click(); document.getElementById('m-csv').click()");
    await check("Comparacion de ofertas disponible", "document.querySelectorAll('#m-comparison tbody tr').length > 0");
    await screenshot("hipoteca-escritorio");
    const observedFx = data.benchmarks.find(item => /usd.*crc.*venta/i.test(item.id) && item.value != null);
    if (observedFx) await check("Tipo de cambio real fechado cargado", `Number(document.getElementById('m-fx').value) === ${observedFx.value}`);
    if (data.mortgages.some(item => item.currency === "USD" && item.status !== "historical")) {
      await evaluate("document.getElementById('m-currency').value = 'USD'; document.getElementById('m-currency').dispatchEvent(new Event('change')); for (const field of document.querySelectorAll('#m-benchmarks input')) if (!field.value) field.value = '5'; if (document.getElementById('m-manual').checked) document.getElementById('m-rate').value = '8'; document.getElementById('m-form').requestSubmit()");
      await check("Credito USD se calcula sin confundir ingresos CRC", "!document.getElementById('m-results').hidden && document.getElementById('m-income-currency').value === 'CRC' && Number(document.getElementById('m-price').value) < 1000000");
      await evaluate("document.getElementById('m-currency').value = 'CRC'; document.getElementById('m-currency').dispatchEvent(new Event('change'))");
    }
    const quote = data.mortgages.find(item => item.currency === "CRC" && !item.rates.length && item.status !== "historical");
    if (quote) {
      await evaluate(`document.getElementById('m-product').value = ${JSON.stringify(quote.id)}; document.getElementById('m-product').dispatchEvent(new Event('change'))`);
      await check("Sin tasa publica no se inventa una", "document.getElementById('m-manual').checked && document.getElementById('m-rate').value === ''");
      await evaluate("document.getElementById('m-rate').value = '8'; document.getElementById('m-form').requestSubmit()");
      await check("Cotizacion personal queda identificada", "!document.getElementById('m-results').hidden && document.getElementById('m-scenario-label').textContent.includes('personal')");
    }
    await route("alquilar");
    await evaluate("document.getElementById('r-form').requestSubmit()");
    await check("Tres caminos comparados con las mismas entradas", "document.getElementById('r-error').hidden && document.querySelectorAll('#r-results tbody tr').length === 3");
    await route("inversiones");
    const selections = new Map();
    for (const item of data.investments.filter(item => item.status !== "inactive")) {
      if (!selections.has(item.category)) selections.set(item.category, item);
      if (/\bBN\b.*(?:ETF\s*500|S\s*&?\s*P\s*500)/i.test(item.name)) selections.set("bn-sp500", item);
      if (item.fees.some(fee => fee.kind === "performance-pct" && fee.value > 0) && !selections.has("performance-fee")) selections.set("performance-fee", item);
      if (item.currency === "MULTI" && item.category !== "broker" && !selections.has("unconfirmed-currency")) selections.set("unconfirmed-currency", item);
      if (item.category === "term-deposit" && item.rateTiers?.some(tier => tier.annualRatePct != null && tier.termDays) && !selections.has("cdp-tiers")) selections.set("cdp-tiers", item);
      if (/\bFCL\b/i.test(item.name) && !selections.has("fcl")) selections.set("fcl", item);
      if (item.currency === "CAD" && !selections.has("cad")) selections.set("cad", item);
    }
    for (const item of new Map([...selections.values()].map(item => [item.id, item])).values()) {
      const institution = data.institutions.find(bank => bank.id === item.institutionId)?.name || "";
      await evaluate(`document.getElementById('i-search').value = ${JSON.stringify(institution + " " + item.name)}; document.getElementById('i-search').dispatchEvent(new Event('input'))`);
      const selector = `[data-product-id="${item.id}"]`;
      for (let attempts = 0; attempts < 50 && !await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`); attempts += 1) {
        if (await evaluate("document.getElementById('i-next').disabled")) break;
        await evaluate("document.getElementById('i-next').click()");
      }
      await check(`Ficha accesible: ${item.id}`, `!!document.querySelector(${JSON.stringify(selector)})`);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      assert.deepEqual(client.errors, [], `Error al abrir ${item.id}`);
      await check(`Detalle, riesgos y fuentes: ${item.id}`, "!document.getElementById('i-selected').hidden && document.getElementById('i-detail').textContent.includes('Riesgos')");
      const currentFee = item.fees.find(fee => fee.kind === "annual-assets-pct" && fee.status === "published-current" && fee.value != null);
      if (currentFee && item.fees.some(fee => fee.kind === "annual-assets-pct" && fee.status === "published-maximum")) await check(`Tarifa actual no se suma al maximo: ${item.id}`, `Number(document.getElementById('i-annual-fee').value) === ${currentFee.value}`);
      if (item.fees.some(fee => fee.kind === "performance-pct" && fee.value > 0)) await check("Comision sobre rendimientos cargada por separado", "Number(document.getElementById('i-performance-fee').value) > 0");
      if (/\bFCL\b/i.test(item.name)) await check("FCL conserva su tratamiento laboral separado", "document.getElementById('i-tax-mode').value === 'none'");
      const knownCurrency = item.currency !== "MULTI" || item.category === "broker";
      if (!knownCurrency) await check("Una moneda sin confirmar no se representa como USD", "document.getElementById('i-form').hidden && !document.getElementById('i-currency-warning').hidden && document.getElementById('i-selected-currency').textContent.includes('confirmar')");
      const enoughTerms = knownCurrency && (item.category !== "term-deposit" || item.termDays || item.rateTiers?.some(tier => tier.termDays));
      if (enoughTerms) {
        await evaluate("if (!document.getElementById('i-rate').value) document.getElementById('i-rate').value = '5'; document.getElementById('i-form').requestSubmit()");
        await check(`Proyeccion explicita: ${item.id}`, "document.getElementById('i-error').hidden && !!document.querySelector('#i-results svg')");
      }
      if (fixtureMode && item.category === "equity-fund") {
        await evaluate("document.getElementById('i-use-history').click(); document.getElementById('i-form').requestSubmit()");
        await check("Historico geometrico mantiene base neta sin doble comision", "document.getElementById('i-net-fees').checked && document.getElementById('i-rate-note').textContent.includes('2023–2025')");
        await evaluate("document.querySelector('#i-results button').click()");
      }
      if (fixtureMode && item.category === "term-deposit") {
        await check("Rango de plazo y pago mensual visibles", "document.querySelector('#i-tier option').textContent.includes('31–89') && document.querySelector('#i-tier option').textContent.includes('mensual')");
        await evaluate("document.getElementById('i-deposit-days').value = '60'; document.getElementById('i-form').requestSubmit()");
        await check("Plazo elegido dentro del tramo se utiliza", "document.getElementById('i-error').hidden && document.getElementById('i-results').textContent.includes('Plazo: 60')");
      }
      if (item.category === "broker" && item.transferRoutes?.length) {
        await evaluate("document.getElementById('i-transfer-route').value = '0'; document.getElementById('i-transfer-route').dispatchEvent(new Event('change'))");
        await check("Una ruta no suma todos los bancos", `Number(document.getElementById('i-transfer-pct').value) === ${item.transferRoutes[0].transferPct} && Number(document.getElementById('i-transfer-base-fixed').value) === ${item.transferRoutes[0].transferBaseFixed}`);
      }
    }
    await evaluate("document.getElementById('i-search').value = ''; document.getElementById('i-search').dispatchEvent(new Event('input')); scrollTo(0,0)");
    await screenshot("inversiones-escritorio");
    await route("fuentes");
    await check("Cobertura y fuentes offline", "document.getElementById('coverage-list').children.length > 0 && document.querySelectorAll('.source-item').length > 0");
    await dimensions(390, 844);
    for (const view of ["inicio", "hipoteca", "alquilar", "inversiones", "fuentes"]) {
      await route(view);
      await check(`Sin desborde horizontal movil: ${view}`, "document.documentElement.scrollWidth <= innerWidth + 1");
      if (["inicio", "hipoteca", "inversiones"].includes(view)) await screenshot(`${view}-movil`);
    }
    await navigate(pathToFileURL(path.join(site, "libro", "index.html")).href);
    await check("Libro HTML local con regreso al sitio", "!!document.querySelector('nav a[href=\"../index.html\"]') && document.body.textContent.includes('Capítulo')");
    await offline(false);
    server = http.createServer((request, response) => {
      const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/mi-proyecto\//, "");
      const target = path.resolve(site, relative || "index.html");
      if (!target.startsWith(site + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
      const types = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml"};
      response.writeHead(200, {"Content-Type": (types[path.extname(target)] || "application/octet-stream") + "; charset=utf-8"});
      fs.createReadStream(target).pipe(response);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = `http://127.0.0.1:${server.address().port}/mi-proyecto/index.html`;
    await navigate(address + "#inversiones");
    await check("Subdirectorio de proyecto compatible con Pages", "document.getElementById('data-error').hidden && document.getElementById('i-catalog').children.length > 0");
    await check("Sin almacenamiento de escenarios", "localStorage.length === 0 && sessionStorage.length === 0");
    report.externalRequests = client.requests.filter(url => /^https?:/.test(url) && !url.startsWith(`http://127.0.0.1:${server.address().port}/`));
    report.errors = client.errors;
    report.downloads = client.downloads;
    assert.equal(report.externalRequests.length, 0, "La pagina realizo solicitudes externas.");
    assert.deepEqual(client.errors, [], "Errores de navegador/CSP.");
    assert.ok(client.downloads.includes("amortizacion-hipoteca.csv"), "No se inicio la descarga CSV.");
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.failure = error.stack;
    report.errors = client?.errors || [];
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.call("Browser.close").catch(() => {});
      client.socket.close();
    }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (browser && browser.exitCode === null) {
      await Promise.race([new Promise(resolve => browser.once("exit", resolve)), delay(3000)]);
      if (browser.exitCode === null) browser.kill();
    }
    for (const owned of [profile, site]) {
      if (fs.existsSync(owned)) {
        try { fs.rmSync(owned, {recursive: true, force: true, maxRetries: 5, retryDelay: 500}); }
        catch (error) { report.cleanupWarning = `${owned}: ${error.message}`; }
      }
    }
    fs.writeFileSync(path.join(work, "resultado.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
