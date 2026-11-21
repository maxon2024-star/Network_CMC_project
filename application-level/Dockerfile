# Этап 1: сборка React-приложения
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# Этап 2: сервер прикладного уровня (статика, SSE, валидация команд)
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY src/server.mjs src/commandValidator.mjs ./

EXPOSE 3000

CMD ["node", "server.mjs"]
