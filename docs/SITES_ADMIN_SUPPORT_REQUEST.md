# Solicitud preparada de capacidad administrativa Sites

Estado: borrador, **no enviado**. Referencia pública: issue #13 y PHASE2_UPGRADE_REHEARSAL. No incluir datos, firmas, claves, correos, URL/IDs privados o dumps en GitHub. Completar los campos de destino solo en el canal administrativo privado autorizado por su propietario. Esta solicitud no autoriza ejecutar cambios.

## Texto para soporte

Necesitamos actualizar una instalación existente de Vida en Orden en ChatGPT Sites, preservando su mismo Site, binding D1, origen, identidad/propietario, permisos, configuración y todos los datos. No queremos crear otra instalación ni reiniciar/restaurar la base viva. MCP de negocio debe seguir deshabilitado.

Código público candidato: commit integrado/revisado [por completar tras los merges y CI finales]. Base conocida: main0162720 con #17 fusionado; pendientes #18 corregido y #19 de ensayo incremental. Instalación destino/versión/deployment/entorno: [completar privadamente por su administrador cuando autorice la ventana]. Nivel real de migraciones: [por determinar administrativamente; no inferirlo desde el código].

Las herramientas Sites disponibles en esta sesión permiten versiones, despliegues, variables, acceso, overview y páginas acotadas de filas. No exponen export/snapshot/restore nativo, ledger y DDL completos ni métricas de CPU/memoria/cuotas. No disponemos de una operación soportada para comprobar estos requisitos; no hemos intentado SQL remoto, alteraciones del ledger ni endpoints alternativos.

Solicitamos procedimiento soportado, permisos necesarios y confirmación de:

1. Snapshot/export consistente de D1 con todas las tablas de negocio y MCP, propuestas, evidencias, recibos, auditoría, ledger de migraciones, triggers, índices y versión del esquema. Especificar punto de consistencia, drenaje de requests/UI, cifrado, acceso, retención y entrega a almacenamiento separado bajo control del propietario.
2. Restauración de ese respaldo en una D1 aislada de ensayo del mismo propietario, sin tocar ni sustituir la base viva. Cómo cotejar integridad, hashes, identidad, referencias y evidencia; cómo verificar que no se copian accesos a terceros. No enviar datos de la instalación a un repositorio público ni a otra persona.
3. Inventario administrativo del ledger efectivo con hashes/representación aplicada, DDL de 48 tablas/54 triggers e índice audit_log_seed_context_idx cuando corresponda. Para fase 2, cotejar 0000–0007 byte a byte y aplicar únicamente 0008–0012 proyectadas; para instalaciones experimentales comparar antes de cualquier decisión. No falsificar ni reescribir entradas de migración.
4. Flujo incremental soportado sobre el mismo Site y D1, orden DDL/Worker, atomicidad/recuperación ante fallo, códigos de error y efecto de un upload fallido. Debe conservar filas, owner, claves/variables propias y permisos; no crear Site ni binding nuevo, repetir DDL o inicializar datos reales.
5. Cómo conservar/restaurar la versión de código/configuración anterior sin deshacer datos ni migraciones aditivas. Si existiera recuperación de datos excepcional, qué autorización, snapshot y reconciliación requiere. No ejecutarla con esta solicitud.
6. Límites efectivos del plan administrado: CPU, memoria, queries/batch/subrequests, filas/bytes leídos/escritos, tamaño D1, duración/transacciones, concurrencia y métricas disponibles; cómo observar un ensayo ficticio sin carga sobre instalaciones personales. No deducirlos de límites generales de Cloudflare.
7. Garantías sobre headers nativos de identidad, origen visible en request.url, binding del proyecto/D1 y drenaje/revocación de Workers antiguos en un cambio administrativo. El futuro permiso QA de 15 minutos y WebAuthn no deben activarse por esta solicitud.

Antes de realizar cualquier operación, necesitamos revisar el procedimiento concreto y obtener autorización específica del propietario del destino. Agradecemos identificar qué pasos son automatizables, cuáles exigen su acción autenticada y qué capacidad aún no existe.

## Evidencia adjuntable sin secretos

- Repositorio público, commits/PR y enlaces CI verificados.
- Informe local PHASE2_UPGRADE_REHEARSAL: dos D1 ficticias, export/restore nativo LOCAL con ledger conservado, 8→13 migraciones, 48 tablas/54 triggers, filas y vistas idénticas, repetición sin efectos. No adjuntar el dump.
- Informe QA nueva de issue #15: fuente d193562, versión 1/entorno 1 owner-only, lecturas/propuestas sin negocio; no acredita backup o migración del destino.
- Bloqueo visual exacto: GetCursorPos failed: Access is denied (0x80070005) en helper oficial de Windows; no se cambiaron políticas de seguridad ni se fabricaron sesiones.

## Criterio para retirar el bloqueo

Procedimiento administrativo documentado y autorizado, respaldo recuperable en almacenamiento separado, restauración aislada verificada, ledger/DDL cotejados y ensayo incremental del artefacto final sin pérdida de datos/identidad. Hasta entonces no recomendar actualización de una instalación con datos reales. Las pruebas humanas propias de QA y de ejecución requieren gates separados; no las sustituye soporte ni CI.
