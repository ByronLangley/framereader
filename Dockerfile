FROM node:20-slim

# Install ffmpeg and yt-dlp
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip python3-venv && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install yt-dlp && \
    ln -s /opt/venv/bin/yt-dlp /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy shared package
COPY shared/package.json shared/tsconfig.json ./shared/
COPY shared/src ./shared/src

# Copy backend package
COPY backend/package.json backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

# Copy root workspace files
COPY package.json package-lock.json tsconfig.base.json ./

# Install dependencies
RUN npm install --workspace=shared --workspace=backend

# Build shared
RUN npm run build --workspace=shared

# Build backend
RUN npm run build --workspace=backend

# Create tmp directory
RUN mkdir -p /app/backend/tmp

WORKDIR /app/backend

EXPOSE 3001

CMD ["node", "dist/index.js"]
