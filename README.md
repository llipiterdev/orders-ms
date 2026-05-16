# Orders Microservice

Este es el microservicio de órdenes para el sistema "Order & Payment System". Gestiona creación y consulta, comunicación síncrona con pagos, expiración por temporizador, cancelación y reintentos.

## Características

- **Framework**: NestJS con TypeScript
- **Puerto**: 3000
- **Almacenamiento**: En memoria (sin base de datos)
- **Comunicación**: REST con `payments-ms` (URL configurable por env)

## Endpoints

- `GET /health`, `GET /metrics` (formato Prometheus básico)
- `POST /orders/bulk` — creación masiva (1–50) para carga / coste de red
- `POST /orders` — Cuerpo: `{ userId: string, amount: number, currency?: string }`
- `GET /orders` — Lista; filtros `?userId=&status=`
- `GET /orders/:id/ledger` — Vista cruzada con payments-ms (sin transacción)
- `GET /orders/:id` — Detalle
- `POST /orders/:id/cancel` — Solo en `PENDING`
- `POST /orders/:id/retry-payment` — Desde `FAILED`
- `POST /orders/:id/refund-request` — `{ amount }` → delega en pagos
- `PATCH /orders/:id/metadata` — Mapa clave/valor libre

### Variables de entorno relevantes

| Variable | Descripción |
|----------|-------------|
| `PAYMENTS_MS_URL` | Base URL de pagos (default `http://payments-ms:3001`) |
| `ORDER_EXPIRY_MS` | Tiempo hasta marcar `EXPIRED` si sigue pendiente/en vuelo |
| `PAYMENT_HTTP_TIMEOUT_MS` | Timeout HTTP hacia pagos |

## Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run start:dev

# Ejecutar en producción
npm run start:prod
```

## Testing

```bash
# Pruebas unitarias
npm run test

# Pruebas e2e
npm run test:e2e

# Pruebas de mutación con Stryker
npx stryker run
```

## Comunicación con Payments MS

Al crear una orden se llama a `POST {PAYMENTS_MS_URL}/payments` con cabecera `Idempotency-Key`. La respuesta `APPROVED` → `PAID`, `DECLINED` → `FAILED`. Pueden producirse carreras entre expiración (`ORDER_EXPIRY_MS`) y la respuesta del servicio de pagos.

## Docker

Para construir la imagen Docker:

```bash
docker build -t orders-ms .
docker run -p 3000:3000 orders-ms
```
