# Wiki — Taller de Pruebas Unitarias (orders-ms)

**Wiki publicada:** [Orders‐ms Wiki!](https://github.com/llipiterdev/orders-ms/wiki/Orders%E2%80%90ms-Wiki!)

**Repositorio de código:** [llipiterdev/orders-ms](https://github.com/llipiterdev/orders-ms) · rama `main`

**Guía operativa:** [README.md](https://github.com/llipiterdev/orders-ms/blob/main/README.md) · **Defectos:** [defectos.md](https://github.com/llipiterdev/orders-ms/blob/main/defectos.md) · **Integrantes:** [integrantes.txt](https://github.com/llipiterdev/orders-ms/blob/main/integrantes.txt)

> En GitHub Wiki los enlaces deben apuntar al **repo de código** (`blob/main/...`), no rutas relativas `../src/`. Las imágenes usan `raw.githubusercontent.com` (archivos en `docs/img/` del repo).

---

## Glosario

En las tablas se utilizan las siguientes abreviaturas.

| Abreviatura | Nombre completo | Qué significa en la práctica |
|-------------|-----------------|------------------------------|
| **CE** | **Clase de equivalencia** | **Grupo de entradas** que el programa trata **de la misma forma**. Al probar un caso representativo del grupo (éxito o fallo), no es necesario repetir todas las variantes de esa clase. Ejemplo: los `userId` vacíos (`''`, solo espacios) pertenecen a la misma clase «inválido». |
| **VL** | **Valor límite** | Dato situado en el **borde** entre dos clases, donde suelen aparecer defectos. Ejemplo: el bulk permite 1–50; los límites son **1** (mínimo válido), **50** (máximo válido), **0** y **51** (inmediatamente fuera del rango). |
| **R1, R2…** | **Regla de negocio** | Requisito que el sistema debe cumplir (ver tabla de reglas). Cada prueba debe proteger al menos una regla. |
| **NF** | **Not Found** (no encontrado) | La orden u otro recurso **no existe** en base de datos; el sistema debe responder con error y no inventar datos. |

---

## Inicio

### Dominio

Microservicio de **órdenes** del sistema Order & Payment: crear y consultar órdenes, integrar pagos síncronos con `payments-ms`, cancelar, reintentar pagos, bulk, reembolsos, ledger y metadata.

La lógica de negocio concentrada para pruebas unitarias está en:

- [order.service.ts](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts) — servicio bajo prueba (`OrderService`)
- [order.service.spec.ts](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts) — suite unitaria (31 pruebas)

### Alcance del taller

| Incluido | Excluido (esta entrega) |
|----------|-------------------------|
| Pruebas unitarias de `OrderService` | Pruebas E2E de controladores |
| Mocks de TypeORM y `axios` | PostgreSQL real en unitarios |
| TDD, AAA, CE, VL, BDD documentados | `main.ts`, módulos, controllers en cobertura |

---

## TDD (Red → Green → Refactor)

### Ciclo 1 — `userId` obligatorio

| Fase | Descripción |
|------|-------------|
| **RED** | Escribir [shouldRejectCreateWhenUserIdIsEmpty](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L168-L176) esperando `BadRequestException`. |
| **GREEN** | Validación en [assertCreatePayload](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L38-L45). |
| **REFACTOR** | Mantener un único método privado para validar creación. |

### Ciclo 2 — Cancelación solo en `PENDING`

| Fase | Descripción |
|------|-------------|
| **RED** | Escribir [shouldRejectCancelWhenStatusIsNotPending](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L293-L301). |
| **GREEN** | [cancelOrder](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L177-L188) lanza `ConflictException` si no está `PENDING`. |
| **REFACTOR** | Agrupar pruebas en `describe('cancelOrder')` en el spec. |

### Ciclo 3 — Límite bulk (50)

| Fase | Descripción |
|------|-------------|
| **RED** | Escribir [shouldRejectBulkWhenCountIsFiftyOne](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L352-L357). |
| **GREEN** | Validar rango en [bulkCreate](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L277-L298). |
| **REFACTOR** | Constantes [BULK_MIN y BULK_MAX](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L15-L16). |

### Ciclo 4 (adicional) — Pago rechazado

| Fase | Descripción |
|------|-------------|
| **RED** | [shouldSetStatusFailedWhenPaymentIsDeclined](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L119-L128). |
| **GREEN** | Rama `DECLINED` en [executePaymentAttempt](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L91-L167). |
| **REFACTOR** | Helpers `mockPaymentApproved` / `mockPaymentDeclined` en el spec. |

---

## Patrón AAA (Arrange – Act – Assert)

### Pautas usadas

1. Separar cada prueba en tres bloques con comentarios `// Arrange`, `// Act`, `// Assert`.
2. Preparar mocks de pago y repositorio en Arrange; no mezclar aserciones en Act.
3. Reutilizar helpers (`mockPaymentApproved`, `buildRepoMock`) solo en Arrange.
4. Una responsabilidad por prueba (un comportamiento / una regla).

### Ejemplo real (enlace al código)

Prueba: [shouldCreateOrderWhenPaymentIsApproved](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L88-L117)

```typescript
// Arrange
mockPaymentApproved('pay-1');

// Act
const order = await service.createOrder('user1', 100);

// Assert
expect(order.status).toBe('PAID');
expect(order.userId).toBe('user1');
```

Configuración Nest en el spec: `Test.createTestingModule` + `getRepositoryToken(OrderEntity)` + `jest.mock('axios')`.

---

## Clases de equivalencia y valores límite

### Justificación de bordes — bulk `count` (R11)

| Valor | Tipo | Justificación |
|-------|------|---------------|
| **0** | VL | Inmediatamente debajo del mínimo permitido (1) |
| **1** | VL | Mínimo válido |
| **50** | VL | Máximo válido |
| **51** | VL | Inmediatamente por encima del máximo |

Constantes: [BULK_MIN = 1, BULK_MAX = 50](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L15-L16) en `OrderService`.

### Justificación — validación de creación (R1, R2)

| Entrada | Clase | Borde |
|---------|-------|-------|
| `userId = ''` | CE inválido | Cadena vacía |
| `amount = null` | CE inválido | Ausencia de valor |
| `amount = NaN` | CE inválido | No numérico |

---

## Matriz de pruebas

| Clase / VL | Entrada representativa | Resultado esperado | Prueba |
|------------|------------------------|-------------------|--------|
| CE válido + pago OK | user1, 100, APPROVED | `PAID` | [shouldCreateOrderWhenPaymentIsApproved](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L88) |
| CE pago rechazado | DECLINED | `FAILED` | [shouldSetStatusFailedWhenPaymentIsDeclined](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L119) |
| CE error red | axios reject | `FAILED` | [shouldSetStatusFailedWhenPaymentNetworkFails](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L130) |
| CE userId inválido | `userId=''` | `BadRequestException` | [shouldRejectCreateWhenUserIdIsEmpty](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L168) |
| CE amount nulo | `amount=null` | `BadRequestException` | [shouldRejectCreateWhenAmountIsNull](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L178) |
| CE amount NaN | `amount=NaN` | `BadRequestException` | [shouldRejectCreateWhenAmountIsNaN](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L185) |
| CE HTTP 5xx | status 500 | `FAILED` | [shouldSetStatusFailedWhenPaymentHttpReturns500](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L142) |
| CE respuesta desconocida | `PENDING_REVIEW` | `FAILED` + error | [shouldSetStatusFailedWhenPaymentStatusIsUnknown](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L153) |
| VL bulk bajo | count=0 | `BadRequestException` | [shouldRejectBulkWhenCountIsZero](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L345) |
| VL bulk mín | count=1 | 1 orden | [shouldCreateBulkWhenCountIsOne](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L359) |
| VL bulk máx | count=50 | 50 órdenes | [shouldCreateBulkWhenCountIsFifty](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L372) |
| VL bulk alto | count=51 | `BadRequestException` | [shouldRejectBulkWhenCountIsFiftyOne](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L352) |
| CE cancel OK | `PENDING` | `CANCELLED` | [shouldCancelOrderWhenStatusIsPending](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L265) |
| CE cancel conflicto | `PAID` | `ConflictException` | [shouldRejectCancelWhenStatusIsNotPending](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L293) |
| CE retry OK | `FAILED` → APPROVED | `PAID`, 2 intentos | [shouldRetryPaymentWhenStatusIsFailed](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L306) |

Más casos: [order.service.spec.ts completo](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts) (refund, ledger, metadata, filtros).

### Trazabilidad reglas → pruebas

| Regla | Pruebas |
|-------|---------|
| R1 | [shouldRejectCreateWhenUserIdIsEmpty](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L168) |
| R2 | [amount null](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L178), [NaN](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L185) |
| R3–R4 | [shouldCreateOrderWhenPaymentIsApproved](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L88) |
| R5–R8 | [Declined](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L119), [Network](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L130), [500](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L142), [Unknown](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L153) |
| R9–R10 | [cancel](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L265), [retry](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L306) |
| R11 | [bulk 0/1/50/51](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L345) |
| R12–R15 | [refund](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L386), [ledger](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L423), [metadata](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L450), [filtros](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L234) |

---

## BDD (Given – When – Then)

| Prueba | Escenario |
|--------|-----------|
| [shouldCreateOrderWhenPaymentIsApproved](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L88) | **Given** usuario y monto válidos y pagos aprueba, **When** se crea la orden, **Then** estado PAID y `paymentId` guardado |
| [shouldRejectCreateWhenUserIdIsEmpty](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L168) | **Given** monto sin userId, **When** se crea, **Then** error de validación |
| [shouldCancelOrderWhenStatusIsPending](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L265) | **Given** orden pendiente, **When** se cancela, **Then** CANCELLED |
| [shouldRejectCancelWhenStatusIsNotPending](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L293) | **Given** orden pagada, **When** se cancela, **Then** conflicto de estado |
| [shouldRetryPaymentWhenStatusIsFailed](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L306) | **Given** orden fallida, **When** se reintenta y aprueba, **Then** PAID e intentos incrementados |
| [shouldRejectBulkWhenCountIsFiftyOne](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L352) | **Given** bulk de 51, **When** se valida, **Then** rechazo por límite |

---

## Resultados — Cobertura

### Comandos (equivalente a JaCoCo en Java)

```bash
git clone https://github.com/llipiterdev/orders-ms.git
cd orders-ms
npm install
npm test
npm run test:cov
```

Reporte local (no versionado): `coverage/lcov-report/index.html`.

### Métricas actuales ([order.service.ts](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts))

> Ejecutar `npm run test:cov` y actualizar si el código cambia.

| Métrica | Valor |
|---------|-------|
| Líneas | **90,4 %** |
| Statements | **89,84 %** |
| Branches | **85,36 %** |
| Umbral | ≥ 80 % en [package.json](https://github.com/llipiterdev/orders-ms/blob/main/package.json#L82-L87) |

**Líneas sin cubrir (Jest):** `50-58`, `119`, `138-139`, `226-231`, `264`

### Líneas sin cubrir — enlaces al código

| Líneas | Enlace | Motivo |
|--------|--------|--------|
| 50–58 | [scheduleExpiry — callback](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L50-L58) | Timer no ejecutado en unitarios |
| 138–139 | [PAYMENT_APPROVED_AFTER_EXPIRY](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L138-L139) | Carrera con expiración |
| 119, 226–231, 264 | [validateStatus en axios](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L119) | Callbacks inline; flujos sí probados |

### Evidencia de cobertura (capturas)

#### 1. Resumen global

<img src="https://raw.githubusercontent.com/llipiterdev/orders-ms/main/docs/img/image-1.png" alt="Resumen de cobertura global" width="720" />

#### 2. Detalle de order.service.ts

<img src="https://raw.githubusercontent.com/llipiterdev/orders-ms/main/docs/img/image-2.png" alt="Detalle cobertura — vista general" width="900" />

<img src="https://raw.githubusercontent.com/llipiterdev/orders-ms/main/docs/img/image-3.png" alt="Detalle cobertura — zoom" width="720" />

#### 3. Ejecución npm test

<img src="https://raw.githubusercontent.com/llipiterdev/orders-ms/main/docs/img/image-4.png" alt="31 tests passed" width="720" />

---

## Gestión de defectos

Archivo en el repo: [defectos.md](https://github.com/llipiterdev/orders-ms/blob/main/defectos.md)

Resumen: defecto 01 abierto (userId con espacios); defecto 02 resuelto (HTTP 500).

---

## Reflexión final

### Escenarios no cubiertos y por qué

- **Expiración por timer:** [scheduleExpiry](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L47-L63) — requiere `jest.useFakeTimers()` o E2E.
- **Carrera EXPIRED + APPROVED:** [líneas 138–139](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L138-L139).

### Defectos detectados por las pruebas

- Confirmación de HTTP 500: [shouldSetStatusFailedWhenPaymentHttpReturns500](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.spec.ts#L142).
- Hueco documentado en [defecto 01](https://github.com/llipiterdev/orders-ms/blob/main/defectos.md) (userId solo espacios).

### Cómo mejorar OrderService para facilitar pruebas

1. Inyectar `HttpService` en lugar de `import axios`.
2. Extraer expiración a un servicio inyectable.
3. Aplicar `trim()` en [assertCreatePayload](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L38-L45).

---

## Reglas de negocio (referencia)

| ID | Regla | Implementación |
|----|--------|----------------|
| R1 | `userId` obligatorio | [assertCreatePayload](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L38-L45) |
| R2 | `amount` obligatorio | idem |
| R3 | Crear → pago automático | [createOrder](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L65-L89) |
| R4–R8 | Estados de pago | [executePaymentAttempt](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L91-L167) |
| R9 | Cancelar solo `PENDING` | [cancelOrder](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L177-L188) |
| R10 | Reintentar solo `FAILED` | [retryPayment](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L190-L200) |
| R11 | Bulk [1, 50] | [bulkCreate](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L277-L298) |
| R12 | Refund | [requestRefund](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L248-L275) |
| R13 | Ledger | [getOrderLedger](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L212-L246) |
| R14 | Metadata | [patchOrderMetadata](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L300-L311) |
| R15 | Filtros | [getOrdersFiltered](https://github.com/llipiterdev/orders-ms/blob/main/src/orders/order.service.ts#L202-L210) |
