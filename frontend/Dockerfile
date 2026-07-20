FROM node:20-bullseye AS builder
WORKDIR /app
RUN npm config set strict-ssl false
COPY package*.json ./
RUN npm install

ARG VITE_POCKETBASE_URL
ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL

COPY . .
RUN npm run build

# Stage 2: Production stage
FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
