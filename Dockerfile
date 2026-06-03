FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173 8787

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
