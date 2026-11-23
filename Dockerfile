FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache ca-certificates wget \
    && wget -q https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -O /app/rds-global-bundle.pem

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY backend ./backend
COPY *.Html ./
COPY *.Css ./
COPY *.Js ./

ENV NODE_ENV=production
ENV DB_SSL_CA_PATH=/app/rds-global-bundle.pem

USER node

EXPOSE 3000

CMD ["node", "backend/server.js"]
