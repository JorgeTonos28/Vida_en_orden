# Matriz de ejecución de las 43 operaciones

Ensayo con datos, identidades, permisos y WebAuthn exclusivamente sintéticos. El mismo escenario pasa en SQLite y en D1/workerd locales, con 55 ejecuciones para cubrir variantes. Nunca se presenta como aprobación humana o ejecución alojada. La comparación incluye delta exacto, una auditoría de commit obligatoria, recibo, lectura de filas, verificación de firma/referencias y reintento idempotente por cada paso.

| Operación | Fase | Riesgo | SQLite / D1 local | QA alojada |
|---|---|---|---|---|
| task.create | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| task.update | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| task.duplicate | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| task.archive | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| task.complete | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| task.delete | 4 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| task.reorder | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| journal.create | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| journal.update | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| journal.delete | 4 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| workspace.update | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| area.create | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| area.update | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| project.create | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| project.update | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| event.create | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| event.update | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| event.cancel | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| task.context | 4 | R1 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.account.create | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.account.update | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.account.archive | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.category.create | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.category.update | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.category.delete | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.transaction.create | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.transaction.update_amount | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.transaction.void | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.budget.set | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.budget.update | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.budget.addition.create | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.budget.delete | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.obligation.create | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.obligation.update | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.obligation.pay | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.goal.create | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.goal.update | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.goal.contribute | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.goal.entry.update | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.goal.entry.revert | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| finance.settings.update | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| task.movement.create | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |
| task.movement.delete | 5 | R2 | Aprobada, WebAuthn sintético | Bloqueada por revisión/activación/canal humano |

Fuente reproducible: tests/helpers/business-roundtrip.ts y tests/mcp-business-roundtrip.test.ts. La cobertura compara el conjunto ejecutado con las claves reales del catálogo: una operación nueva sin escenario hace fallar CI. No hay operaciones bancarias externas.

Variantes adicionales: completar/reabrir y archivar/desarchivar, duplicación con referencia a la copia, ingresos/gastos/transferencia/ajuste, comisión ACH de 6 centavos sobre 12.345, pago parcial/total recurrente, reserva/aporte/consumo/anulación/reversión y presupuesto base/adición. La auditoría queda append-only.

Para cada fila alojada, tras autorización: preparar su equivalente ficticio, revisión del diff por el propietario y firma WebAuthn propia de QA, commit, recibo, lectura del módulo y auditoría; comprobar el estado persistido exacto y reintento sin duplicar. No iniciar mientras los cierres estén activos. USER_ACCEPTANCE_TESTS y QA_EXECUTION_SECURITY_REVIEW definen las puertas previas.
