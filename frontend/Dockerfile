FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 4173
# Build with the runtime-provided VITE_API_BASE_URL (empty => same-origin, so
# the app works behind the `gateway` reverse proxy / EdgeOne), then serve the
# static build via `vite preview`. SPA fallback is handled by preview itself.
CMD ["sh", "-c", "npm run build && npm run preview -- --host 0.0.0.0 --port 4173"]
