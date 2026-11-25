# Primera ejecución alojada en la QA existente

Procedimiento pendiente de aprobación e integración de #18 → #19. #17 ya está integrado en main0162720. No se ha generado, publicado o armado un artefacto privado en esta revisión; la distribución compartida sigue false/null. No crear otro Site ni usar datos/configuración de una instalación personal.

## 1. Artefacto privado revisado — agente y administración

Tras los merges, fijar el commit integrado con CI verde. Preparar en un checkout privado el mismo Site QA y binding DB existentes, su propia proyección/manifest y un overlay limitado a los dos cierres de QA. releaseId identifica el commit revisado; registrar además hashes/commit del artefacto y overlay exactos. El mantenedor revisa el diff privado y el propietario autoriza explícitamente publicación, ventana de ejecución y regreso al código cerrado en **esa misma QA**. No portar el overlay o permiso a main ni a otra instalación.

El agente verifica automáticamente destino/origen, owner-only, identidad auténtica del plugin, versión y baseline de tablas. Si QA sigue conteniendo solo datos ficticios, no exigir un respaldo nativo de producción para esta prueba acotada: conservar fuente/configuración cerradas y evidencia de la QA. La recuperación administrativa del Site personal es un bloqueo separado de issue #13. No borrar ni reiniciar D1 para preparar este ensayo.

## 2. Canal humano propio — propietario y administración

Si QA ya tiene una credencial propia verificada y fijada, reutilizarla; no repetir registro. Si falta, el propietario abre /approvals/enroll y completa personalmente su autenticador. Administración fija únicamente la clave pública de ese registro en la configuración privada de la misma QA. No transferir la credencial de otro Site ni recibir PIN/clave privada.

Las variables de Sites y su entorno desplegado son estados distintos. Todo cambio administrativo de clave/permiso exige aplicar el entorno mediante el flujo de despliegue soportado de la misma versión autorizada cuando corresponda y comprobar su revisión efectiva; guardar una variable no demuestra que el Worker la esté usando. Esa operación está incluida en la autorización específica de la ventana, nunca se hace sobre otra instalación.

Después de publicación autorizada del artefacto revisado, el agente confirma la vinculación efectiva proyecto/origen/D1/owner/release/catálogo. Sin permiso válido, una nueva ejecución debe devolver writes_disabled. El propietario abre /approvals/qa-permit, revisa destino/vigencia y firma personalmente; administración instala el artefacto devuelto como secreto solo en esa QA, por un máximo de 15 minutos. La página no lo instala ni aprueba operaciones. Si el host no permite verificar esos bindings, no activar; no relajar los controles.

## 3. Dos propuestas ficticias — agente, con dos aprobaciones humanas

El agente prepara y valida cada plan antes de pedir la firma. Usar fecha local de contexto de la propuesta y prefijo «QA Synthetic». El escenario equivalente ya se prueba automáticamente con autenticadores sintéticos; no repetir manualmente las 43 operaciones.

| Plan | Operaciones | Resultado esperado |
|---|---|---|
| Tarea | task.create, título «QA Synthetic — ejecución» | Una tarea persistida con los campos aprobados. |
| Finanzas | finance.account.create, caja con 10000 centavos a fecha del contexto; finance.transaction.create, gasto de 1250 centavos con accountId={$ref: acción de cuenta}, misma fecha y descripción «QA Synthetic — gasto» | Cuenta con saldo 8750 centavos y gasto 1250; sin ingreso, transferencia ni comisión. |

Para **cada** plan, el propietario abre el enlace de esa revisión, revisa todo el diff/impacto y firma con su autenticador. El agente no puede sustituir esas dos acciones humanas ni usar confirmed=true. Un permiso administrativo no aprueba la propuesta. Si el permiso o plan caduca, no ampliar/reutilizar firmas: volver a la ceremonia estrictamente necesaria.

El agente ejecuta mediante el plugin auténtico y comprueba automáticamente filas persistidas de todas las tablas afectadas contra baseline + delta aprobado + auditoría obligatoria de commit, owner/revisión/huella, recibo, evidencia y lectura MCP posterior. Toda inicialización legítima del dominio debe figurar en el diff aprobado. Reintentar la misma clave devuelve el mismo recibo sin nuevas filas/importes/auditoría; comprobar referencias y ausencia de efectos adicionales. Registrar solo resultados redactados. Ante timeout consultar primero get_execution_result. Ante discrepancia cerrar la ventana y preservar evidencia; no compensar ni borrar finanzas automáticamente.

## 4. Cierre — administración y comprobación automática

Retirar el secreto de permiso y volver al artefacto cerrado bajo la autorización acordada; drenar requests y comprobar versión/configuración efectivas. No prometer revocación instantánea de Workers ya admitidos: esperar su cese o el vencimiento máximo del permiso antes de certificar cierre.

El agente prepara una propuesta nueva ficticia sin aprobarla e intenta ejecutarla: debe responder writes_disabled, con negocio/recibos/auditoría de ejecución intactos; luego cancela solo esa propuesta. No usar un recibo ya confirmado para probar cierre: su recuperación es una lectura legítima y no ejecuta de nuevo. Los recibos de ambas pruebas siguen consultables. Conservar datos/evidencia de QA; no purgar historia para dejarla vacía.

## Bloqueos reales y límites

- Pendientes: nueva conformidad de #18/#19, autorización administrativa del artefacto exacto y las acciones WebAuthn propias señaladas. El agente realiza preparación, ejecución técnica, comparación, reintentos y documentación; esas tareas no se delegan al propietario.
- El helper visual dio Access is denied: una reconsulta MCP no demuestra recarga visual/desconexión del plugin. No exigir repetir lecturas o firmas previas para suplir ese bloqueo.
- Los límites de 2000 filas/17 tablas, 2 MiB y cuotas CPU/memoria no certificadas permanecen. No impiden por sí solos este ensayo mínimo en QA ficticia; no acreditan escala productiva. No generar carga para medir límites desconocidos.
- Para actualizar el **mismo Site personal de fase 2** siguen siendo necesarios respaldo recuperable del destino, ledger/DDL administrativo y autorización soportados: UPGRADE_AND_ROLLBACK y SITES_ADMIN_SUPPORT_REQUEST. No crear otra instalación personal para sustituir ese requisito; las copias/ensayos ficticios ya son responsabilidad del entorno del agente.
