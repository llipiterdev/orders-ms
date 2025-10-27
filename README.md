# Orders Microservice



Este es el microservicio de órdenes para el sistema "Order & Payment System". Maneja la creación y consulta de órdenes, comunicándose con el microservicio de pagos para procesar transacciones.

## Características

- **Framework**: NestJS con TypeScript
- **Puerto**: 3000
- **Almacenamiento**: En memoria (sin base de datos)
- **Comunicación**: REST con `payments-ms` en puerto 3001

## Endpoints

- `POST /orders` - Crea una nueva orden con `{ userId: string, amount: number }`
- `GET /orders` - Lista todas las órdenes
- `GET /orders/:id` - Obtiene el detalle de una orden por ID

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

Al crear una orden, se llama automáticamente a `POST http://payments-ms:3001/payments` para procesar el pago. El estado de la orden se actualiza según la respuesta:
- `APPROVED` → Estado `PAID`
- `DECLINED` → Estado `FAILED`

## Docker

Para construir la imagen Docker:

```bash
docker build -t orders-ms .
docker run -p 3000:3000 orders-ms
```
