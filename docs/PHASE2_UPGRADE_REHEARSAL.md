# Ensayo nativo local: fase 2 → esquema 0012

25 noviembre 2026. #17 ya integrado en main0162720. Cadena pendiente: PR #18 → [PR #19](https://github.com/JorgeTonos28/Vida_en_orden/pull/19), con la corrección f5a0f81 del motor incorporada exactamente y este arnés preservado sin cambios. Implementación inicial a7220a6, fallo/reintento e329497. No se publica en Sites ni se modifica ninguna instalación existente. Este ensayo avanza la issue #13; **no acredita un respaldo, ledger o actualización del servicio administrado de Sites**.

## Reproducción y alcance

```sh
npm ci
npm run verify:upgrade
```

Node >= 22.13, dependencias del lockfile, sin credenciales. El comando no acepta parámetros, URL, project_id, rutas de bases existentes ni modo remoto. Crea dos directorios temporales y D1 locales distintas mediante Wrangler/workerd; todas las invocaciones exigen --local, los proxies usan remoteBindings=false y envFiles vacío. Al terminar elimina solo su directorio temporal verificado, incluidos los dumps ficticios. CI ejecuta el mismo comando. No usar su mecanismo de restauración sobre una base viva.

## Verificaciones ejecutables

1. Crear fase 2 con las ocho migraciones 0000–0007, byte a byte iguales a las originales. Registrar su ledger nativo d1_migrations sin modificarlo manualmente.
2. Sembrar únicamente datos ficticios mediante servicios de dominio: tareas/área/proyecto/evento, cuentas/configuración, transferencia ACH con comisión, gasto vinculado, presupuesto, obligación con reserva y meta con aporte. Añadir 2.100 movimientos históricos anulados y 5.000 eventos de auditoría para comprobar conservación de historia. No provienen de ninguna instalación.
3. Guardar todas las filas/columnas de las 18 tablas de negocio y vistas MCP de cuentas/saldos, presupuesto, informe y referencias. Estas comparaciones incluyen identidad/scopes, fechas, vínculos, reservas y configuración persistida, no solo recuentos.
4. Detener el proxy y exportar mediante Wrangler nativo LOCAL con compatibilidad D1. El export conserva DDL y ledger. Crear otra copia del archivo y comparar SHA-256; ambas copias son temporales en el mismo equipo, **no un respaldo externo de producción**.
5. Restaurar ese SQL con Wrangler en la segunda D1 vacía e independiente. Exigir igualdad exacta de filas/vistas/ledger antes de migrar. Esto ensaya recuperación de la copia de fase 2, sin tocar el origen.
6. Añadir las cuatro pendientes hasta 0011 y ejecutar el migrador nativo. Solo en el fixture temporal, añadir a 0012 un error después de CREATE INDEX: debe fallar y revertir tanto índice como entrada del ledger, sin cambiar filas/vistas. Sustituir exclusivamente ese fixture fallido/no aplicado por la 0012 exacta revisada y reintentar: aplica una pendiente, conserva las ocho entradas originales y termina con 13. En total se aplican solo cinco migraciones válidas. Verificar 48 tablas, 54 triggers y columnas exactas del índice audit_log_seed_context_idx. Repetir apply: ningún cambio en ledger ni filas. Los SQL versionados de drizzle nunca se editan.
7. Comparar otra vez todas las filas y vistas; cero cambios de negocio y referencias válidas. La migración/lectura no crea installation_id para una fase 2 que no lo tenía. El primer intento explícito de propuesta puede inicializar metadatos propios; el exceso de filas debe devolver snapshot_limit sin cambiar negocio. businessWritesEnabled sigue false.
8. D1 permite foreign_key_check y se exige cero incidencias. D1 LOCAL deniega integrity_check con SQLITE_AUTH: no se elude. Como comprobación complementaria, cargar el export nativo en SQLite aislado y exigir integrity_check=ok. Esto verifica el SQL exportado; no certifica integridad física interna de D1 ni del host Sites.

