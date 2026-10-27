# Actualización trimestral del catálogo

El sitio usa una **fotografía local**, no consulta bancos ni reguladores al abrirse. Cada corte tiene `asOf` y una próxima revisión tres meses después. La advertencia de vencimiento aparece automáticamente, pero **los datos solo cambian mediante revisión manual**.

## 1. Conservar y delimitar

Conserva el corte anterior en `datos\historico` y una copia de seguridad antes de editar. Trabaja sobre los cuatro fragmentos, no sobre `mercado.js`: el compilador reemplaza los archivos integrados.

Usa una nueva fecha de corte común en los cuatro `asOf`. Mantén las fechas reales de lectura de cada fuente (`accessedOn`), del documento (`documentDate`) y de revisión del producto (`reviewedOn`). No actualices esas fechas en masa si no volviste a revisar el contenido. Un documento antiguo no adquiere vigencia por haberlo descargado hoy.

## 2. Reconciliar los universos oficiales

Revisa los registros de SUGEF, SUGEVAL/RNVI, SUPEN y la Bolsa Nacional de Valores. Compara altas, bajas, fusiones, cambios de nombre, fondos en liquidación y productos suspendidos. Banco, SAFI, puesto de bolsa y operadora no son intercambiables. Un registro no garantiza que el producto siga abierto a nuevas inversiones.

Mantén en `coverage` el universo de referencia, sus fuentes y las brechas. Si no se logra enumerar un universo, usa `universeCount: null`; no lo reemplaces por la cantidad de productos recuperados. No interpretes la falta de una página pública como la inexistencia del producto.

## 3. Revisar las fuentes y las condiciones

Consulta el **contenido primario**, no solo un resultado de búsqueda. Conserva en tu archivo privado la evidencia necesaria; publica aquí resúmenes y datos con referencia, no copias completas de documentos ajenos sin permiso. Los enlaces externos no son necesarios para que el catálogo local funcione.

| Área | Revisión mínima |
|---|---|
| Hipotecas | Moneda, vigencia de promoción, tasa «desde» o exacta, fases, referencia y margen, pisos/techos, plazo, porcentaje de financiamiento, mínimos/máximos, requisitos, apertura, avalúo, seguros y penalización |
| Referencias | Valor y **fecha observada** de TBP, PRIME y tipo de cambio; no confundir fecha de descarga con fecha del indicador |
| Cuentas y CDP | Monto y plazo de cada tramo, base 360/365, tasa nominal/efectiva, pago de intereses, retención, mínimos, liquidez y comisiones |
| Fondos | Identificador RNVI, moneda, actividad, prospecto y versión, liquidez, riesgos, comisiones actuales frente a máximas, aportes/retiros y series del mismo fondo |
| Pensiones | Régimen y moneda, comisión sobre patrimonio/aporte/rendimiento, reglas de retiro y base de las series. No modelar IVM como cuenta individual ni confundir FCL con pensión |
| Bróker | Países admitidos, entidad contractual, plan Pro/Lite, comisiones por mercado/orden, cambio de moneda, fondeo y retiro, costos de banco/corresponsal/recepción |
| Impuestos | Régimen aplicable, exenciones, fecha y fuente. No aplicar una tasa universal a todos los instrumentos |

Si una fuente está bloqueada, busca otra ruta oficial razonable. Si sigue sin poder leerse, registra `blocked` o `unavailable`, explica la brecha y conserva `null` para el dato desconocido. **Cero solo significa cero cuando existe respaldo**; un cero editable del simulador puede significar un costo excluido, y la interfaz debe decirlo.

Para una promoción vencida usa `historical` y `validUntil`. Para una hipoteca sin tasa completa usa `quote-required` y `rates: []`; no inventes una tasa media del banco. No atribuyas a la institución los supuestos del usuario.

## 4. Preservar el significado de las cifras

