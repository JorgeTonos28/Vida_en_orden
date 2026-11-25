# Actualización y reversión de fases 3–7

## Estado posterior a revisión #18

Main0162720 ya integra #17. La corrección f5a0f81 exige autorización en todo commit nuevo y mantiene el cierre público false/null; #19 la incorpora por merge sin cambiar lib/tests/app ni el arnés nativo de recuperación. Orden pendiente #18 → #19, con nueva auditoría y CI de cada HEAD; no integrar o desplegar automáticamente. Para las primeras dos pruebas ficticias alojadas usar QA_HOSTED_EXECUTION_RUNBOOK, no otra instalación.

El destino personal de fase 2 se actualizará **en su mismo Site y DB**, preservando origen, owner, permisos, variables propias y todas las filas, aplicando solo pendientes. Las copias y simulaciones de ensayo pertenecen al entorno del agente y ya están automatizadas. El respaldo recuperable del destino y su ledger/DDL requieren el mecanismo administrativo autorizado cuando llegue la ventana: SITES_ADMIN_SUPPORT_REQUEST documenta el bloqueo exacto, sin SQL/ledger remoto alternativo. No usar prepare:sites freshInstallationOnly para sustituir esa instalación. Las notas que siguen sobre #17 abierto y commits anteriores son registros históricos.

## Entrega posterior a ca336b7 (25 noviembre)

PR #17 (0bcab1c, CI verde) y PR #18 (b72081b, CI verde) siguen abiertos; no fusionar automáticamente. #18 prepara un permiso QA sin activar: el árbol compartido continúa false/null. La rama dependiente chore/phase2-upgrade-recovery añade `npm run verify:upgrade` a CI/AGENTS y ensaya export/restore nativo **LOCAL**, ledger 8→13 con solo cinco pendientes, 48 tablas/54 triggers, filas/vistas idénticas y reaplicación sin cambios. Ver [ensayo reproducible](PHASE2_UPGRADE_REHEARSAL.md).

Para una fase 2 con datos reales, no publicar todavía: faltan respaldo recuperable del destino, ledger/DDL administrativo de Sites cotejados, restauración aislada y autorización específica. [Solicitud de soporte preparada](SITES_ADMIN_SUPPORT_REQUEST.md), no enviada. No usar la QA nueva ni Wrangler local como prueba de recuperación del servicio administrado. La instalación final conserva su mismo Site/DB/owner/origen/configuración y empieza con negocio deshabilitado. Todos los párrafos siguientes que citan main767f71f o entregas anteriores son evidencia histórica; la base actual de esta entrega es ca336b7.

Los PR #4–#12 están integrados en main767f71f; eso no autoriza actualizar una instalación personal ni publicar en desarrollo. La issue #13 aprobó restauración lógica y0012 locales, pero aún faltan respaldo nativo/ledger, copia separada y autorización administrativa específica. Ver ISSUE13_ACCEPTANCE_REPORT. Cada instalación administra sus propios recursos y versiones; GitHub no despliega otros Sites.

La entrega de bootstrap agrega 0011 (columna de metadatos) y una proyección para publicar en Sites sin cambiar los SQL originales. Seguir SITES_METADATA_BOOTSTRAP para una instalación nueva. No usar esa automatización para sobrescribir una instalación experimental que aplicó otra representación; inspeccionar hashes/ledger y obtener autorización de su propietario. La identidad y la revisión de negocio existentes no se reinician.

No publicar el lockfile basal del cierre: la auditoría detectó dependencias críticas. Incluir la corrección dependiente documentada en DEPENDENCY_SECURITY.md y verificar audit:dependencies además de la suite funcional, antes de cualquier actualización.

## Seleccionar y comprobar la versión

1. Confirmar main integrado y CI del commit seleccionado. #4–#12 ya están integrados; no recrear su cadena ni volver a fusionarla. Cualquier cambio posterior requiere nuevo PR, revisión y CI verde; sin force-push.
2. Usar un clon limpio del oficial integrado o del commit exacto del fork aprobado. No copiar `.git`, configuración, D1, credenciales ni archivos ignorados de una instalación anterior. La historia pública aún contiene exposición conocida: no tratar el clon como historia purgada.
3. Node >=22.13, npm ci; audit:dependencies, test:finance, test:mcp, test:audit, test:recovery, audit:public, tsc --noEmit, lint, verify:schema, build, verify:independent, verify:worker, verify:sites y verify:upgrade. Los tres anteriores a verify:upgrade requieren el build. No aplicar SQL generado inesperadamente: verify:schema debe indicar cero cambios.
4. Conservar el manifiesto público con marcador. Crear un checkout privado de publicación desde ese commit; configurar únicamente su propio project_id. Ver NEW_INSTANCE_GUIDE y flujo oficial de Sites. La configuración privada no se devuelve al PR.

## Matriz de compatibilidad

