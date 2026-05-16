# Build stage
FROM node:lts-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Production stage
FROM node:lts-alpine AS production

WORKDIR /app

COPY package*.json ./

# Sin optional: TypeORM lista better-sqlite3 como peer opcional y npm lo instalaría (fallo sin Python en Alpine)
RUN npm ci --omit=dev --omit=optional

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["npm", "run", "start:prod"]