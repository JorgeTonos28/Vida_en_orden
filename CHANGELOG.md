# Historial de cambios

## Revisión de autorización obligatoria en el motor · 2026-11-25

- commit exige autorizador y valida su resultado completo/vigente, release y huella antes de toda ejecución nueva; ausencia, excepción o datos inválidos deniegan writes_disabled sin efectos. El lote SQL no acepta un deadline nulo y audita la autorización atómicamente.
- Regresiones directas y MCP, comparación de todas las tablas ante denegación, permiso firmado más aprobación independiente, tarea/gasto ficticios y recuperación idempotente de recibos tras cierre. Fixtures legítimos usan la política criptográfica real y reloj vigente; no hay bypass de tests.
- Main0162720 incorpora #17; cadena pendiente #18 → #19, con nueva revisión/CI requeridos. Procedimiento mínimo de QA alojada documentado sin habilitar cierres, crear Sites, instalar permisos ni desplegar. Actualización personal mantiene su gate administrativo de respaldo/ledger.

## Ensayo nativo local de actualización y recuperación · 2026-11-25

- Nuevo verify:upgrade en CI/AGENTS: export/restore con Wrangler LOCAL en dos D1 ficticias, ledger 8→13 con solo cinco pendientes y repetición sin cambios, todas las filas/vistas preservadas, 48 tablas/54 triggers/índice0012. Incluye historia de 2.100 movimientos y 5.000 eventos de auditoría; sin purga para sortear límites.
- D1 foreign_key_check y comprobación SQLite del SQL exportado; documentada denegación nativa de integrity_check. No se certifican integridad física ni backup/ledger de Sites.
- Regresión nativa de fallo tras CREATE INDEX de 0012 en un fixture temporal: revierte DDL/ledger, preserva filas/vistas y permite reintentar solo la pendiente. Migraciones compartidas intactas. Reconsulta nativa de QA confirma owner exclusivo, versión 1 y 18 tablas de negocio vacías.
- Runbook de fase2, rollback conservador y solicitud administrativa de soporte preparados. Sin SQL nuevo, despliegue, cambio de instalación, envío a soporte o activación. Actualización productiva pendiente de respaldo recuperable/ledger/ensayo soportados y autorización.

## Control QA preparado, sin activación · 2026-11-25

- Permiso administrativo WebAuthn temporal ligado a Site, origen, instalación, propietario, release y catálogo. Ceremonia humana separada que solo devuelve el artefacto; no instala permisos ni abre negocio. Cierres públicos false/null preservados, vencimiento SQL y huella de autorización auditados atómicamente.
- 43 operaciones y 55 ejecuciones por motor SQLite/D1 con datos y firmas sintéticos, comprobación del delta completo, lectura posterior e idempotencia. Corregida entityId de task.duplicate para referencias a su copia. Regresión de límite de 2 MiB sin truncar datos.
- 182 pruebas locales aprobadas; sin nuevas migraciones ni despliegue. Análisis de riesgos, matriz por operación y continuidad actualizados. Activación, firma humana propia y ejecución alojada siguen bloqueadas por revisión/autorización independientes.

## Diagnóstico tipado de referencias · 2026-11-25

- Los servicios de dominio identifican referencias ausentes/no disponibles mediante DomainReferenceError, conservando mensajes UI. Propuestas devuelven reference_not_found/404 uniforme sin revelar existencia ajena. No se reclasifican errores de infraestructura por texto.
- Tres regresiones nuevas: revisión tras aprobación criptográfica conservando head/huella/evidencia/autorización, referencias entre módulos y errores desconocidos.169 pruebas locales; Worker exige el error tipado y conserva APPROVED.
- Sin SQL nuevo, cambios contables, habilitación ni despliegue. Seguimiento de entregas y bloqueos: docs/DELIVERY_READINESS.md.

## Issue #15: QA nueva privada hasta 0012 · 2026-11-25

