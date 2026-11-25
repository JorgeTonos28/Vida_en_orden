# Entregas para aceptación y actualización

Base integrada actual: 0162720e8a40db12fe1b97543b262b867b0438bb, #17 fusionado y CI45679888063 aprobado. Corte 25 noviembre 2026. Cadena pendiente #18 → #19; #18 requiere nueva conformidad tras corregir la autorización directa del motor. No se modifica ni migra una instalación personal, ni se activa negocio o despliega un candidato.

Corrección de auditoría: toda ejecución nueva requiere callback y resultado completo/vigente, release/huella válidos y deadline acotado; cualquier fallo deniega writes_disabled. SQL ya no admite deadline nulo y la auditoría de autorización es obligatoria/atómica. Recuperar un recibo confirmado no vuelve a ejecutar ni necesita un nuevo permiso. Fixtures usan la política criptográfica real. Validación local aprobada: 199 pruebas, sin omitidas, incluidas 43 operaciones/55 ejecuciones por motor SQLite/D1, y todos los controles de AGENTS; ver DEVELOPMENT_PROGRESS. Siguiente paso mínimo: [QA_HOSTED_EXECUTION_RUNBOOK](QA_HOSTED_EXECUTION_RUNBOOK.md), dos propuestas ficticias en la QA existente, después de revisión e intervención administrativa/humana específicas.

## A — Diagnóstico tipado de referencias

Rama fix/mcp-typed-reference-errors, basada directamente en main. DomainReferenceError identifica referencias ausentes/no disponibles dentro de los servicios existentes; conserva mensajes UI. El motor traduce exclusivamente ese tipo a reference_not_found/404 con mensaje uniforme sin IDs ni datos ajenos. Errores desconocidos/infraestructura no se clasifican por texto. Se conservan validación, scopes, cálculos, lotes CAS y guardas de aprobación/ejecución.

Tres regresiones nuevas verifican fallo de revisión tras firma WebAuthn sintética conservando versión/huella/clave/evidencia/autorización utilizable, errores de referencias financieras/compartidas/calendario y preservación de errores desconocidos. La regresión Worker deja de exigir internal_error y mantiene la preservación de APPROVED. No hay SQL nuevo ni despliegue; la QA alojada anterior conserva su diagnóstico hasta publicación autorizada.

Pruebas: 169 aprobadas (14 financieras + 147 MCP + 4 auditoría + 4 recuperación), sin omitidas; npm ci, dependencias sin alertas, TypeScript/lint sin errores (4 advertencias previas), schema sin cambios, build, D1 independiente y ambos Workers. [PR #17](https://github.com/JorgeTonos28/Vida_en_orden/pull/17), commit 0bcab1c, [CI aprobado](https://github.com/JorgeTonos28/Vida_en_orden/actions/runs/45667349422). Rollback: revertir código por PR, sin restaurar D1 ni borrar datos.

## B — Habilitación QA condicionada, sin activar

Implementada en feature/qa-execution-authorization, dependiente del PR #17. El árbol público mantiene MCP_BUSINESS_WRITES_ENABLED=false y QA_EXECUTION_RELEASE_ID=null. Añade validación de un permiso administrativo WebAuthn de hasta 15 minutos, ligado a proyecto/origen/D1/propietario/release/catálogo, y una ceremonia humana separada que solo devuelve un artefacto: no lo instala ni activa negocio. Cada propuesta requiere además su propia aprobación. El vencimiento se comprueba dentro del lote SQL y se audita la huella del permiso atómicamente. Ver [análisis de seguridad](QA_EXECUTION_SECURITY_REVIEW.md).

Las 43 operaciones y 55 ejecuciones por motor pasan en SQLite y D1/workerd locales, con firmas sintéticas, comparación exacta del delta más la auditoría obligatoria, reintento idempotente y lectura posterior. Se corrigió task.duplicate: las referencias posteriores apuntan a la copia. [Matriz ejecutable](OPERATION_ACCEPTANCE_MATRIX.md). Total: 182 pruebas (14 financieras + 160 MCP + 4 auditoría + 4 recuperación), sin omitidas; TypeScript/lint/build y ambos Workers aprobados. Estas pruebas no certifican aprobación humana ni ejecución alojada.

Antes de activar hacen falta revisión independiente, perfil privado exclusivo de QA con bindings comprobados, autorización administrativa específica, credencial y acciones humanas propias de QA. No portar la firma/clave de otra instancia. No se generó ese perfil armado, no se instalaron permisos ni se publicó código en Sites.

## C — Actualización de fase2 con recuperación

Ensayar únicamente con datos ficticios y copias propias. Conservar todas las filas/propietarios/configuración, aplicar solo migraciones pendientes, comparar totales/referencias/lecturas y mantener MCP cerrado. Un export/restore nativo local y ledger de Wrangler no certifican el ledger o la recuperación del servicio administrado de Sites. La issue #13 continúa abierta mientras no exista capacidad administrativa nativa probada y autorización para la instalación destino.

## Bloqueos externos confirmados

Reconsulta real del plugin QA (25 noviembre, fuente d193562): catálogo de 44 herramientas, health listo, metadata1, staging vacío, propuesta cancelada en revisión 2 y huella idéntica a la consulta anterior. get_approval_status coincide; commit vuelve a denegar writes_disabled. Esto verifica persistencia y conexión MCP actual, **no** una desconexión/reconexión visual ni los cambios de estas ramas todavía sin publicar.

- Automatización visual de Chrome: el helper oficial de Windows inicializa/lista apps, pero falla al seleccionar/capturar con GetCursorPos failed: Access is denied (0x80070005). No se cambian permisos/seguridad del sistema ni se fabrican sesiones/headers. No atribuir a HTTP una recarga visual o desconexión/reconexión del plugin.
- Las herramientas Sites disponibles exponen overview/filas, no snapshot/export/restore, ledger/DDL completo ni métricas de CPU/memoria/cuota. No se inventan endpoints ni se modifica D1 remota/ledger para eludirlo. Preparar solicitud de soporte con datos privados solo en canal administrativo autorizado.
- Habilitación real, registro/acción humana propios de QA y43ejecuciones alojadas: pendientes de revisión/autorización/canal humano, sin simular aprobaciones. Se continúa con toda implementación/prueba aislada viable.
-2.000filas conjuntas de otras17tablas/2MiB siguen siendo límites de preparación. No bloquean por sí solos instalar código con negocio cerrado, pero impiden recomendar escritura sobre datasets que excedan el presupuesto. No purgar historial ni truncar saldos. Cuotas del host y rendimiento real requieren evidencia, no inferencias desde CI.
