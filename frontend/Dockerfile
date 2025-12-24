FROM node:20-alpine AS builder

WORKDIR /app

# Copy only package files first to leverage Docker caching for faster builds
COPY package*.json ./
RUN npm install

# Copy the rest of the source code and build the project
COPY . .
RUN npm run build

# Stage 2: Production stage
# Uses Nginx to serve the static files created in Stage 1
FROM nginx:stable-alpine

# Remove default Nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy the static 'dist' folder from the builder stage to Nginx's serving directory
# Note: Vite outputs to 'dist', whereas Create React App outputs to 'build'
COPY --from=builder /app/dist /usr/share/nginx/html

# Optional: Copy a custom nginx.conf if you have one (see below)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]