- Validado main d193562/CI y clon nuevo:166 pruebas/suite completa aprobadas. Proyección freshInstallationOnly auditada,13 SQL/48 tablas/54 triggers/índice0012, sin copiar datos ni configuración de otras instalaciones.
- Propietario autorizó crear/publicar/configurar únicamente QA nueva. Versión1/entorno 1 owner-only, plugin nuevo/44 herramientas/31 lecturas, health y preparación/revisión/cancelación/idempotencia aprobados alojados. Cero negocio/staging/ejecuciones; commit writes_disabled. Sin credencial WebAuthn transferida ni firma nueva.
- Worker local ampliado con regresiones de revisión fallida/conservación de aprobación, cancelación obsoleta, reload HTTP e idempotencia original. Guías/aceptación/continuidad corregidas, sin cambios funcionales de aplicación ni SQL; aclarada etiqueta horaria documental del informe anterior sin cambiar registros.
- Pendientes: recarga/reconexión visual, cuotas/carga, diagnóstico de referencia inexistente genérico y canal humano propio antes de activación futura. Issue #13 sigue abierta; no se modificaron instalaciones existentes ni se habilitó negocio MCP. Ver docs/ISSUE15_QA_ACCEPTANCE_REPORT.md.

## Issue #13: recuperación y ensayo aislado de0012 · 2026-11-24

- Main767f71f contiene #4–#12 con aprobación/CI.31 lecturas del desarrollo verificadas otra vez, identidad exclusiva y ejecución MCP denegada; no se modificó ningún Site ni la instalación personal.
- Copia lógica propia de48 tablas/18filas cifrada fuera de Git, dos pasadas iguales/descifrado verificado. Restauración local con54 triggers, identidad/evidencia/firma archivada conservadas;0012 crea índice sin cambiar filas. No sustituye snapshot nativo/ledger/copia separada ni prueba cuotas del host.
- Arnés solo SQLite en memoria, cuatro regresiones ficticias y test:recovery obligatorio en CI/AGENTS.166 pruebas, suite completa aprobada; documentación de aceptación, continuidad y rollback actualizada.
- Actualización de desarrollo bloqueada por respaldo nativo/ledger y pendiente de autorización administrativa. Negocio MCP cerrado y exposición histórica sin resolver. Detalles y resultados: docs/ISSUE13_ACCEPTANCE_REPORT.md.

## Auditoría PR #12: revisión atómica y crecimiento de auditoría · 2026-11-24

- revise prepara sin revocar la vigente; publica nueva revisión, invalidación, autorización/desafíos, auditoría y head en un batch CAS. Fallos de preparación/publicación conservan la anterior; carreras no sobrescriben commit/cancel/approve/otra revisión. Evidencia histórica preservada; limpieza fallida conserva lease sin ocultar éxito/error.
- audit_log histórico deja de contarse/copiarse al snapshot. Solo un marcador de contexto por owner, con índice cubriente nuevo 0012; eventos nuevos siguen firmados/append-only. No se borra historial ni se recorta estado financiero. Las otras 17 tablas mantienen límite fuente 2.000; escalabilidad completa sigue pendiente.
- 16 regresiones nuevas y D1/workerd ampliado; 162 pruebas locales aprobadas. ORM/snapshot/journal actualizados sin editar SQL 0000–0011. Health aclara el alcance del presupuesto; lecturas MCP originales y ejecución deshabilitada se conservan.
- Corrección propuesta en la misma rama/PR, sin despliegue ni merge. Conformidad de auditoría pendiente. Ver PR12_AUDIT_FOLLOWUP para migración, rollback, pruebas y límites; no se declara paridad lista para producción.

## Firma humana real verificada · 2026-11-24

