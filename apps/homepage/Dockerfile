FROM oven/bun:1.3.10 AS build

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .
RUN bun run build

FROM node:22-alpine AS runtime

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist ./dist

ENV PORT=8080

CMD ["sh", "-lc", "serve -s dist -l tcp://0.0.0.0:${PORT:-8080}"]
