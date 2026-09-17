# ---- build 阶段：安装全部依赖并构建前端 ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runner 阶段：仅生产依赖 + 构建产物 ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Shanghai
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/server ./server
EXPOSE 3000
CMD ["npx", "tsx", "server/index.ts"]
