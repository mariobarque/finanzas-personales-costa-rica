# El método aburrido — libro y herramientas para Costa Rica

**Abre `index.html` con doble clic.** El libro, los datos y las calculadoras funcionan sin conexión. No necesitas instalar nada, iniciar sesión ni ejecutar un servidor.

Esta carpeta es un sitio estático, preparado para publicarse en GitHub Pages. No contiene un servicio bancario ni una recomendación de inversión. Los datos públicos y los supuestos editables se distinguen en cada ficha. La sección **Datos y fuentes** muestra la cobertura y las brechas: no se afirma que todas las condiciones, prospectos o series del mercado estén disponibles.

## Qué incluye

- Libro V2 en HTML y PDF, con portada y navegación local.
- Hipotecas: fases fijas y variables, referencias editables, límites y requisitos publicados, cierre financiado o pagado, seguros, abonos extraordinarios, presupuesto, riesgo cambiario y comparación entre ofertas.
- Alquiler y compra: comprar ahora, ahorrar una prima objetivo mientras alquilas o seguir alquilando, con los mismos recursos y horizonte.
- Catálogo de cuentas, depósitos, pensiones, fondos y bróker. Fichas con fuentes, costos, liquidez, prospectos e históricos recuperados; proyección con aportes, impuestos, comisiones, envíos agrupados e inflación.
- Archivos JSON legibles, copia JavaScript para uso offline y cortes históricos con suma SHA256. No hay actualización automática.

Las referencias a bancos e instrumentos no implican patrocinio. Que una institución figure en el inventario no significa que se hayan recuperado todos sus productos o que ofrezca crédito hipotecario.

## Publicar gratis en GitHub Pages

1. Crea en tu cuenta de GitHub un repositorio **público**. Con GitHub Free, esta es la modalidad gratuita habitual de Pages. No subas documentos privados a ese repositorio.
2. Sube **el contenido de `Sitio_web`**, no toda la carpeta de investigación del libro. `index.html`, `.nojekyll`, `css`, `js`, `assets`, `datos` y `libro` deben quedar en la raíz del repositorio. Los archivos de documentación, scripts y pruebas también pueden incluirse; no son necesarios para visitar el sitio.
3. En **Settings → Pages → Build and deployment**, elige **Deploy from a branch**, rama **main**, carpeta **/(root)** y guarda.
4. Espera la publicación y abre la dirección indicada por GitHub: normalmente `https://TU-USUARIO.github.io/TU-REPOSITORIO/`.
5. Comprueba el libro, el PDF, las calculadoras y el catálogo en esa dirección. Los enlaces son relativos y también funcionan bajo el nombre del repositorio; no necesitan un dominio propio.

Guía oficial: <https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site>.

**No se ha creado un repositorio ni publicado nada automáticamente.** Revisa los permisos de publicación del libro y de sus citas antes de hacer público el contenido. Se incluyen resúmenes propios de condiciones financieras y referencias; no se redistribuyen aquí los prospectos completos ni los archivos de trabajo de la investigación.

## Actualización manual y comprobaciones

Para **visitar** el sitio no necesitas Node.js. Para **regenerar y comprobar** el catálogo necesitas Node.js 22 o posterior; no hay paquetes que instalar.

Desde esta carpeta:

```powershell
npm run datos
npm test
npm run check
```

Consulta [`ACTUALIZACION.md`](ACTUALIZACION.md) para el procedimiento trimestral. No basta con cambiar la fecha: las fuentes, condiciones y brechas deben revisarse.

Opcionalmente, `npm run test:browser` comprueba la interfaz offline y bajo un subdirectorio como Pages, usando Edge instalado en Windows y un perfil temporal propio. En otro equipo puedes indicar la ruta de un navegador Chromium con la variable `EDGE_PATH`. El comando deja capturas y un resultado JSON en una carpeta temporal; no publica ni envía datos. La variante `npm run test:browser -- --fixture` usa datos ficticios únicamente dentro de una copia temporal, nunca en el catálogo público.

Para probar mediante HTTP, opcionalmente:

```powershell
npm run dev
```

Abre `http://127.0.0.1:8080`. El servidor solo escucha en tu equipo. Finalízalo con Ctrl+C. GitHub Pages no ejecuta este servidor ni los scripts de Node.

`npm run libro` copia de nuevo el HTML, el PDF y la portada desde `..\Libro\Revision_v2` y `..\Libro`. No modifica los originales. Si mantienes solo este repositorio, conserva las copias ya incluidas en `libro` y `assets`; no necesitas ejecutar ese comando.

## Estructura

| Ruta | Uso |
|---|---|
| `index.html`, `css`, `js` | Interfaz y modelos de cálculo, sin bibliotecas remotas |
| `libro`, `assets` | Copias públicas del libro y recursos visuales |
| `datos\hipotecas.json` | Investigación hipotecaria |
| `datos\depositos.json` | Cuentas, depósitos e inventario financiero |
| `datos\fondos.json` | Fondos, prospectos y observaciones históricas |
| `datos\pensiones-broker.json` | Pensiones, bróker y transferencias |
| `datos\mercado.json`, `datos\mercado.js` | Catálogo integrado utilizado por la aplicación |
| `datos\historico\AAAA-MM-DD` | Copia de cada corte y su manifiesto |
| `datos\schema.json` | Contrato de datos |
| `scripts`, `test` | Generación, comprobaciones y pruebas |

## Límites importantes

Las cuotas son aproximaciones, no cotizaciones ni aprobaciones. No se inventan tasas bancarias donde falta evidencia: se pide la cotización. Las referencias variables futuras se mantienen constantes salvo el escenario de aumento elegido. Los costos no publicados son supuestos visibles.

La proyección no reproduce volatilidad, insolvencia, cambios tributarios o la secuencia real de rendimientos. Tres años comparables permiten calcular un crecimiento observado, no prometer que se repetirá. No se convierte la historia del S&P 500 en historia propia de un fondo nuevo.

Los impuestos son una simulación, no una determinación de obligaciones personales. La liquidez del resultado no está garantizada: el ROP, las pensiones voluntarias, los CDP y los fondos cerrados tienen reglas distintas.

Tus cifras se procesan solo en el navegador y no se conservan automáticamente. No se usa analítica ni servicios externos de cálculo. Los CSV que descargues pueden contener datos personales: no los subas al repositorio público.