- `maxLtv` es una fracción: `0.80` significa 80 %. Los porcentajes de tasas y comisiones usan puntos porcentuales: `8.5` significa 8,5 %.
- `fromMonth` empieza en 1. Las fases deben ser consecutivas; `toMonth: null` significa hasta el final. No rellenes una fase desconocida con la tasa inicial.
- Anota la base de cada comisión y su moneda. Distingue tarifa actual, máximo contractual, estimación y cotización pendiente. No sumes rutas alternativas de transferencias como si todas se cobraran por un solo envío.
- No copies una tasa actual como observación histórica. Conserva periodo, medida, moneda, base bruta/neta y fuente de cada dato.
- `calendar-year` requiere un año completo. `trailing-12-month`, `annualized-period`, `year-to-date` y `quoted-rate` **no son años calendario independientes**. Ventanas superpuestas no forman una serie anual.
- La historia debe pertenecer al instrumento correcto. Un índice, otro fondo, una clase distinta o un régimen diferente no son sustitutos.
- Un prospecto se marca `read` solo si su contenido fue revisado; `partial` si la revisión fue parcial. El enlace por sí solo no acredita lectura. Añade notas concretas y fecha de versión cuando exista.
- Si la rentabilidad ya descuenta administración o impuestos, conserva `returnBasis`; evita descontarlos otra vez en la proyección.

## 5. Compilar y comprobar localmente

Con Node.js 22 o posterior, desde la raíz de este sitio:

```powershell
npm run datos
npm test
npm run check
```

El compilador comprueba estructura, identificadores, fuentes, fases y relaciones, combina los fragmentos y crea:

- `datos\mercado.json`, para inspección y descarga.
- `datos\mercado.js`, para que la web funcione directamente con `file://`, sin peticiones de red.
- `datos\historico\AAAA-MM-DD\mercado.json` y `manifest.json`, con fechas, conteos y SHA256.

Un error de validación **no autoriza a cambiar un dato para que pase**: revisa la evidencia y corrige su representación. Las pruebas verifican cálculos y consistencia; no certifican la veracidad ni vigencia de una publicación bancaria.

Si corriges un error del mismo corte **antes de publicarlo**, revisa el cambio y ejecuta:

```powershell
npm run datos -- --revisar-corte
```

No uses esa opción para borrar silenciosamente un corte ya publicado. Una corrección posterior debe tener un nuevo corte y una explicación rastreable en el historial del repositorio.

## 6. Revisión humana y publicación

Abre `index.html` sin conexión y revisa una hipoteca con cambio de tasa, una ficha sin tasa pública, una comparación de alquiler, un CDP, un fondo, una pensión y una ruta internacional. Comprueba que las monedas, los mínimos, los periodos y las etiquetas bruto/neto concuerdan con las fuentes. Revisa también la vista móvil.

En **Datos y fuentes**, confirma conteos, brechas y próxima revisión. Compara los resultados de al menos una oferta con una cotización real: una diferencia relevante puede revelar seguros, comisiones o convenciones que el modelo todavía no representa.

Publica juntos los fragmentos, el catálogo integrado, el nuevo corte y cualquier ajuste de interfaz necesario. Nunca incluyas cotizaciones con identificación personal, números de cuenta, capturas de banca, claves, estados de cuenta ni CSV de usuarios.

## Convenciones y límites de los modelos

**Hipoteca.** Cuotas mensuales vencidas, tasa nominal anual/12 y redondeo a centavos. Al cambiar una tasa se recalcula sobre el saldo y el plazo contractual restante. Los abonos extra reducen el saldo/plazo; el banco puede pactar otra modalidad. Vida se aproxima sobre saldo e inmueble sobre precio; edad, valor asegurable y coberturas pueden cambiar el resultado. Cierre financiado incluye la comisión sobre el principal ampliado. El porcentaje de presupuesto es personal, no una regla universal de SUGEF.

