<div align="center">

<img src="packages/desktop-client/public/android-chrome-192x192.png" alt="Actual Budget logo" width="96" />

# Actual Budget — CaptainPeeples Edition

A custom build of [Actual Budget](https://github.com/actualbudget/actual) with a hunter green theme,
weekly categories, and a projected end-of-month balance.

[![Docker build](https://github.com/CaptainPeeples/actual/actions/workflows/peeples-docker.yml/badge.svg?branch=peeples)](https://github.com/CaptainPeeples/actual/actions/workflows/peeples-docker.yml)
[![Based on Actual v26.11.0](https://img.shields.io/badge/based%20on-Actual%20v26.11.0-8719e0)](https://github.com/actualbudget/actual)
[![Docker image](https://img.shields.io/badge/image-ghcr.io%2Fcaptainpeeples%2Factual-2496ed?logo=docker&logoColor=white)](https://github.com/CaptainPeeples/actual/pkgs/container/actual)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE.txt)

<img src="demo.png" alt="Actual Budget screenshot" width="800" />

</div>

## ⭐ Features

Actual is a free, open-source, local-first budgeting app. This version adds:

- 🌲 **Hunter green** dark theme
- 🔴 **Pure red** negative balances on the budget page
- 📅 **Projected end of month** box for tracking budgets
- 🗓️ **Weekly categories**: "Week 1" to "Week 4" categories sort spending by date,
  and the group total shows only the weeks that went over
- 📊 Report cards that read **tracking budget** data
- 🆕 New budgets start in **tracking mode** with a generic category list (no amounts),
  with weekly categories for food and gas
- 📱 Phone layout tweaks (no overspent banner, groups start collapsed)

See **[CUSTOM.md](CUSTOM.md)** for the full details.

## 🐳 Install with Docker

Use this image in place of `actualbudget/actual-server`:

```
ghcr.io/captainpeeples/actual:latest
```

Example `compose.yaml`:

```yaml
services:
  actual:
    image: ghcr.io/captainpeeples/actual:latest
    container_name: actual
    restart: unless-stopped
    ports:
      - 5006:5006
    volumes:
      - ./data:/data
```

Start it:

```bash
docker compose up -d
```

Then open `http://localhost:5006`. Your data stays in the `data` folder.

### Update

```bash
docker compose pull && docker compose up -d
```

A new image is built each time the `peeples` branch changes.

## 🏦 Bank sync with Plaid

I sync my banks into Actual with Plaid, using a separate app that runs next to it.
See **[PLAID.md](PLAID.md)** for how I use it and how to set it up.

## 🆘 Help

- How to use Actual: see the [Actual docs](https://actualbudget.org/docs).
- Problems with the custom changes in this version: open an issue on this repo.

## 🙏 Credit and license

All credit for Actual goes to the [Actual Budget team](https://github.com/actualbudget/actual).
This fork uses the same [MIT license](LICENSE.txt).
