# Roadmap MCP

Este documento conserva el plan real de siete fases del plan maestro y separa el estado del código de cualquier promesa futura.

El endurecimiento de GitHub, la guía de portabilidad y la prueba de instalación independiente son infraestructura de colaboración. No avanzan ni completan ninguna fase funcional del MCP.

| Fase | Alcance | Estado verificable | Siguiente criterio de aceptación |
|---|---|---|---|
| 0 | Auditoría, inventario, backup, recuperación, matriz de paridad y amenazas | Documentada y cubierta por el código de prueba; cada instalación debe repetir la parte operativa. | Repetir auditoría y recuperación en cada instalación antes de cambios sensibles. |
| 1 | Servidor MCP, identidad, owner-only, transporte y lecturas iniciales | Completada. | Mantener compatibilidad de las nueve herramientas iniciales. |
| 1.1 | Compatibilidad con el transporte moderno, headers, notificaciones, límites y conformance | Implementada en el código transferido. | Ejecutar la suite MCP en cada PR. |
| 2 | Paridad integral de lecturas, relaciones, finanzas, agenda, bitácora, configuración y paginación | Implementada; las 31 herramientas se ejecutaron localmente con fixtures y mediante el plugin de una instalación nueva con D1 vacía. | Cada instalación debe repetir las pruebas y comparar lecturas con registros propios frente a su interfaz. |
| 3 | Motor de propuestas, diff, huella, aprobación humana autenticada, caducidad e idempotencia | Motor integrado; firma humana demostrada en desarrollo anterior, sin portarla a QA. PR #18 añade autorización temporal QA, doblemente cerrada; pruebas criptográficas/SQL locales aprobadas. | Revisión independiente, autorización administrativa y canal humano propios de QA antes de activar o ejecutar allí. |
| 4 | Escrituras no financieras: tareas, áreas, proyectos, planificación y bitácora | 19 adaptadores y reversión probados; recorrido completo de las 43 acciones combinadas en SQLite/D1 con firmas sintéticas y persistencia exacta. | Ejecución alojada por propuesta y firma humana propia, después de habilitación QA revisada/autorizada. |
| 5 | Escrituras financieras y relaciones cruzadas | 24 adaptadores R2, integridad contable/reintentos/reversión y recorrido completo SQLite/D1 locales aprobados. Negocio alojado cerrado. | Aceptación alojada con datos ficticios y firma humana, persistencia/reconciliación; sin movimientos reales. |
| 6 | Adjuntos interpretados, informes ampliados y endurecimiento operativo | Texto/CSV/JSON, informe interno, límites, evidencia y recuperación implementados; binarios/OCR no disponibles, carga y cuotas alojadas pendientes. | Aceptación de los informes/adjuntos en ChatGPT y validación operativa del host. |
| 7 | Cierre documental, publicación, conexión y pruebas end-to-end | Main0162720 integra #17. Corrección f5a0f81 de #18 incorporada exactamente a #19; 199 pruebas locales/43 operaciones, recuperación/upgrade nativo LOCAL con fallo/reintento conservados. QA sigue d193562, versión 1/entorno 1, sin negocio. | CI y nueva conformidad de #18→#19; luego dos propuestas ficticias con firmas propias según QA_HOSTED_EXECUTION_RUNBOOK. Cuotas/escala, recarga visual y respaldo/ledger del destino personal siguen pendientes; fase 7 no completa. |

## Dependencias

El saneamiento del historial fue preparado y ensayado localmente; el responsable suspendió su sustitución. La exposición remota/de cachés sigue abierta. No se declara cerrada por haber saneado HEAD ni por crear una copia local limpia. Ver `HISTORY_SANITIZATION_PLAN.md`; conservar ese riesgo sin reiniciar el reemplazo.

La fase 3 depende de una aprobación humana demostrable en la plataforma. Las fases 4 y 5 dependen de la fase 3 y de servicios de dominio transaccionales. La fase 6 depende de límites de archivos y permisos verificables del host. La fase 7 no convierte ninguna fase pendiente en terminada.