Corrección de auditoría integrada: 0012 añade solo audit_log_seed_context_idx. Upgrade ficticio en D1/workerd y copia lógica de desarrollo restaurada en SQLite aprobados, sin cambio de filas, identidad, revisión ni evidencia; no se desplegó. Código nuevo de propuestas/registro/health exige ese índice. La copia nativa restaurada y ledger/DDL efectivo siguen pendientes; no confundir el ensayo lógico con validación del host. No borrar auditoría para ajustar límites. Rollback de código con propuestas apagadas conserva índice/historial. Detalles: ISSUE13_ACCEPTANCE_REPORT y PR12_AUDIT_FOLLOWUP.

| Código | Base mínima | Propuestas | Observación |
|---|---|---|---|
| Legado hasta PR #3 (fase 2) | 0000–0007 | No | 31 lecturas, sin nueva infraestructura |
| Motor #5–#7 | Hasta 0008 | Solo pruebas internas | No exponer transporte incompleto |
| Canal #8 | Hasta 0009 | Desarrollo opt-in | Sin evidencia durable del endurecimiento |
| Endurecimiento/cierre #9+ | Hasta 0010 | Desarrollo opt-in | Falla cerrado si falta instalación, tablas o cualquiera de los 54 triggers |
| Bootstrap Sites #12 | Hasta 0011; proyección DDL para Sites | Desarrollo opt-in, negocio cerrado | Falla si falta esquema/triggers; primer POST de registro o preparación autenticados inicializa metadatos versión 1 |
| Auditoría posterior #12 | Hasta 0012; mismo bootstrap/proyección | Negocio cerrado, sin despliegue autorizado | Índice obligatorio para propuestas/registro/health; historial excluido de snapshot salvo 0/1 marcador; otras 17 tablas≤2.000 filas fuente |

El código nuevo con flags ausentes conserva las 31 lecturas. Una base sin infraestructura completa no habilita propuestas; no se crean tablas/triggers en un request para ocultar una migración omitida.

## Migrar una instalación existente (solo con autorización específica)

1. Inventariar código, versión Sites, origen, variables privadas y migraciones efectivamente aplicadas. No deducir el estado de D1 desde el SHA o un despliegue fallido.
2. Exportar un respaldo propio por el procedimiento de MCP_BACKUP_RECOVERY; conservarlo fuera de Git y comprobar restauración en otra D1 aislada. Conservar código/versión y configuración anterior para rollback. No mostrar el respaldo al modelo ni cargarlo al repositorio.
3. Deshabilitar propuestas, drenar requests y coordinar una ventana sin escrituras de UI. 0010 invalida propuestas PENDING/APPROVED antiguas, retira sus aprobaciones y limpia staging; después deben prepararse nuevas propuestas. No toca cuentas, saldos ni entidades de negocio.
4. Seguir SITES_METADATA_BOOTSTRAP para separar esquema y bootstrap sin editar originales. Ese candidato ya se publicó en un Site privado nuevo; no demuestra compatibilidad con cualquier ledger existente. Comparar hashes y migraciones efectivamente aplicadas: la exportación automatizada freshInstallationOnly no sobrescribe una instalación experimental con otra representación de 0008–0010. Si el estado es incierto, detener esa actualización y usar soporte o el mecanismo administrativo admitido. No omitir triggers, modificar SQL aplicado ni crear un endpoint SQL para avanzar.
5. Aplicar exclusivamente las migraciones pendientes en orden, por el mecanismo administrativo soportado del host. No ejecutar migrate:fresh/DROP/restauración ni repetir SQL a ciegas. Sites puede aplicar migraciones antes de fallar el upload del Worker.
6. Publicar el artefacto exacto verificado y comprobar owner-only, 31 lecturas sin efectos, referencias y concordancia de UI. Los flags opt-in y el canal humano se configuran después según HUMAN_APPROVAL_SETUP. La constante de ejecución continúa false.
7. Registrar versión, SHA, migraciones, resultado y rollback de **esa** instalación privadamente. Nunca publicar su identidad, correo, credenciales ni datos.

## Rollback y recuperación

Volver al código/versión de Sites previamente verificado con flags de propuestas desactivados. Conservar las tablas aditivas y triggers: no borrar D1 ni deshacer migraciones automáticamente. El rollback de código no restaura datos ni reactiva propuestas invalidadas; las operaciones UI posteriores siguen siendo datos propios de la instalación.

Si alguna ejecución futura devuelve timeout, consultar get_execution_result con la propuesta/revisión y clave idempotente originales antes de intentar otra operación. Un recibo COMMITTED es histórico; la verificación posterior distingue filas que cambiaron después. Las reversiones no financieras preparan una nueva propuesta desde un recibo y exigen aprobación; las financieras usan anulación/reversión del dominio, nunca parches de filas ni borrado de auditoría.

Si se sospecha daño de datos, detener escrituras de esa instalación, preservar evidencia privada y decidir recuperación con su propietario. Una restauración productiva exige autorización explícita y respaldo probado; no es parte del rollback ordinario de esta entrega.
