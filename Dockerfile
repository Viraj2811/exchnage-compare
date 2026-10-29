FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production PORT=3000 TRUST_PROXY=1
EXPOSE 3000
USER node
CMD ["node", "server.js"]
