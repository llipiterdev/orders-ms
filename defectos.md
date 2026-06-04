# Registro de Defectos — orders-ms

Este documento registra los defectos encontrados durante la ejecución de pruebas unitarias de `OrderService`.

---

## Formato 1: Lista detallada (narrativa)

### Defecto 01

- **Caso de prueba**: `shouldRejectCreateWhenUserIdIsWhitespaceOnly` (sugerido; aún no implementado)
- **Entrada**: `userId = "   "` (solo espacios), `amount = 100`, mock de pago APPROVED
- **Resultado esperado**: `BadRequestException` con el mismo criterio que `userId` vacío
- **Resultado obtenido**: La orden se crea con `userId: "   "` y continúa el flujo de pago hacia `payments-ms`
- **Causa probable**: `assertCreatePayload` comprueba valores vacíos (`!userId`) pero no aplica `trim()` sobre la cadena
- **Estado**: Abierto

---

### Defecto 02

- **Caso de prueba**: `shouldSetStatusFailedWhenPaymentHttpReturns500`
- **Entrada**: Crear orden con `userId = "user1"`, `amount = 100`; mock de `axios.post` con `status: 500`
- **Resultado esperado**: Orden en estado `FAILED` con error trazable en `lastError`
- **Resultado obtenido**: Orden en `FAILED`; el comportamiento coincide con lo esperado
- **Causa probable**: N/A — no se trata de un fallo de implementación; la prueba confirma el manejo correcto de HTTP 5xx (regla R7)
- **Estado**: Resuelto

---

## Formato 2: Tabla de defectos (bug tracking)


| ID  | Caso de Prueba                                            | Entrada                                               | Resultado Esperado        | Resultado Obtenido                   | Causa Probable                             | Estado   |
| --- | --------------------------------------------------------- | ----------------------------------------------------- | ------------------------- | ------------------------------------ | ------------------------------------------ | -------- |
| 01  | `shouldRejectCreateWhenUserIdIsWhitespaceOnly` (sugerido) | `userId = " "`, `amount = 100`                        | `BadRequestException`     | Orden creada; flujo de pago continúa | Falta de `trim()` en `assertCreatePayload` | Abierto  |
| 02  | `shouldSetStatusFailedWhenPaymentHttpReturns500`          | `userId = "user1"`, `amount = 100`, HTTP 500 en pagos | `FAILED` + error trazable | `FAILED` (comportamiento correcto)   | N/A — validado por prueba                  | Resuelto |


---

## Convenciones de Estado

- **Abierto** → El defecto aún no se corrige.
- **En progreso** → El defecto está siendo trabajado.
- **Resuelto** → El defecto fue corregido y validado con pruebas.

