# Autorización temporal QA — candidato sin activar

Dependencia: PR #17 (errores tipados), sobre main ca336b7. Este documento es el análisis técnico del autor, **no una revisión independiente ni autorización de activación**. El mantenedor debe revisar código/CI y el propietario debe autorizar cualquier publicación/armado. No se cambió ningún Site o variable alojada.

Actualización de revisión: #17 ya integrado en main0162720. La revisión bloqueante de #18 exige cerrar el acceso directo al motor: commit ahora requiere un callback presente y valida explícitamente sus tres campos (deadline seguro/vigente/acotado, release y huella). Errores o resultados incompletos devuelven writes_disabled. SQL no acepta deadline nulo; autorización y negocio se auditan en el mismo lote. Ningún fixture legítimo ejecuta sin permiso sintético firmado por la política real. Los recibos confirmados se recuperan sin una nueva ejecución. La corrección requiere nueva conformidad del mantenedor.

Procedimiento mínimo posterior a merges: [QA_HOSTED_EXECUTION_RUNBOOK](QA_HOSTED_EXECUTION_RUNBOOK.md). Se limita a la QA existente, dos propuestas ficticias y sus firmas propias; separa tareas automáticas, administración y acciones humanas, sin repetir las 43 pruebas manualmente.

## Dos cierres de código y permiso del propietario

El árbol compartido mantiene MCP_BUSINESS_WRITES_ENABLED=false y QA_EXECUTION_RELEASE_ID=null. Transporte, fábrica y emisor administrativo permanecen cerrados. Incluso un permiso sintético válido no habilita el runtime compartido; las regresiones exigen esos valores. No hay variable genérica que abra negocio ni herramienta MCP para instalar permisos, confiar claves, ejecutar SQL o aprobar.

La rama implementa un validador de permiso y lo conecta a la fábrica. Un futuro perfil **privado exclusivamente QA**, aprobado por revisión/administración separadas, tendría que armar ambos cierres y conservar el manifiesto real de esa misma QA; ese perfil no está generado, publicado ni incluido como cambio activo aquí. Nunca portar ese overlay a main o a una instalación personal. Una bandera cambiada sola no basta: la fábrica vuelve a validar el permiso en cada ejecución nueva.

El permiso exige WebAuthn con UV/presencia y clave pública del propietario fijada por administración fuera de MCP. La firma cubre propósito synthetic-qa, proyecto de Sites, origen HTTPS exacto, propietario autenticado, installation_id leído de D1, releaseId del build revisado, hash del catálogo cerrado, tiempos y nonce. La ruta toma proyecto del manifiesto compilado y origen de request.url; no confía en argumentos del modelo ni en un header Origin para identificar Site. El origen debe coincidir además con la configuración de aprobación. Copiar variables/permiso a otro Site, propietario, D1, origen, release o catálogo falla cerrado.

El permiso es una capacidad administrativa reutilizable solo dentro de su ventana máxima de15minutos; su nonce separa firmas y **no se presenta como una autorización de operación consumible**. Cada propuesta requiere aparte su propio desafío único, huella/revisión y firma humana. El dominio criptográfico de permisos es distinto del de propuestas: una firma de propuesta no sirve para armar ejecución. Emisión/validación rechazan campos extra, valores enormes, permisos futuros/caducados, UV ausente, claves retiradas y cambios de catálogo.

## Ceremonia humana preparada, todavía cerrada

La página /approvals/qa-permit y API /api/mcp/qa-permit reutilizan approvalSession: identidad nativa, owner-only, HTTPS/origen exacto, cookie __Host/HttpOnly/SameSite=Strict, CSRF y cuerpo acotado, no-store/anti-framing. GET solo muestra sesión/estado; no inicializa D1. POST no emite opciones mientras el build siga sin armar. Con un perfil futuro autorizado, prepara un grant del servidor, muestra origen/vigencia y detalles completos, y solo un clic humano separado solicita navigator.credentials.get. La clave privada nunca llega al servidor.

El POST de verificación vuelve a comprobar firma/contexto, devuelve un artefacto al propietario y declara installed=false/businessWritesEnabled=false. No instala claves ni secretos, no cambia flags, no ejecuta propuestas y no crea una ruta de aprobación MCP. Un administrador, después de autorización específica, tendría que instalar ese artefacto como secreto MCP_QA_EXECUTION_PERMIT **en la misma QA**; nunca en GitHub ni otra instancia. Esto es una ceremonia WebAuthn implementada por la aplicación, no una API de aprobación inventada de Sites/ChatGPT.

No se ha realizado esta ceremonia con una persona en QA ni se ha fijado su credencial: la configuración QA existente conserva pin vacío y negocio cerrado. La prueba humana anterior de otro Site no se porta. Las pruebas locales usan exclusivamente claves generadas sintéticamente y no certifican hardware/fabricante ni intención humana real. Antes de publicar un perfil armado hay que confirmar también que request.url/origen del host y manifiesto se vinculen como se espera; ante discrepancia, denegar sin relajar esa vinculación.

## Ejecución y auditoría atómicas

La autorización de QA se exige además de las guardas existentes de propietario, metadata1, contexto de fecha, estado APPROVED, digest, evidencia, credencial vigente, revisión/base y consumo/idempotencia. El lote de ejecución comprueba también el menor vencimiento permiso/propuesta contra el reloj de SQLite; un reloj de aplicación atrasado no permite pasar el límite. La huella del permiso y releaseId se registran en mcp_plan_audit dentro del mismo lote. No se guardan el permiso completo, firmas ni claves en ese registro de autorización. Si el lote falla, tampoco queda un evento que afirme ejecución autorizada.

