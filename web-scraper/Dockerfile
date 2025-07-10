# Web Scraper Dockerfile for Node.js Express app with Playwright
FROM mcr.microsoft.com/playwright:v1.53.0-jammy

# Set work directory
WORKDIR /app

# Set npm registry to use Taobao mirror and install dependencies
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --only=production

# Copy application code
COPY . .

# Create a non-root user and set permissions
RUN useradd --create-home --shell /bin/bash scraper && \
    chown -R scraper:scraper /app
USER scraper

# Expose port
EXPOSE 3001

# Run the application
CMD ["npm", "start"] 