**Vivienda.** Los tres caminos parten del mismo ahorro y presupuesto. Los gastos se pagan antes de comprar al cierre del mes en que se alcanza la prima. Los faltantes se informan y restan del patrimonio: no representan un crédito aprobado ni incluyen intereses por financiarlos. Una compra futura reutiliza las condiciones actuales como supuesto. No se incluyen todos los impuestos de venta, mudanzas o subsidios.

**Depósitos.** Los intereses del primer plazo se calculan con los días y la base elegidos. Se distinguen rangos de plazo y forma de pago; si son cupones mensuales, la suma no significa que todo se pague al vencimiento. La proyección posterior utiliza un equivalente anual después de la retención modelada y supone reinversión a la misma tasa; no reproduce el calendario real de contratos sucesivos ni garantiza retiro antes de vencimiento. No se agregan aportes a un CDP existente. Si falta un plazo público, exige ingresar el de una cotización. Una convención de capitalización no confirmada permanece como supuesto explícito.

**Inversión.** Rendimiento anual efectivo convertido a mensual; una tasa nominal se convierte suponiendo capitalización mensual, salvo el CDP con su plazo. Aportes al final del mes; dinero pendiente de un envío agrupado no obtiene rendimiento. Los costos de entrada se descuentan del aporte. La administración ya incluida en una rentabilidad neta no se cobra dos veces. El modelo permite retención mensual, anual, al final o sobre dividendos supuestos; no decide cuál corresponde legalmente. No modela liquidación por saldo mínimo, deuda por comisiones superiores al patrimonio ni todas las tarifas variables.

**Internacional.** Los importes fijos deben estar en la moneda de la proyección. Verifica qué parte de un cargo bancario es fija, porcentual, mínima o máxima. Los costos de cambio de entrada/salida no son un pronóstico del tipo de cambio. Una meta en otra moneda tiene riesgo adicional. El régimen tributario individual y sucesorio requiere revisión especializada.

Las rutas autocargables de `transferRoutes` son únicamente envíos completos salientes de una moneda. Su fórmula es `transferFixed + min(transferMaximum, max(transferMinimum, monto × transferPct / 100 + transferBaseFixed))`; `transferMaximum: 0` significa sin tope. Es importante distinguir un fijo dentro del límite (BN) de otro sumado después (SWIFT BCR o Full Value). No conviertas una fila de recepción o un componente aislado en una ruta de fondeo. Los costos del retiro y recepción final se ingresan aparte.

La comisión sobre rendimientos positivos usa un devengo mensual simplificado y no un porcentaje del patrimonio. No se vuelve a restar si el rendimiento ingresado ya es neto. Las etiquetas estadísticas «nominal» frente a «real» (sin/con ajuste por inflación) **no** equivalen a `rateBasis: nominal` frente a `effective` (convención de capitalización de una tasa).

La tarifa actual y el máximo contractual de un mismo tipo no se suman. Para autocargar un tipo de comisión se prioriza la tarifa actual; si falta, se usa el máximo documentado, identificado como tal, y después una estimación. Si una revisión introduce varias comisiones del mismo tipo, comprueba que realmente sean acumulables y no series, canales o alternativas.

Los planes INVU con ahorro previo solo simulan la etapa de préstamo, con reconocimiento explícito de ese requisito y los plazos permitidos; no se usan en la comparación de alquiler, que no reproduce su contrato de ahorro. CredINVU y otras líneas directas se distinguen de esos planes. Las penalizaciones escalonadas recuperadas se aplican por etapa; fuera de su período documentado, un costo omitido se advierte y debe cotizarse.

`MULTI` no autoriza a convertir una ficha sin moneda publicada en USD. Esas fichas agrupadas se pueden consultar, pero no proyectar. La excepción explícita es el escenario del bróker internacional, denominado en USD. Las monedas identificadas —incluida CAD cuando corresponda— conservan su propio código.