Un recibo existente puede consultarse/repetirse idempotentemente sin una nueva escritura; eso no vuelve a ejecutar la operación. Retirar permiso/clave o cerrar el build deniega nuevas solicitudes. **No se promete revocación instantánea de transacciones ya admitidas ni de Workers viejos aún en vuelo**: para un corte administrativo se drenan requests, se verifica configuración efectiva y se espera la caducidad/cierre del perfil. El chequeo SQL acota la vigencia al comienzo de la transacción. Este riesgo requiere validación de plataforma antes de activar.

## Cobertura e incidencia descubierta

Los ensayos recorren las43acciones del catálogo,55ejecuciones independientes, en SQLite y D1/workerd locales. Cada paso prepara sin negocio, firma una propuesta mediante WebAuthn sintético, ejecuta, repite la clave, lee filas y verifica digest/evidencia/referencias. Compara todas las tablas de negocio con el delta aprobado **más exactamente una entrada obligatoria de auditoría de commit**, validando su propietario, propuesta, revisión, acciones y fecha; no acepta efectos adicionales. Ver OPERATION_ACCEPTANCE_MATRIX.

El recorrido descubrió que task.duplicate devolvía como entityId el ID de entrada. Se prioriza el único registro nuevo cuando el servicio no devuelve un ID, antes de usar el ID de entrada. Una regresión duplica y modifica mediante $ref, demostrando que solo cambia la copia. No se cambia la lógica de duplicación del dominio ni sus datos.

Se comprueban transferencias propias (solo comisión, sin ingresos/gastos ficticios), reserva de meta/aporte/consumo/anulación, pagos parciales/recurrencia, presupuestos y gasto legado. El resto de regresiones conserva caducidad/cancelación/replay/concurrencia/fallos parciales y ausencia de efectos externos. La matriz marca explícitamente las43ejecuciones alojadas como bloqueadas hasta revisión, publicación autorizada, permiso y acciones humanas propias de QA.

## Riesgos pendientes y criterio de activación

### Procedimiento reservado para una autorización posterior

1. Integrar por revisión los PR requeridos y fijar el commit aprobado. Verificar CI, catálogo y los dos cierres del árbol compartido. No activar desde una rama sin revisar.
2. Inventariar privadamente el mismo Site QA, origen, D1 ficticia, identidad y clave registrada personalmente allí. Obtener autorización administrativa específica de publicación/activación/cierre; conservar versión/configuración cerradas y evidencia QA. No exigir un respaldo nativo de producción para el ensayo mínimo de una QA solo ficticia; el respaldo recuperable del destino personal sigue siendo un gate separado.
3. Preparar fuera de la distribución compartida un artefacto privado de esa QA: manifiesto propio, releaseId del candidato aprobado, y únicamente los dos cambios de armado revisados. Registrar hashes del artefacto y del overlay; la revisión debe cubrir ambos. No subir ese overlay a main ni a una instalación personal. No existe un comando público de armado automático.
4. Comprobar que la identidad del proyecto compilado y request.url coinciden con el destino nativo. Publicar exclusivamente ese artefacto autorizado; todavía sin permiso válido debe responder writes_disabled. Si el host no permite verificar la vinculación, detener la activación.
5. El propietario abre /approvals/qa-permit, revisa el destino y firma con UV. Un administrador instala el artefacto devuelto como secreto únicamente en ese Site. Comprobar health, expiración y bindings; no registrar el valor en logs/issues. El permiso no aprueba propuestas.
6. Preparar cada grupo de operaciones ficticias; el propietario revisa y firma su propuesta. El agente verifica ejecución, filas, recibo e historial y registra solo resultados públicos redactados.
7. Cerrar la ventana: retirar el permiso, drenar requests y volver al artefacto cerrado autorizado. Esperar vencimiento/cese de Workers admitidos, comprobar writes_disabled y ausencia de efectos nuevos. Conservar evidencia/recibos y datos QA; no borrar historia ni restaurar automáticamente D1.

Estos pasos **no se han ejecutado en la plataforma**. El releaseId identifica el candidato revisado; la trazabilidad del build privado exige además sus hashes/commit de Sites, no una afirmación de que ese literal prueba por sí solo el contenido del binario.

- Revisión independiente de este diff, bindings efectivos del host, UI/canal humano y artefacto privado de QA. El gate público sigue doblemente cerrado.
- Mantenedor/administración deben verificar el releaseId frente al artefacto exacto, la clave legítima y que la D1 sea ficticia; el literal synthetic-qa es una atestación firmada del operador, no detección automática de datos reales.
- Recovery/backup nativo del servicio administrado, cuotas CPU/memoria/consulta/espacio, corte de Workers viejos y trazabilidad de revocación no certificados por simuladores locales. Ver issue #13 y DELIVERY_READINESS.
- Límite2.000filas de17tablas/2MiB permanece. Una regresión nueva demuestra que datos históricos por encima de2MiB no se truncan y dejan staging limpio. Preparación por conjuntos de lectura requiere diseño de dominio adicional; no sustituir historia financiera por agregados que cambien semántica.
- No se toca una instalación personal, no se activa ni despliega este perfil y no se recomienda escritura productiva. Rollback de código conserva D1/esquema/evidencia; no DROP ni restauración automática.
