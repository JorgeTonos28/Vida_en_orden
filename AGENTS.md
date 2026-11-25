# AGENTS.md — Vida en Orden

## Propósito y fuente de verdad

Vida en Orden es una aplicación de tareas, planificación, áreas, proyectos, finanzas y bitácora con un servidor MCP hospedado en ChatGPT Sites.

- Este repositorio público es la fuente compartida de verdad para el código, contratos, migraciones, pruebas y documentación versionada.
- Cada instalación es la fuente de verdad de sus propios datos, usuarios, secretos, permisos y configuración de Sites.
- Nunca uses datos financieros, tareas, eventos, respaldos, logs o credenciales de otra instalación para desarrollar o probar.
- Al comenzar una sesión lee `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/ROADMAP.md` y la documentación específica del cambio.
- Inspecciona el código real, las migraciones y las pruebas antes de asumir que una función existe.
- No confundas fase funcional, commit GitHub, versión de Sites, deployment o release.

## Regla de seguridad principal

El MCP transferido es de solo lectura. No habilites escrituras de negocio, propuestas, aprobaciones ni restauraciones MCP como parte de una tarea ordinaria. La interfaz conserva `/api/action` por compatibilidad, pero el endpoint `/mcp` no debe invocarlo.

No publiques ni introduzcas:

- datos de producción o fixtures copiados de una instalación real;
- `.env`, `.dev.vars`, tokens, cookies, API keys, secretos, dumps, respaldos o logs privados;
- identificadores de Sites, cuentas, usuarios o proyectos privados de otra instalación;
- una ruta MCP de SQL arbitrario, CRUD genérico o autorización basada en argumentos del modelo.

Si detectas un secreto o dato personal, detén el trabajo, elimina el material de la copia propuesta, repite la auditoría y documenta el incidente. No reescribas historia compartida con `force push`.

No incrustes valores personales como patrones de un auditor: usa reglas genéricas y fixtures ficticios. Los informes públicos solo incluyen categorías, rutas y ubicación; los valores, espejos y diffs contaminados permanecen fuera de Git. Distingue siempre fuente actual saneada de historial público purgado.

Una retirada histórica requiere inventariar ramas, tags, PR, forks, Actions y cachés. Sigue `docs/HISTORY_SANITIZATION_PLAN.md`: prepara y prueba primero un candidato local sin red. Cualquier publicación de raíz nueva, reemplazo de historia, cambio de visibilidad o eliminación de repositorio/fork exige aprobación específica del objetivo y del procedimiento. No desactives ni omitas protecciones. No merges ni copies `.git` de clones anteriores a una distribución nueva.

## Ramas y pull requests

`main` representa la última versión integrada, estable y verificada.

La configuración deseada para `main` es: pull request obligatorio, CI obligatorio y satisfactorio, sin force-push ni eliminación de la rama, y revisión humana antes del merge. El estado efectivo de las reglas debe comprobarse en GitHub; si la cuenta no permite leer o modificar branch protection/rulesets, sigue el procedimiento manual de `docs/COLLABORATION.md` y no declares la protección aplicada.

Para cada cambio posterior a la inicialización:

1. Sincroniza `main` con `git fetch origin` y `git pull --ff-only`.
2. Crea una rama `feature/`, `fix/`, `docs/` o `chore/` con un alcance claro.
3. Inspecciona dependencias, migraciones, contratos y compatibilidad antes de editar.
4. Implementa el cambio mínimo necesario.
5. Ejecuta las pruebas pertinentes y una auditoría de secretos.
6. Actualiza `CURRENT_STATE.md`, `ROADMAP.md`, `CHANGELOG.md` y contratos afectados cuando corresponda.
7. Publica la rama y crea o actualiza un pull request hacia `main`.
8. Informa el enlace del PR, el commit, las pruebas, las migraciones, el rollback y los riesgos.

No hagas pushes directos a `main` después de la inicialización. No fusiones un PR sin comprobaciones satisfactorias y autorización del responsable. No uses `force push` sobre ramas compartidas.

## Calidad y pruebas

Como mínimo, antes de abrir un PR ejecuta:

```sh
npm ci
npm run audit:dependencies
npm run test:finance
npm run test:mcp
npm run test:audit
npm run test:recovery
npm run audit:public
npx tsc --noEmit
npm run lint
npm run verify:schema
npm run build
npm run verify:independent
npm run verify:worker
npm run verify:sites
npm run verify:upgrade
```