## Evidencia y límites

El comando emite una línea JSON solo después de todas las aserciones: localOnly/synthetic, ledgerRestored, 8→13 migraciones, onlyPendingApplied=5, failedMigrationRolledBack, repeatApplyNoChange, businessPreserved, viewsPreserved, 48 tablas, 54 triggers, índice, historial conservado y exceso de 2.000 denegado. Incluye tamaño/hash del dump ficticio y tiempos de export/restore/upgrade. La línea SQLITE_ERROR por synthetic_missing_table es el fallo deliberado: solo status=passed final acredita su recuperación. Conservar el log local o el enlace al job CI del commit exacto; no publicar dumps ni identificadores reales.

Ensayo inicial aprobado: export ficticio de aproximadamente 2,64 MB, export ~3 s, restore ~16 s, upgrade ~8 s. Son tiempos locales incluyendo CLI, **no CPU/cuota/rendimiento de Sites**; la salida de cada ejecución prevalece sobre estas muestras. El respaldo puede superar 2 MiB porque no es un snapshot del motor de propuestas.

Repetición desde el script versionado, con suite paralela: 2.639.109 bytes, export 10,2 s, restore 22,6 s, upgrade 10,5 s; todas las aserciones aprobadas. La variación confirma que no deben usarse esas duraciones locales como cuota o garantía de latencia del host.

Repetición con inyección de fallo aprobada: export 2,8 s, restore 15,5 s, upgrade 22,0 s, este último incluyendo migración por etapas, error deliberado, comprobación del rollback y reintento. failedMigrationRolledBack=true. No comparar ese último tiempo directamente con los ensayos previos de ruta satisfactoria sin inyección.

El límite de preparación persiste: las otras 17 tablas suman como máximo 2.000 filas fuente y el snapshot completo no puede superar 2 MiB. Una regresión adicional prueba exceso de bytes con menos de 2.000 filas, sin truncado ni staging residual. audit_log histórico no se copia al snapshot. Preservar historia durante upgrade no significa poder escribir sobre cualquier volumen: el diseño por conjuntos de lectura sigue pendiente y no se sustituye por saldos parciales.

## Actualización real y rollback

- La entrega de código permanece cerrada, sin nuevos SQL en estos PR. Para una fase 2 real las cinco migraciones pendientes son 0008–0012; las representaciones original/proyectada deben cotejarse con el ledger efectivo del destino. No repetir SQL, marcarlo aplicado ni modificar el ledger manualmente.
- No cambiar Site, binding DB, propietario, origen, credenciales, audiencia ni configuración para actualizar. No ejecutar create_site/remix, migrate:fresh, DROP o import sobre la instalación existente. No usar prepare:sites freshInstallationOnly para sobrescribirla.
- Primero respaldo nativo consistente del destino y restauración aislada por mecanismo administrativo soportado, inventario de ledger/DDL y autorización específica. Si Sites no lo expone, detener ese despliegue y tramitar [solicitud de soporte](SITES_ADMIN_SUPPORT_REQUEST.md). La QA nueva no demuestra el upgrade del Site anterior.
- Para publicar una única actualización final, integrar/revisar todos los PR necesarios y ensayar el artefacto exacto antes de la ventana del destino. Mantener propuestas/ejecución deshabilitadas inicialmente y drenar requests de UI/MCP. Ver [runbook general](UPGRADE_AND_ROLLBACK.md).
- Rollback ordinario: volver al código/versión/configuración cerrados anteriores, conservar tablas/índices aditivos y todos los registros. No revertir automáticamente datos ni esquema. Si se requiere restaurar datos, necesita otra autorización explícita, copia recuperable y reconciliación de cambios posteriores.

Documentación primaria del mecanismo local: [Wrangler D1](https://developers.cloudflare.com/d1/wrangler-commands/) y [migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/). Las capacidades de Wrangler no implican permisos ni acceso administrativo a la D1 administrada por Sites.