- El propietario firmó personalmente una propuesta ficticia vigente mediante su autenticador. MCP mostró APPROVED para la misma revisión/huella; D1 conserva aprobación/evidencia WebAuthn ligadas a owner, clave fijada, origen y desafío. Nonce consumido y firma dentro del TTL.
- Commit de la propuesta aprobada devolvió writes_disabled. Verificación posterior: cero tarea/workspace/ejecuciones, revisión de negocio 0 y referencias vacías. La primera propuesta había expirado sin firma; no se extendió ni reutilizó su TTL.
- UAT de aprobación y compuerta actualizados como aprobados. Solo documentación/trazabilidad; no se modifica código, SQL, política global ni habilita negocio. Evidencia/identificadores permanecen privados. Revisión/integración, habilitación posterior y aceptación de ejecución futura siguen pendientes; fase 7 no se declara completa.

## Registro humano y conexión del MCP de desarrollo · 2026-11-24

- El propietario completó el registro del autenticador tras la corrección 5359d43. Se comprobó nonce consumido/propietario y metadata_version=1. Solo su clave pública se fijó en una variable secreta del Site de desarrollo; redespliegue satisfactorio de la misma versión 2 con entorno 2, sin código/SQL nuevos.
- Plugin autenticado conectado:44 herramientas; perfil coincide con el registro, salud confirma esquema/metadatos y 54 triggers. Las 31 lecturas retornan22 respuestas válidas y 9 not_found esperados, sin fallos ni entidades creadas. Reporte vacío consistente, texto no confiable sin aprobación/efectos y preparación idempotente verificados.
- La primera propuesta ficticia caducó sin firma; requiere un enlace vigente y firma personal. Registrar una credencial no aprueba propuestas. Negocio MCP permanece deshabilitado; no se cambian instalaciones personales ni se publica la credencial/ownerId. Ver DEVELOPMENT_PROGRESS y USER_ACCEPTANCE_TESTS.

## Registro inicial del autenticador · 2026-11-24

- El candidato de esquema del PR #12 se publicó en un Site privado nuevo: deployment satisfactorio, MCP provisionado y 48 tablas observadas. No se modificó una instalación personal.
- El propietario reportó «Falta migrar la base MCP» al registrar su autenticador antes de preparar una propuesta. Se reprodujo el 503 sobre la proyección nueva y se añadió una regresión HTTP antes de corregirlo.
- El POST de registro autenticado/CSRF válido usa ahora la misma comprobación de esquema y bootstrap atómico que prepare. GET, solicitudes denegadas y lecturas no inicializan. Esquema incompleto, versión futura y fallo de batch se deniegan sin efectos. El candidato no fija confianza ni habilita negocio.
- Ambas integraciones Worker prueban el orden real de instalación: registrar primero, preparar después. Código 5359d43: 146 aprobadas, TypeScript/lint/schema/build, auditorías sin hallazgos, D1 independiente y ambos Workers con 27 QA cada uno; CI y clon GitHub aprobados. Publicado en versión 2 del mismo Site privado, sin cambios de SQL. Reintento humano pendiente; no se deduce aceptación del deployment.

## Compatibilidad Sites: proyección y bootstrap · 2026-11-24

- Se conserva el SQL original 0000–0010 y se añade 0011, una columna de versión de metadatos. La exportación de un commit limpio genera un candidato Sites de solo esquema con hashes y sin Git/identidad ajenos; 0000–0007 permanecen idénticos.
- La primera preparación autenticada inicializa metadatos en batch atómico, conserva negocio/revisión/recibos y registra una única transición. Lecturas/salud no inicializan; payloads anteriores y metadatos futuros fallan cerrados.
- Las guardas de aprobación/commit verifican la versión. No se habilita negocio ni existe bootstrap SQL elegible por el modelo.
- 143 pruebas, schema/build/D1 y dos integraciones Worker (cadena completa y proyección Sites) aprobados en a05433d; 27 comprobaciones API/UI en cada modo. Ese candidato se publicó después; la aceptación humana continúa pendiente y reveló la regresión de registro descrita arriba.

## Corrección de dependencias y gate de publicación · 2026-11-24

