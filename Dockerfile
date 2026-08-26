FROM node:20-alpine
WORKDIR /app
COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --omit=dev
COPY backend ./backend
COPY frontend ./frontend
RUN mkdir -p backend/data backend/uploads
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1
CMD ["node", "backend/server.js"]
