"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const {validate} = require("./compilar-datos.cjs");
const root = path.resolve(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "datos", "mercado.json"), "utf8"));
validate(data);
const context = {globalThis: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, "datos", "mercado.js"), "utf8"), context, {timeout: 2000});
assert.equal(JSON.stringify(context.globalThis.MERCADO), JSON.stringify(data), "JSON y JS offline difieren.");
for (const relative of ["index.html", path.join("libro", "index.html")]) {
  const filename = path.join(root, relative);
  const html = fs.readFileSync(filename, "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, `${relative}: IDs repetidos.`);
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = match[1].replace(/&amp;/g, "&");
    if (/^(https?:|data:|mailto:)/.test(url)) continue;
    const [target, fragment] = url.split("#");
    const local = target ? path.resolve(path.dirname(filename), decodeURIComponent(target)) : filename;
    assert.ok(local === root || local.startsWith(root + path.sep), `${relative}: enlace fuera del sitio ${url}`);
    assert.ok(fs.existsSync(local), `${relative}: recurso ausente ${url}`);
    if (fragment && path.extname(local) === ".html") {
      const other = fs.readFileSync(local, "utf8");
      assert.ok(other.includes(`id="${fragment}"`), `${relative}: ancla ausente ${url}`);
    }
  }
  assert.ok(!/<script[^>]+src="https?:/i.test(html), "Dependencia de script remoto.");
  assert.ok(!/<link[^>]+href="https?:/i.test(html), "Dependencia remota de estilo.");
}
const main = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(main.includes("connect-src 'none'"), "La aplicacion no bloquea conexiones de datos externas.");
const pdf = fs.readFileSync(path.join(root, "libro", "el-metodo-aburrido-v2.pdf"));
assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
assert.ok(fs.existsSync(path.join(root, ".nojekyll")));
console.log(`Sitio consistente: ${data.mortgages.length} hipotecas, ${data.investments.length} productos, archivos y anclas locales presentes.`);
