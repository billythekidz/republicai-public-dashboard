# RepublicAI Public Dashboard

A **read-only public** web dashboard for RepublicAI validators — share your node status with the community without exposing any sensitive controls or personal information.

> This is the **public-facing** version. For the full self-hosted dashboard with service control, compute jobs, and wallet management, see [republicai-dashboard](https://github.com/billythekidz/republicai-dashboard).

![Node.js](https://img.shields.io/badge/Node.js-22-green) ![Express](https://img.shields.io/badge/Express-4-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Preview

![Dashboard](screenshots/dashboard_1.jpg)

## Features

| Category | What's shown |
|----------|-------------|
| **Node Status** | Block height, sync status, peer count, validator status |
| **Services** | Systemd service status (read-only, no start/stop) |
| **Delegations** | Staking delegation info |
| **Validators** | All bonded validators with pagination |
| **Peers** | Connected peers list |
| **All Jobs** | Chain compute jobs (read-only) |
| **Query Job** | Look up any job by ID or TX hash |

### What's NOT included (by design)

- ❌ No service control (start/stop/restart)
- ❌ No compute job submission
- ❌ No custom command execution
- ❌ No wallet addresses or personal identifiers
- ❌ No config modification

## Setup

### Prerequisites

- **Linux / WSL** with `republicd` running
- **Node.js 22+** and **Python 3.7+**

### Quick Start

```bash
git clone https://github.com/billythekidz/republicai-public-dashboard.git ~/republicai-public-dashboard
cd ~/republicai-public-dashboard
npm install
python3 detect-config.py
node server.js
# → http://localhost:3848
```

### Expose via Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:3848
```

### Systemd Service

```bash
cp republic-dashboard.service /etc/systemd/system/republic-public-dashboard.service
# Edit paths if needed
systemctl daemon-reload
systemctl enable --now republic-public-dashboard
```

## Security

This dashboard is designed to be safe for public access:
- **Read-only commands only** — no service control, no shell execution
- **No wallet/personal data** — wallet addresses, valoper, and keyring info are stripped
- **No config endpoints** — `/api/config` returns only moniker and chain_id
- **No dangerous scripts** — compute, share-peers, and custom command are removed

## License

MIT
