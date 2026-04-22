# Amnezia Panel

A modern web administration panel for AmneziaVPN, built with Next.js App Router, T3 Stack, and tRPC. This panel provides an intuitive interface for managing your AmneziaVPN instances.

[![Built with T3 Stack](https://img.shields.io/badge/Built%20with-T3%20Stack-blue)](#)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](#)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **API Project:** [Amnezia API](https://github.com/kyoresuas/amnezia-api) - Required backend service

## Overview

Amnezia Panel is a web-based administration interface that integrates with the _Amnezia API_ to manage AmneziaVPN instances. It provides a user-friendly dashboard for configuring VPN servers, managing clients, and monitoring connection statistics.

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

### Step 3: Create Initial Root User

After the deployment script completes, you must create the initial administrative user. Run the following command from the project root:

```bash
bash scripts/setup-root.sh
```

The script will guide you through creating the ROOT user account. You will be prompted to set:

- An username (defaults to root if left blank, though changing it is strongly recommended for security).
- A temporary password.

**Important**: The password you set here is temporary. Upon first login, the web panel will require you to change it before you can access any functionality.

> 🔐 Security of administrative scripts
> Both `setup-root.sh` and the recovery script `reset-root.sh` are protected by a `ROOT_SECRET` environment variable. This secret is automatically generated during deployment using `openssl rand -base64 32` and stored in the `.env` file. The scripts will only execute if the provided secret matches the one on record. This ensures that:
>
> - No one can run these scripts without access to the server's file system.
> - Remote code execution or web-based attacks cannot trigger privilege escalation.

#### Lost access?

If you forget the `ROOT` username or password, you can safely reset the account using:

```bash
bash scripts/reset-root.sh
```

See the Account Recovery section for details.

## Encryption

Client VPN configurations are **encrypted at rest** in the database using the **AES-256-GCM** algorithm. This industry-standard encryption ensures that sensitive client data remains secure, even in the event of unauthorized database access.

ENCRYPTION_KEY is created by the command:

```bash
openssl rand -base64 32
```

**Note:** Save the encryption key.

## Authentication & Authorization

The panel implements a robust, token-based security model designed for modern web applications.

### Session Management

- **JWT (JSON Web Token)** – Access tokens are issued upon successful login and expire after **2 hours** of inactivity. This short-lived token approach minimizes the risk window if a token is compromised.
- **CSRF Protection** – A dedicated CSRF token is required for all state-changing requests (POST, PUT, DELETE), preventing cross-site request forgery attacks.

### User Roles and Privileges

The system distinguishes between two distinct roles with clearly separated responsibilities:

| Role      | Capabilities                                                                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ROOT**  | • Add new administrative users (all added users receive the `ADMIN` role)<br>• Delete existing `ADMIN` accounts<br>• Change their own login username (the default `root` username should be changed for security)<br>• Full VPN instance and client management |
| **ADMIN** | • Manage VPN servers and client configurations<br>• View statistics and connection logs<br>• **Cannot** manage other user accounts                                                                                                                             |

> **Note:** Only **one** `ROOT` account may exist in the system at any time. The initial account created via `setup-root.sh` is assigned this role.

### Mandatory Password Change

To enforce strong security hygiene, the panel enforces the following password policy:

- **First Login** – Immediately after authenticating with the temporary password set during deployment, the user is redirected to a password change form. Access to the rest of the panel is **blocked** until a new password is set.
- **Voluntary Change** – Any authenticated user may change their password at any time via the profile section within the panel.

### Root Login Customization

The `ROOT` user is created with a default username (`root`) unless specified otherwise during setup. Because this is a predictable target for brute-force attempts, the panel allows the `ROOT` user to **rename their own login** after their initial password change. This optional step significantly improves the security posture of the deployment and is highly recommended.

All credentials and sensitive data are handled exclusively over HTTPS (in production) and are never stored in plaintext (passwords are hashed using a secure one-way algorithm before database storage).

### Account Recovery (Root Only)

In the event that the `ROOT` user's credentials are lost or forgotten, the panel includes a secure command-line recovery utility:

```bash
bash scripts/reset-root.sh
```

**What it does:**

- Prompts for the `ROOT_SECRET` (found in the `.env` file).
- Hashes the new password and updates the database directly.

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
│   ├── backup-database.sh     # Database backup automation
│   └── backup-amnezia.sh      # Configurations backup automation, not tested
│   └── time2pay.sh            # Script for payment notifications to Telegram
│   └── deploy.sh              # Production deployment script
│   └── setup-root.sh          # Initial ROOT user creation
│   └── reset-root.sh          # ROOT account recovery
└── LICENSE
└── README.md                  # This documentation
```

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/slowy19/amnezia-panel/issues)
- Amnezia API: [Required backend service](https://github.com/kyoresuas/amnezia-api)
