# Guía para una instalación independiente

Esta guía prepara una instancia nueva de Vida en Orden sin usar la cuenta, el Site, la base de datos, los secretos ni la autorización de otra persona. El repositorio es código compartido; los datos y permisos son siempre propios de cada instalación.

Para actualizar una instalación existente con datos, seguir [UPGRADE_AND_ROLLBACK](UPGRADE_AND_ROLLBACK.md) y [PHASE2_UPGRADE_REHEARSAL](PHASE2_UPGRADE_REHEARSAL.md). No crear otro Site, reemplazar DB ni usar freshInstallationOnly para sobrescribirla. El ensayo nativo local no sustituye el respaldo/ledger administrativo de Sites; el bloqueo y la solicitud preparada están en SITES_ADMIN_SUPPORT_REQUEST.

## 1. Crear la copia de trabajo

Usa un fork si vas a proponer cambios frecuentes al repositorio oficial, o un clon si solo vas a instalar y trabajar mediante ramas:

```sh
git clone https://github.com/JorgeTonos28/Vida_en_orden.git
cd Vida_en_orden
git switch -c chore/mi-instalacion
```

No copies `.env`, `.dev.vars`, respaldos, bases D1, logs ni archivos de la instalación de otra persona. El archivo `.openai/hosting.json` público contiene un marcador; no lo sustituyas por un identificador que no sea tuyo.

## 2. Dar el proyecto a Codex

Pide a Codex que lea, en este orden:

1. `AGENTS.md`;
2. `docs/CURRENT_STATE.md`;
3. `docs/ROADMAP.md`;
4. `docs/ARCHITECTURE.md`, `docs/INSTALLATION.md`, `docs/MCP_SETUP.md` y esta guía;
5. el código y las pruebas reales antes de asumir que una función existe.

El prompt listo para copiar aparece al final de este documento. Codex debe trabajar en una rama y no debe usar datos de terceros.

## 3. Comprobar el clon sin datos privados

