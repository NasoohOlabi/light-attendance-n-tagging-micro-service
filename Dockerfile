FROM oven/bun:1.3.0 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN HUSKY=0 bun install --frozen-lockfile --ignore-scripts
COPY index.html vite.config.ts tsconfig*.json ./
COPY src ./src
COPY shared ./shared
COPY public ./public
RUN bunx vite build

FROM oven/bun:1.3.0
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN HUSKY=0 bun install --frozen-lockfile --production --ignore-scripts
COPY --from=build /app/dist ./dist
COPY server ./server
COPY functions/notebook-service.ts ./functions/notebook-service.ts
COPY shared ./shared
USER bun
CMD ["bun", "run", "server/index.ts"]
