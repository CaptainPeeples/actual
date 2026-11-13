# Bank sync with Plaid

Stock Actual doesn't sync with Plaid. I use a separate app,
**[Plaid Importer for Actual Budget](https://github.com/RickyV33/plaid-importer-actual-budget)**
by RickyV33. It runs next to Actual in Docker and pulls bank transactions from
Plaid into my budget, on a schedule.

## How I use it

- Plaid Importer runs in its own container on the same Docker network as Actual.
- I link each bank once through Plaid.
- A **profile** points at my Actual budget. I **map** each bank account to an
  Actual account.
- A **schedule** syncs my banks automatically. I can also click **Sync**
  any time.
- It sits behind an HTTPS reverse proxy, so big banks that use OAuth (Chase,
  Capital One, etc.) can link.

## What you need

1. A Docker host running Actual (this image or stock Actual both work).
2. A **Plaid account with production access**. Sign up at
   [dashboard.plaid.com](https://dashboard.plaid.com/). Plaid's free tier is
   sandbox only (fake data), so you need to apply for production. Plaid may
   charge for production use.
3. An **HTTPS address** for the importer (Nginx Proxy Manager, Caddy, Traefik,
   or similar). Without HTTPS, only smaller banks that don't use OAuth will link.

## Set it up

### 1. Make a folder

```bash
mkdir -p ~/docker/containers/plaid-importer/data
cd ~/docker/containers/plaid-importer
```

### 2. Make two secrets

```bash
openssl rand -hex 32
```

```bash
openssl rand -base64 32
```

Save both. The first is `SESSION_SECRET`. The second is `TOKEN_ENCRYPTION_KEY`.
Never change `TOKEN_ENCRYPTION_KEY` later, or you'll have to re-link every bank.

### 3. Make a `.env` file

```env
# App
APP_URL=https://plaid.example.com
NODE_ENV=production
APP_USER=admin
APP_PASSWORD=change-me
SESSION_SECRET=paste-first-secret
TOKEN_ENCRYPTION_KEY=paste-second-secret

# Plaid (from dashboard.plaid.com)
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-production-secret
PLAID_ENV=production
PLAID_COUNTRY_CODES=US
PLAID_PRODUCTS=transactions
PLAID_REDIRECT_URI=https://plaid.example.com/link/oauth-return

# Actual (optional defaults for new profiles)
ACTUAL_SERVER_URL=http://actual:5006
ACTUAL_SERVER_PASSWORD=your-actual-password
```

- `APP_USER` / `APP_PASSWORD` only create your first login. After that, they're ignored.
- `ACTUAL_SERVER_URL` uses the Actual container's name because both are on the
  same Docker network.
- Keep this file private: `chmod 600 .env`.

### 4. Make a `compose.yaml`

```yaml
services:
  plaid-importer:
    image: rickyv33/plaid-importer:latest
    container_name: plaid-importer
    restart: unless-stopped
    env_file: .env
    environment:
      - TZ=America/New_York
    volumes:
      - ./data:/app/data
    ports:
      - 8095:8080
    networks:
      - docker_network

networks:
  docker_network:
    external: true
```

If you don't have a shared Docker network yet, make one first:

```bash
docker network create docker_network
```

Also add `docker_network` to your Actual container so the two can talk.

### 5. Start it

```bash
docker compose up -d
```

### 6. Tell Plaid your callback address

In the Plaid dashboard, go to **Developers → API → Allowed redirect URIs** and add
the same `PLAID_REDIRECT_URI` from your `.env`. It must match exactly.

### 7. Point your reverse proxy at it

Send `https://plaid.example.com` to port `8095` on your Docker host.

### 8. Finish in the app

1. Open your HTTPS address and sign in.
2. **Connections → Link a bank.** Log in to your bank through Plaid.
3. **Profiles → New profile.** Pick your Actual server and budget.
4. **Map** each bank account to an Actual account.
5. Click **Sync** to test. Then add a **Schedule** so it runs on its own.

## If something breaks

- **Bank won't link / redirect error:** `PLAID_REDIRECT_URI` must be HTTPS and
  match the Plaid dashboard exactly.
- **"network-failure" from Actual:** the importer can't reach Actual. Check both
  containers are on `docker_network` and `ACTUAL_SERVER_URL` is right.
- **Container won't start:** a setting is missing. Check `docker logs plaid-importer`.

See the importer's own
[README](https://github.com/RickyV33/plaid-importer-actual-budget) for more.
