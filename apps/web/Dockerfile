FROM node:24-alpine
WORKDIR /app
RUN npm install -g pnpm@11.5.2
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 5173
CMD ["pnpm", "--filter", "@another-me/web", "dev"]