Añade pruebas proporcionales para:

- contratos MCP, JSON-RPC, paginación y límites;
- identidad, owner-only, scopes y aislamiento entre instalaciones;
- migraciones y recuperación en una base local aislada;
- reglas financieras, redondeo, transferencias, comisiones, reservas y no doble conteo;
- relaciones entre tareas, proyectos, movimientos, obligaciones y metas;
- compatibilidad de herramientas existentes;
- regresiones de la interfaz;
- detección de secretos y ausencia de efectos secundarios.

No declares aprobada una comprobación que no pudiste ejecutar. El script `scripts/qa-v2.mjs` modifica su entorno de prueba: nunca lo apuntes a producción.

`npm run verify:independent` debe ejecutarse después del build. Crea una base D1 local temporal, aplica todas las migraciones SQL contiguas desde `drizzle/0000` en orden y la elimina al terminar; no acepta ni necesita credenciales productivas.

`npm run verify:upgrade` no admite argumentos ni destinos: crea dos D1 locales temporales con datos ficticios, exporta/restaura mediante Wrangler nativo y conserva su ledger al aplicar solo las migraciones pendientes de fase 2. Nunca usa un Site, credenciales remotas o bases existentes. Borra sus dumps ficticios al finalizar. Su éxito no certifica un respaldo/ledger ni una actualización del servicio administrado de Sites; ver PHASE2_UPGRADE_REHEARSAL y SITES_ADMIN_SUPPORT_REQUEST.

`verify:schema` ejecuta Drizzle en una copia temporal y exige cero migraciones nuevas: detecta divergencia ORM/snapshot sin aplicar SQL. `verify:worker`, después del build, arranca el Worker compilado sobre HTTPS loopback y D1 temporal, prueba las 31 lecturas, aprobación criptográfica sintética, denegaciones y QA de la interfaz. Nunca usa un Site, D1 remota ni credencial real. `qa-v2.mjs` rechaza destinos que no sean loopback y redirecciones; conserva esa restricción.

`npm run audit:public` inspecciona la fuente versionada, sin imprimir valores detectados. Su modo `-- --history` inspecciona todos los objetos locales, también los inalcanzables; no demuestra por sí solo la retirada de refs o cachés del servidor. Mientras el saneamiento remoto esté pendiente, CI verde no equivale a historial limpio. El mandato del responsable del 24 de noviembre de 2026 autoriza implementar secuencialmente las fases 3–7 en ramas dependientes. El riesgo histórico no bloquea ese desarrollo y no se continúa la sustitución del repositorio. Las escrituras reales MCP siguen deshabilitadas hasta demostrar aprobación humana en la plataforma.

## Datos, migraciones y compatibilidad

- Las migraciones de `drizzle/` se aplican en orden y son parte del contrato de instalación.
- Prueba una migración en una base independiente antes de tocar una instalación existente.
- Una copia lógica de tablas no certifica un snapshot nativo consistente ni el ledger del host. Rechaza proyecciones truncadas; cualquier recuperación tipada de payload exige verificar identidad/revisión/owner/huella y conservar el estado persistido. `test:recovery` ensaya únicamente SQLite en memoria con datos ficticios. Nunca publiques capturas privadas ni uses el JSON de UI como respaldo completo MCP.
- Nunca ejecutes `migrate:fresh`, `DROP`, restauraciones o migraciones destructivas en producción sin autorización explícita.
- Prepara y verifica un respaldo cuando el cambio pueda afectar datos.
- No actives escrituras MCP al actualizar código, migraciones o el Site.
- Si dos instalaciones tienen versiones distintas, documenta la matriz de compatibilidad y el procedimiento de actualización/reversión.
- Una publicación de código no restaura ni cambia automáticamente datos de D1.

## Seguridad del MCP

