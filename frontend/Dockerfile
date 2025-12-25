FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

ARG VITE_POCKETBASE_URL
ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL

# Copy the rest of the source code and build the project
COPY . .
RUN npm run build

# Stage 2: Production stage
# Uses Nginx to serve the static files created in Stage 1
FROM nginx:stable-alpine

# Copy the static 'dist' folder from the builder stage to Nginx's serving directory
# Note: Vite outputs to 'dist', whereas Create React App outputs to 'build'
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]