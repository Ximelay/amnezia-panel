# Amnezia Panel

A modern web administration panel for AmneziaVPN, built with Next.js App Router, T3 Stack, and tRPC. This panel provides an intuitive interface for managing your AmneziaVPN instances.

[![Built with T3 Stack](https://img.shields.io/badge/Built%20with-T3%20Stack-blue)](#)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](#)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **API Project:** [Amnezia API](https://github.com/kyoresuas/amnezia-api) - Required backend service

## Overview

Amnezia Panel is a web-based administration interface that integrates with the _Amnezia API_ to manage AmneziaVPN instances. It provides a user-friendly dashboard for configuring VPN servers, managing clients, and monitoring connection statistics.

**⚠️ Security Notice:** The panel exposes port 8443. Ensure this port is properly secured with a firewall, reverse proxy (nginx), or cloud security groups before deployment.

## Deployment & Quick Start

Follow these instructions to deploy and run the project locally for development and testing.

### Prerequisites

- [Amnezia API](https://github.com/kyoresuas/amnezia-api)
- [Docker and Docker Compose](https://docs.docker.com/engine/install/)
- [Node.js](https://nodejs.org/) (The script _deploy.sh_ will install)
- [yarn](https://yarnpkg.com/) (The script _deploy.sh_ will install)

### Step 1: Docker

Install Docker and Docker Compose using [official docs](https://docs.docker.com/engine/install/)

### Step 2: One-Command Deployment

```bash
# Clone the repository at directory /root or /home or /opt
git clone https://github.com/slowy19/amnezia-panel.git
cd amnezia-panel

# Build the web app from root
bash scripts/deploy.sh
```

### Step 3: Security

Protect port 8443 properly with a firewall or reverse proxy (nginx).

## Encryption

Client VPN configurations are **encrypted at rest** in the database using the **AES-256-GCM** algorithm. This industry-standard encryption ensures that sensitive client data remains secure, even in the event of unauthorized database access.

ENCRYPTION_KEY is created by the command:

```bash
openssl rand -base64 32
```

**Note:** Save the encryption key.

## Optional Features

### Telegram Bot Integration

If you provide a **Telegram Bot Token** during deployment, the panel will unlock additional functionality:

- **Admin Notifications** – Send notifications to admins when users make a payment for the VPN.

- **User Notifications** – Send clients their VPN configuration and download instructions directly via Telegram.

- **Payment Notifications** – If a client's configuration expires tomorrow, they will be notified.

To use these features, simply provide your bot token in the `.env` file (`TELEGRAM_BOT_TOKEN`) and set `NEXT_PUBLIC_USES_TELEGRAM_BOT=true` (this is done automatically by the deployment script if a token is supplied).

> **Note:** The bot token is optional – the panel works perfectly without it, but you will lose the notification and payment capabilities.

## Project Architecture

```
amnezia-panel/
├── prisma/                    # Database schema and migrations
│   ├── generated/             # Prisma client (auto-generated)
│   └── schema.prisma          # Database schema definition
│   ├── public/
│   │   ├── favicon.ico        # AmneziaVPN icon
├── panel/                     # Main application directory
│   ├── src/
│   │   ├── app/               # Next.js App Router pages
│   │   ├── components/        # Reusable React components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utilities and helpers
│   │   ├── server/            # Backend API routes & logic
│   │   ├── styles/            # Global CSS and themes
│   │   ├── trpc/              # tRPC API definition and routers
│   │   └── env.js             # Environment validation
│   ├── docker-compose.yaml    # Multi-container orchestration
│   ├── Dockerfile             # Application container definition
│   ├── start.sh               # Container entrypoint script
│   ├── .env.example           # Configuration template
│   └── package.json           # Dependencies and scripts
├── scripts/
│   ├── backup-db.sh           # Database backup automation
│   └── deploy.sh              # Production deployment script
└── LICENSE
└── README.md                  # This documentation
```

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/slowy19/amnezia-panel/issues)
- Amnezia API: [Required backend service](https://github.com/kyoresuas/amnezia-api)