- Se resuelven 33 entradas de auditoría (dos críticas) del lockfile basal: React/RSC, Next, Vinext/Vite, Cloudflare y transitivas compatibles. Auditoría actual: cero vulnerabilidades, sin force ni degradación de Drizzle. Ver DEPENDENCY_SECURITY.md.
- Migración real a Zod 4 con records explícitos y dispatcher tipado; conformance compara códigos/campos de validación. CI incorpora audit:dependencies.
- verify:hosting identifica 21 instrucciones de metadatos fuera del flujo de migración de esquema documentado de Sites y bloquea publicación. Se conserva SQL/triggers y se prepara consulta administrativa; no se afirma un rechazo del backend no observado.
- 138 pruebas locales aprobadas, instalación/build/ORM/D1/Worker y 27 comprobaciones API/UI aprobados. No se modifica ninguna instalación personal ni se habilita ejecución de negocio.

## Fase 7: integración reproducible y cierre técnico · 2026-11-24

- Verificación del Worker compilado por HTTPS loopback con D1 nueva, las 31 lecturas, WebAuthn sintético, CSRF, anti-framing, inscripción sin confianza y ejecución cerrada; 27 comprobaciones de la interfaz.
- Pruebas de D1/workerd con rollback forzado, equivalencia ORM/SQL/defaults y upgrade 0009→0010. verify:schema exige que Drizzle no genere cambios.
- Se corrigen recálculo de padres al mover subtareas, rechazo de ciclos anteriores y fechas de completado cerca de medianoche, con regresiones. Las denegaciones consumen cuerpos pequeños de forma acotada para conservar conexiones del Worker.
- Corrección de codificación en snapshots nuevos 0008–0010, sin cambiar/aplicar SQL destructivo. QA rechaza destinos remotos y redirects.
- Guías de actualización/rollback, aceptación y continuidad. No se habilitan escrituras, fusionan PR ni modifican instalaciones personales; aceptación humana real y exposición histórica siguen pendientes.

## Fase 6: límites, evidencia y recuperación · 2026-11-24

- JSON acotado por stream, UTF-8, profundidad, nodos y claves; fechas reales y búsquedas literales de 200 caracteres sin LIKE largo.
- Contexto de adjuntos texto/CSV/JSON sin fetch/OCR/ejecución y reporte interno de integridad sin conciliación bancaria externa.
- Evidencia WebAuthn durable, revocación antes del commit, idempotencia de preparación, expected_revision, leases y métricas sin contenido. Migración 0010 invalida planes antiguos y elimina solo staging previo.
- Efectos por acción e impacto financiero antes/después en la huella y revisión humana, con alertas de negativos/duplicados/futuros. Parches conservan campos omitidos.
- Catálogo predeterminado 31; opt-in completo 44. Escrituras reales siguen deshabilitadas.

## Fase 3B: transporte opcional y canal humano · 2026-11-24

- Diez herramientas de propuestas opt-in; el catálogo predeterminado sigue en 31 lecturas.
- Página de diff y aprobación owner-only con origen exacto, CSRF, versión mostrada y firma WebAuthn. El registro solo produce candidatos; no fija confianza automáticamente.
- Migración aditiva 0009 para desafíos de registro. Guía de configuración privada y aceptación humana.
- Fábrica y transporte mantienen ejecución MCP deshabilitada. Firmas sintéticas no equivalen a una prueba humana real.

## Fase 5: adaptadores financieros aislados · 2026-11-24

- 24 operaciones R2 con servicios existentes, centavos enteros, reservas, pagos, aportes y anulaciones, sin escritura real habilitada.
- Pruebas de concurrencia, idempotencia, redondeo, integridad contable y rollback completo ante fallas.
- Se corrige get_finance_report: netCashImpactMinor descuenta la comisión de transferencias propias, sin contar el principal como ingreso/gasto.
- Sin migración nueva, despliegue ni datos reales.

## Fase 4: adaptadores no financieros · 2026-11-24

