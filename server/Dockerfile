# FreeArcade Multiplayer Server
# Dockerfile for alternative deployment (Render, Railway, Fly.io)
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js ./

EXPOSE 10000

CMD ["node", "server.js"]
