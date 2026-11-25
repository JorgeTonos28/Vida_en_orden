# Vida en Orden

Aplicación web para organizar tareas, subtareas, áreas, proyectos, eventos, bitácora y finanzas personales, con un servidor **Model Context Protocol (MCP)** integrado para consultar y, cuando exista autorización autenticada, proponer modificaciones desde ChatGPT.

Está construida con **React, Vinext/Next.js, Cloudflare Workers, D1 y Drizzle**. El transporte MCP se sirve desde `/mcp`. La aplicación conserva sus propias rutas de interfaz y negocio; **MCP no reutiliza `/api/action` para saltarse sus controles**.

> **Estado de referencia: 25 de noviembre de 2026.** El código de las fases 3–7 está **integrado y probado localmente**, pero **no significa que las escrituras MCP estén habilitadas en alguna instalación real**. Cada Site conserva versiones, permisos, datos y configuración independientes.

## Estado del proyecto

**Código oficial integrado:** [`502cbf3ba20d`](https://github.com/JorgeTonos28/Vida_en_orden/commit/502cbf3ba20dbc07d1baf4b0555199e780e02714) — [CI posterior aprobado](https://github.com/JorgeTonos28/Vida_en_orden/actions/runs/45687493796).

| Componente | Estado comprobado |
| --- | --- |
| Lecturas MCP | **31 herramientas** de lectura, con autorización, ámbitos privados/compartidos, filtros y paginación. |
| Propuestas y aprobaciones | **13 herramientas adicionales** de propuestas, seguimiento, aprobación y recibos, disponibles únicamente cuando el entorno y sus controles las exponen. |
| Catálogo de negocio | **43 tipos de operación** (tareas, planificación, eventos, finanzas y relaciones), cubiertos por pruebas con datos sintéticos. |
| Motor de ejecución | Diff, revisión/huella, WebAuthn, caducidad, concurrencia, idempotencia, auditoría y comprobaciones atómicas, **probados en SQLite/D1 locales**. |
| Pruebas del commit de referencia | **199 pruebas aprobadas**, sin omitidas; escenarios de las 43 operaciones y 55 ejecuciones por motor SQLite/D1. |
| Migraciones | `drizzle/0000`–`0012` (13 archivos SQL). La actualización incremental de fase 2 fue ensayada con respaldo/restauración **locales** y fallo/reintento. |
| Ejecución MCP alojada | **Pendiente** de habilitación específica y de firmas humanas reales para operaciones alojadas. |
| Actualización de instalaciones existentes | **Pendiente** de confirmar el procedimiento administrativo de backup, ledger y migración incremental soportado por ChatGPT Sites. |

El código compartido mantiene **`MCP_BUSINESS_WRITES_ENABLED=false`** y **`QA_EXECUTION_RELEASE_ID=null`**. No basta con publicar un build, cambiar una variable o aprobar en el chat para habilitar escrituras. El permiso temporal `synthetic-qa` está reservado a una QA aislada: **no es un mecanismo de activación para producción**.

### Código integrado no equivale a Site actualizado

El repositorio, la versión guardada en Sites, el deployment, la D1 y el estado del plugin son entidades diferentes. Existen instalaciones que permanecen en **fase 2, solo lectura**, aunque `main` ya integre el motor completo. Un merge no actualiza automáticamente sus aplicaciones ni sus datos.

Una QA independiente validó en Sites el esquema hasta `0012`, identidad, 31 lecturas y propuestas sin efectos de negocio. Las firmas y ejecuciones de las 43 operaciones se han comprobado **sintéticamente en pruebas locales**, no como operaciones alojadas con aprobación humana real. Consulta el [estado técnico](docs/CURRENT_STATE.md), el [roadmap](docs/ROADMAP.md), la [matriz de operaciones](docs/OPERATION_ACCEPTANCE_MATRIX.md) y la [aceptación QA](docs/ISSUE15_QA_ACCEPTANCE_REPORT.md).

## Capacidades de la aplicación

- **Organización:** tareas y subtareas, prioridades, dependencias, fechas, áreas, proyectos y bitácora.
- **Agenda:** eventos, planificación y relaciones con tareas y proyectos.
- **Finanzas:** cuentas, ingresos, gastos, ajustes, transferencias y comisiones; categorías y conceptos, presupuestos, obligaciones y ocurrencias, metas y reservas.
- **MCP de lectura:** consultas privadas y compartidas con filtros, paginación, validación de referencias y reportes financieros.
- **MCP de propuestas (cuando esté habilitado):** preparar cambios, revisar su impacto, solicitar aprobación humana, consultar estados y recibos; la **ejecución requiere una autorización adicional**.

Las transferencias entre cuentas propias no deben contabilizarse como ingresos o gastos por su importe principal; solo sus comisiones tienen impacto de gasto. Los cálculos financieros y la integridad referencial dependen de los servicios de dominio existentes; no dupliques el motor contable.

## Desarrollo local

Requisitos: **Node.js ≥ 22.13**, Git y npm. Las pruebas de D1 usan bases temporales **locales**, no instalaciones remotas.

```sh
git clone https://github.com/JorgeTonos28/Vida_en_orden.git
cd Vida_en_orden
npm ci
npm run dev
```

Antes de contribuir, ejecuta las verificaciones obligatorias de [`AGENTS.md`](AGENTS.md). En particular:

```sh
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

`verify:independent`, `verify:worker`, `verify:sites` y `verify:upgrade` operan sobre fixtures y D1 locales aisladas. **Sus resultados no certifican el backup ni el ledger de un Site administrado.** `verify:upgrade` ensaya 8→13 migraciones en bases locales ficticias y nunca debe apuntar a producción. Más información en [ensayo de migración](docs/PHASE2_UPGRADE_REHEARSAL.md).

## Instalaciones independientes en ChatGPT Sites

Cada persona crea y administra **su propia instalación**, su D1 `DB`, propietario, audiencia, secretos y versiones. El repositorio no incluye datos reales, claves ni identificadores privados.

Para una instalación **nueva**:

1. Lee [instalación independiente](docs/NEW_INSTANCE_GUIDE.md) y [bootstrap de Sites](docs/SITES_METADATA_BOOTSTRAP.md).
2. Genera el candidato con `npm run prepare:sites -- <ruta-absoluta-nueva>`, partiendo de un commit integrado y verificado.
3. Configura **en privado** el identificador de tu Site en el manifiesto `.openai/hosting.json` y el binding `DB`; la fuente pública solo contiene un marcador.
4. Revisa `npm run verify:hosting` en el candidato privado y completa el flujo oficial de publicación y configuración owner-only.
5. Configura los secretos de identidad indicados en [MCP setup](docs/MCP_SETUP.md) y comprueba identidad, lectura, permisos y estado del motor.

**`prepare:sites` es `freshInstallationOnly`: no es un actualizador para D1 existentes.** Nunca uses una instalación independiente de otra persona, ni copies sus datos, WebAuthn, secretos o identificadores. Consulta también [guía de despliegue](docs/DEPLOYMENT.md) y [portabilidad](docs/PORTABILITY.md).

## Actualizar un Site existente: leer antes de desplegar

El objetivo es **conservar el mismo Site, binding D1, propietario, URL, acceso, configuración y registros**. Una copia lógica JSON, una reversión de versión de código o el ensayo Wrangler LOCAL **no sustituyen** un respaldo nativo consistente y restaurable de D1.

Antes de modificar una base real:

1. Inventaría la **versión publicada**, el estado efectivo del **ledger de migraciones**, el DDL y la configuración del destino. No infieras esos valores desde `main`.
2. Obtén un respaldo recuperable y comprueba una restauración **aislada**, mediante mecanismos administrativos oficialmente soportados.
3. Coteja la representación y los hashes de las migraciones existentes y aplica **solo las pendientes**. Para una fase 2 original podrían ser `0008`–`0012`, **pero el ledger real manda**.
4. Planifica el rollback de **código** por separado de cualquier recuperación de **datos**. Ni cambiar de versión ni una exportación JSON restauran automáticamente D1.
5. Solicita autorización específica para publicar o migrar. Tras una actualización autorizada, verifica cuentas, saldos, movimientos, presupuestos, metas, tareas, referencias y auditoría **antes y después**, con escrituras MCP deshabilitadas inicialmente.

**No ejecutes** `migrate:fresh`, `DROP`, importaciones destructivas, reinicializaciones, SQL remoto improvisado ni manipulaciones del ledger. La importación/restauración de la interfaz no está validada como restauración integral de MCP y puede reemplazar registros.

Si Sites no expone el backup, ledger o flujo incremental necesario, **documenta el bloqueo y sigue con los trabajos seguros**, pero no conviertas una copia parcial en garantía de recuperación. Véanse [actualización y rollback](docs/UPGRADE_AND_ROLLBACK.md), [respaldo y recuperación](docs/MCP_BACKUP_RECOVERY.md) y [solicitud administrativa preparada](docs/SITES_ADMIN_SUPPORT_REQUEST.md).

## Autorización y seguridad MCP

- **Lecturas:** se ejecutan dentro del alcance autenticado; no requieren aprobación de cambios.
- **Preparación de propuestas:** no altera registros de negocio; puede crear metadatos de staging.
- **Ejecución:** exige una propuesta íntegra, vigente y autorizada mediante el mecanismo humano autenticado y las guardas del motor. Una confirmación textual (`confirmed=true` o «sí») no es una firma.
- **QA:** el perfil privado de ejecución temporal solo se usa con datos sintéticos, artefacto auditado y autorización administrativa independiente. No se porta a `main` ni a un Site personal.
- **Producción:** requiere un mecanismo y revisión de habilitación propios; **no está activada** en la distribución compartida.

Los límites actuales del motor de preparación (2.000 filas fuente entre 17 tablas fuera del historial auditado y 2 MiB por snapshot) pueden denegar planes grandes sin truncar datos. No se han certificado las cuotas efectivas del hosting para escala productiva.

Documentación: [seguridad QA](docs/QA_EXECUTION_SECURITY_REVIEW.md), [aprobación humana](docs/HUMAN_APPROVAL_SETUP.md), [pruebas alojadas pendientes](docs/QA_HOSTED_EXECUTION_RUNBOOK.md) y [matriz de aceptación](docs/USER_ACCEPTANCE_TESTS.md).

## Contribuciones y mantenimiento

`main` conserva el código común integrado. Trabaja en ramas y abre PR con pruebas, revisión de seguridad y CI; **no hagas push directo a `main`**. Una fusión no autoriza desplegar el Site personal de ningún colaborador.

Lee [`AGENTS.md`](AGENTS.md), [colaboración](docs/COLLABORATION.md), [sincronización Sites/GitHub](docs/SITES_GITHUB_SYNC.md) y [continuidad técnica](docs/DEVELOPMENT_PROGRESS.md). La auditoría de la fuente actual **no acredita el saneamiento del historial público anterior**, todavía documentado como riesgo.

## Licencia

MIT. Las dependencias de terceros conservan sus respectivas licencias; consulta [LICENSE](LICENSE) y [seguridad](docs/SECURITY.md).