## Ejecución vigente

Revisión posterior: #17 integrado en main0162720 con CI satisfactorio. #18 corrige la autorización opcional dentro del motor y se somete de nuevo a pruebas/revisión; #19 incorporará exactamente ese commit y conserva su ensayo de recuperación. La cadena pendiente es #18 → #19. No hay activación o publicación. Tras conformidad e integración, seguir QA_HOSTED_EXECUTION_RUNBOOK para solo dos propuestas ficticias con firmas humanas propias; no repetir manualmente las 43 regresiones.

Recuperación: verify:upgrade ensaya export/restore nativo LOCAL, ledger conservado, aplicación incremental de cinco pendientes hasta 0012, preservación exacta y reaplicación sin efectos. Documentado en PHASE2_UPGRADE_REHEARSAL; solicitud SITES_ADMIN_SUPPORT_REQUEST no enviada. CI obligatorio ampliado. Esto no resuelve backup/ledger/upgrade del destino administrado de issue #13. No actualizar una base real hasta superar ese bloqueo.

25 noviembre: diagnóstico tipado entregado en PR #17 (CI aprobado), seguido por gate QA implementado sin activar y cobertura local de 43 operaciones/55 ejecuciones por motor SQLite/D1. Total 182 pruebas, sin omitidas. Ver DELIVERY_READINESS y OPERATION_ACCEPTANCE_MATRIX. Fases 3–5 conservan pendientes de aceptación humana/ejecución alojada; fase 6 conserva cuotas/escala; fase 7 no completa. Un build privado armado exige revisión independiente y autorización administrativa nueva; main permanece cerrado.

Después de integrar #16 en ca336b7 se prepara diagnóstico tipado de referencias, habilitación QA condicionada sin activación y ensayo de upgrade/recuperación ficticios. Ver DELIVERY_READINESS; no se declara fase7 terminada ni actualización personal apta sin gates administrativos/humanos.

Prioridad issue #15: nueva QA privada publicada desde d193562 bajo autorización específica, D1 vacía propia hasta 0012 y44 herramientas invocadas. Idempotencia/revisión/cancelación/cierre de ejecución aprobados en plataforma; ninguna fila de negocio persistida. No se modifica ni migra la instalación anterior de issue #13. Fuente y límites: ISSUE15_QA_ACCEPTANCE_REPORT; continuidad y pendientes: DEVELOPMENT_PROGRESS. La aceptación alojada permite preparar una entrega posterior de habilitación condicionada; no recomienda activar negocio sin canal humano propio, revisión, recuperación y autorización separados.

La corrección de auditoría del PR #12 fue aprobada e integrada en main767f71f; CI posterior45526085881 verde. Lote CAS único y auditoría indexada/append-only; 0012 añade solo índice. La issue #13 ensaya la recuperación propia y 0012 sin publicar ni habilitar negocio. Las otras 17 tablas siguen limitadas a 2.000 filas fuente: escalabilidad por conjuntos de lectura y cuotas del host pendientes. Ver ISSUE13_ACCEPTANCE_REPORT y PR12_AUDIT_FOLLOWUP.

El PR #12 implementa proyección de esquema y bootstrap autenticado; originales conservados y nueva 0011. El 503 de registro se corrigió en 5359d43 con tres regresiones nuevas,146 pruebas/CI/clon aprobados. Registro, conexión y firma de propuesta ya verificados; APPROVED y evidencia durable, seguidos de writes_disabled y cero negocio. Ver DEVELOPMENT_PROGRESS. El propietario no necesita otra credencial/instancia ni repetir una firma porque después expire el plan de prueba.

El responsable autoriza las fases 3–7 en ramas dependientes. La exposición histórica sigue abierta; no se continúa la sustitución del repositorio y no bloquea este desarrollo. Se implementan y prueban componentes aislados sin habilitar escrituras reales. El seguimiento reproducible y los bloqueos están en `DEVELOPMENT_PROGRESS.md` y las pruebas humanas en `USER_ACCEPTANCE_TESTS.md`.