- La identidad llega de Sites por headers autenticados; los argumentos de una herramienta nunca pueden elegir `userId`, propietario o scope.
- Toda ejecución nueva exige autorización válida dentro de `ProposalEngine.commit()`, también por llamada directa; el transporte no sustituye esa guarda. Los fixtures positivos usan permisos sintéticos firmados mediante la política real, sin bypass de tests. Recuperar un recibo ya confirmado es lectura y no vuelve a ejecutar negocio.
- El servidor debe fallar cerrado sin identidad o sin política de propietario.
- Las consultas MCP deben permanecer tipadas, acotadas, paginadas y de solo lectura.
- Las 31 lecturas conservan `readOnlyHint=true` y `destructiveHint=false`. Las herramientas opt-in de propuestas declaran sus efectos de metadatos con anotaciones correctas; no equivalen a escritura de negocio. Mantén `businessWritesEnabled=false` en fábrica y transporte hasta demostrar aprobación humana real en plataforma y revisión autorizada.
- La distribución compartida conserva `MCP_BUSINESS_WRITES_ENABLED=false` y `QA_EXECUTION_RELEASE_ID=null`. Un perfil privado QA armado requiere revisión independiente del artefacto, autorización administrativa específica y permiso WebAuthn propio ligado a proyecto/origen/D1/owner/release/catálogo. Nunca portar ese overlay o permiso a main u otra instalación; cada propuesta necesita además su aprobación humana. Ver QA_EXECUTION_SECURITY_REVIEW. Las firmas sintéticas solo prueban aislamiento local, no intención humana ni ejecución alojada.
- Reutiliza los servicios y cálculos de dominio existentes; no crees un segundo motor financiero.
- Una revisión prepara el reemplazo sin revocar la vigente y publica head/invalidación/autorización/desafíos/auditoría en un solo lote CAS. Si falla, conserva la anterior; ante carrera consulta estado. Una revisión en curso no equivale a cancelar.
- El presupuesto de preparación de 2.000 filas excluye el historial audit_log, pero no recorta ninguna de las otras 17 tablas. Su staging usa solo un marcador de contexto y eventos nuevos append-only; lecturas históricas nuevas requieren un conjunto explícito y revisión. Ver docs/PR12_AUDIT_FOLLOWUP.md; no borrar historia para eludir límites.
- No expongas secretos, SQL dinámico, datos de otros propietarios ni referencias cruzadas fuera del alcance autorizado.

## Publicación y Sites

Distingue siempre entre código implementado, probado, publicado en una rama, fusionado, guardado como versión de Sites, desplegado y verificado en producción.

- El `project_id`, bindings, secretos y audiencia pertenecen a cada instalación y no se comparten en el repositorio.
- El manifiesto versionado usa marcadores seguros; cada colaborador debe configurar su propio Site.
- Un merge en `main` no debe desplegar automáticamente la instalación personal de otro colaborador.
- Las actualizaciones de producción requieren autorización explícita, respaldo, validación y rollback.
- Si Sites no permite automatizar una parte del flujo, documenta el paso manual exacto; no lo simules.
- Para Sites genera la proyección con `prepare:sites` desde un commit público limpio y sigue `docs/SITES_METADATA_BOOTSTRAP.md`. Conserva los SQL originales; no modifiques migraciones aplicadas ni ledgers. Ejecuta `verify:hosting` en el checkout privado proyectado antes de publicar: debe quedar sin instrucciones fuera de esquema. No retirar triggers ni ignorar ese gate. CI local verde no certifica compatibilidad del host. El bootstrap solo ocurre en preparación o registro de autenticador explícitos y autenticados; GET, lecturas y denegaciones no inicializan. La integración debe probar registro antes de la primera propuesta, como la guía real.

## Colaboración por fases

Varios desarrolladores pueden trabajar en fases diferentes, pero cada PR debe declarar dependencias, contratos afectados, migraciones, pruebas y criterios de aceptación. Para incorporar un PR de otra fase:

1. revisa el diff y el commit base;
2. confirma que sus migraciones son compatibles y están completas;
3. prueba el PR en una instalación aislada;
4. resuelve conflictos preservando la semántica financiera y los alcances MCP;
5. ejecuta la suite completa antes de fusionar;
6. actualiza el estado y el roadmap sin avanzar una fase artificialmente.

Para recuperar una versión usa un commit o tag verificado, crea una rama de rollback y sigue el procedimiento de la instalación. No restaures una base productiva solo porque el código anterior compile.

## Definición de entrega

Un cambio está listo cuando el código, las pruebas, la documentación y el PR describen el mismo estado; la auditoría de seguridad no encuentra secretos; las migraciones y rollback están documentados; y la instalación original no fue modificada sin autorización.