Requisitos: Git, Node.js `>=22.13.0` y una instalación limpia de dependencias.

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
```

`verify:independent` crea una D1 local temporal con Wrangler, aplica todas las migraciones SQL contiguas desde `drizzle/0000`, ejecuta una consulta de humo y elimina el directorio temporal. El main integrado llega hasta `0012` (13 SQL/48 tablas/54 triggers e índice de contexto de auditoría). No ejecuta `--remote`, no necesita un token y no importa datos. `verify:schema` comprueba que Drizzle no genere cambios en una copia temporal. `verify:worker` ejecuta el Worker compilado con la cadena original y `verify:sites` con la proyección de esquema; ambos usan D1 y credenciales exclusivamente sintéticas en HTTPS loopback, incluyendo las 31 lecturas y 27 comprobaciones de la interfaz. No certifican aprobación humana en ChatGPT.

`test:mcp` también invoca individualmente las 31 herramientas con el esquema SQL real y datos ficticios, prueba una base vacía y compara dos bases independientes. Las lecturas no deben insertar valores predeterminados. La primera escritura de la interfaz tampoco debe cargar tareas ni proyectos de la instalación original; `scripts/qa-v2.mjs` comprueba esta condición únicamente contra una vista local aislada.

Conserva el marcador del manifiesto en la rama pública. Para publicar, prepara un checkout separado, por ejemplo dentro del directorio ignorado `work/instance/`, y configura allí el manifiesto propio. `verify:independent` audita la copia pública y rechaza por diseño un manifiesto con identidad real: ejecútalo en el checkout público después del build. No publiques la configuración privada mediante el PR.

## 4. Crear el Site y la D1

Para una QA nueva de fases 3–7 seguir el precedente de issue #15 y ISSUE15_QA_ACCEPTANCE_REPORT: autorización explícita de creación/publicación y opt-in de metadatos, source oficial verificado y recursos nuevos owner-only. No copiar D1, identidad, secretos ni WebAuthn de otra instalación. La proyección freshInstallationOnly no actualiza instalaciones existentes ni resuelve issue #13. La versión integrada puede exponer42/44 herramientas con flags autorizados, pero las 31 originales y la ejecución de negocio cerrada se conservan.

Para la entrega de bootstrap usa SITES_METADATA_BOOTSTRAP.md: exportar desde HEAD limpio con prepare:sites, usar esa fuente como plantilla y verificar el gate en el checkout proyectado. No modificar originales ni aplicar su DML de metadatos a ciegas en Sites. La versión completa local llega a 0012 (13 SQL/48 tablas); el bootstrap de metadatos ocurre en la primera preparación autenticada y no en lecturas.

La creación de un ChatGPT Site y la vinculación de una base D1 dependen de las capacidades disponibles en la cuenta y requieren intervención dentro de ChatGPT Sites. El repositorio no puede importar automáticamente el Site de otra cuenta.

En el Site nuevo:

1. crea un proyecto privado de Vida en Orden;
2. configura una base D1 nueva, vacía y exclusiva de ese Site;
3. declara el binding con nombre exacto `DB`;
4. configura el manifiesto del Site con el `project_id` propio, manteniendo `d1: "DB"` y la capacidad `mcp`;
5. aplica las migraciones en orden desde `drizzle/` usando el flujo de despliegue documentado por Sites;
6. no cargues el JSON de respaldo ni seeds con datos reales.

Para la rama de fases 3–7 sigue SITES_METADATA_BOOTSTRAP.md: prepare:sites exporta una proyección de esquema desde un commit limpio; verify:hosting debe pasar en el checkout privado proyectado antes de publicar. Los SQL originales se conservan. El primer registro o preparación explícitos y autenticados inicializa los metadatos atómicamente; las lecturas no lo hacen. Este flujo se publicó satisfactoriamente en una instancia privada nueva. El visor de tablas es de lectura, no constituye un migrador. No inventes SQL MCP ni modifiques ledgers para actualizar una instalación existente; inspecciona su estado y sigue UPGRADE_AND_ROLLBACK.md. Nunca uses una base remota para la prueba local.

## 5. Identidad y permisos

El MCP falla cerrado si faltan los headers de identidad o si no existe una política de propietario. Configura en el Site nuevo secretos propios, nunca los de otra instalación:

- `MCP_OWNER_EMAIL`: correo del propietario de esta instalación;
- `MCP_OWNER_USER_ID`: identificador autenticado del propietario, si la plataforma lo proporciona y se desea exigir la coincidencia adicional;
- `MCP_BUSINESS_WRITES_ENABLED` es una constante fijada en `false` en el código: no es un secreto ni una variable para habilitar escrituras.

El Site debe conservar acceso privado/custom y autorizar únicamente al propietario que corresponda a esa instancia. Una persona autorizada en otro Site no obtiene acceso a esta base. No pongas el correo en el código ni en un archivo versionado.

## 6. Publicar y conectar el MCP

Publica solo una versión guardada que corresponda a un commit revisado. Luego registra el endpoint MCP propio del Site en la conexión de ChatGPT y verifica:

1. `server/discover` responde con el protocolo esperado;
2. `tools/list` devuelve 31 herramientas;
3. `get_capabilities` informa `readOnly: true` y `businessWritesEnabled: false`;
4. `get_my_profile` devuelve únicamente la identidad propia;
5. una solicitud sin identidad es rechazada;
6. una identidad distinta al propietario es rechazada;
7. `search_tasks`, `list_accounts` y `validate_references` solo consultan la base de esta instalación;
8. ningún contrato MCP permite crear, editar, eliminar, anular o restaurar información.

La prueba real desde una segunda cuenta de ChatGPT requiere que el propietario de esa cuenta conecte manualmente su propio Site/plugin. Este repositorio no afirma que tal conexión pueda importarse automáticamente.

## 7. Continuar una fase

Antes de implementar una fase pendiente, compara `CURRENT_STATE.md`, `ROADMAP.md`, el commit base y los PR abiertos. La infraestructura de instalación no completa la fase 3. Para una fase funcional:

1. crea una rama con alcance limitado;
2. declara dependencias, contratos, migraciones, pruebas y rollback;
3. prueba en una D1 independiente;
4. actualiza documentación y changelog;
5. abre un PR hacia `main`;
6. espera CI y revisión antes del merge;
7. decide por separado si publicar el cambio en tu Site.

## Prompt para copiar en Codex

```text
Estoy creando una instalación independiente de Vida en Orden a partir del repositorio público:
https://github.com/JorgeTonos28/Vida_en_orden

Trabaja únicamente con este clon y con una base D1 de prueba propia. No uses ni solicites datos, secretos, respaldos, identificadores, correos, permisos o archivos de otra instalación. Lee primero AGENTS.md, docs/CURRENT_STATE.md, docs/ROADMAP.md, docs/ARCHITECTURE.md, docs/INSTALLATION.md, docs/MCP_SETUP.md y docs/NEW_INSTANCE_GUIDE.md.

Objetivos:
1. Auditar el clon y confirmar que no contiene datos privados.
2. Ejecutar npm ci, las pruebas financieras y MCP, TypeScript, lint, build y npm run verify:independent.
3. Preparar un Site nuevo, privado y separado, con una D1 nueva y el binding DB.
4. Configurar mi propia identidad y propietario mediante secretos del Site; si falta identidad o política, el MCP debe rechazar la solicitud.
5. Mantener el MCP exclusivamente de lectura: 31 herramientas, readOnly=true, businessWritesEnabled=false y sin exponer escrituras mediante MCP.
6. Documentar qué pasos requieren intervención manual en ChatGPT Sites y no afirmar que el Site o plugin de otra cuenta pueda importarse automáticamente.

No avances a la fase 3. No despliegues sobre la instalación de otra persona. No modifiques una D1 remota ni migres producción sin autorización explícita. Trabaja en una rama, informa los comandos ejecutados, los resultados, los bloqueos y el commit exacto. Si propones cambios al repositorio oficial, abre un pull request y no hagas push directo a main.
```
