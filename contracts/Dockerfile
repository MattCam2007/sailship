FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN apk add --no-cache curl && npm ci

COPY hardhat.config.js ./
COPY deploy-entrypoint.sh ./
COPY contracts/ ./contracts/
COPY scripts/ ./scripts/

# Pre-compile contracts
RUN npx hardhat compile

EXPOSE 8545

# Default: run the hardhat node
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]