- Catálogo cerrado de 19 acciones que usa los servicios compartidos y referencias locales entre operaciones.
- Validación de dependencias y devolución inequívoca de IDs, con pruebas de regresión.
- Reversión no financiera derivada de un recibo, con propuesta/aprobación nueva y sin cambios posteriores. Se conserva la auditoría.
- Sin migraciones nuevas, despliegues ni cambios de las 31 herramientas públicas.

## Fase 3: fundamento aislado · 2026-11-24

- Motor de propuestas inmutables con diff, SHA-256, caducidad, aislamiento, guardas de concurrencia, aprobación criptográfica y recibos idempotentes.
- Servicios existentes extraídos a contexto por request; preparación sobre staging particionado y commit atómico D1, sin duplicar cálculos financieros.
- Migración aditiva 0008 y registro Drizzle completado para 0006–0008. No se modifica ninguna instalación.
- Se inicia seguimiento continuo y guía de aceptación. El historial expuesto permanece como riesgo conocido; se suspende su sustitución.
- WebAuthn se comprueba con firmas sintéticas reales; falta prueba humana en plataforma. El catálogo público conserva sus 31 lecturas y la compuerta de negocio sigue cerrada.

## Auditoría histórica y preparación de fase 3 · 2026-11-24

- PR #3 integrado con revisión y CI satisfactorios; se distingue la fuente actual del historial todavía expuesto.
- Se retiran valores particulares del verificador y se añade auditoría genérica de fuente/objetos históricos, con regresiones y CI que no imprime valores sensibles.
- Se prepara un generador local de distribución sin antecesores, sin remotos y con comparación de árbol y hashes. No ejecuta reemplazos, publicaciones ni borrados remotos.
- Se documentan alcance, fork, diffs, cachés y procedimiento de Support, junto con el plan técnico de fase 3. No se implementan propuestas, aprobaciones, escrituras MCP ni migraciones nuevas.

## Instalación independiente: bootstrap vacío y validación integral · 2026-11-24

- Se retiran fixtures personales incrustados en tareas y la clasificación automática ligada a registros de origen. No se borran datos existentes ni se reescribe historia compartida.
- Se ejecutan las 31 herramientas MCP contra SQLite migrado, con datos ficticios y en vacío; se comprueban aislamiento, paginación, autorización y ausencia de escrituras.
- La auditoría de portabilidad rechaza el bootstrap heredado. QA V2 usa fechas relativas y comprueba que la primera escritura no carga tareas o proyectos ajenos.
- Sin migraciones nuevas ni cambios en los contratos MCP. Las fases 3 y posteriores permanecen pendientes.

Este es el changelog canónico del repositorio. `docs/CHANGELOG.md` se conserva como enlace documental para compatibilidad con la estructura transferida.

## Infraestructura de colaboración · 2026-11-24

- Se añadió la verificación reproducible de instalación independiente con D1 local temporal y migraciones `0000`–`0007`.
- Se documentó la separación entre repositorio público, Sites personales, datos, secretos, audiencia y despliegues.
- Se añadió la guía para un nuevo usuario de Codex y el procedimiento Sites↔GitHub.
- Se actualizó el flujo de ramas, pull requests, CI y revisión de la protección de `main`.
- No se cambió el Site personal, su audiencia, sus variables, su D1 ni su despliegue.

## Transferencia pública · 2026-11-24

- Se saneó el snapshot del Site de origen y se preparó para instalaciones independientes.
- Se añadió `AGENTS.md`, roadmap de siete fases, documentación de instalación, seguridad, despliegue, portabilidad y colaboración.
- Se añadió CI con pruebas MCP/financieras, TypeScript, lint, build y búsqueda de patrones de credenciales.
- No se incluyeron datos productivos, respaldos, secretos, identificadores privados ni historial Git interno.

## MCP Fase 2

- Catálogo de 31 herramientas de lectura con relaciones, filtros, reportes, auditoría, configuración y validación.
- Paginación acotada mediante cursores opacos y schemas cerrados.
- Escrituras MCP permanecen deshabilitadas.

## Nota de alcance

La mejora de infraestructura y portabilidad no completa ni adelanta la fase 3 del MCP.
