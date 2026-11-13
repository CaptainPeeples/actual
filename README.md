# Actual Budget — CaptainPeeples Edition

A custom build of [Actual Budget](https://github.com/actualbudget/actual) (based on v26.11.0), kept by [CaptainPeeples](https://github.com/CaptainPeeples).

Actual is a free, open-source, local-first budgeting app. This version adds:

- **Hunter green** dark theme
- **Pure red** negative balances on the budget page
- **Projected end of month** box for tracking budgets
- Report cards that read **tracking budget** data
- New budgets start in **tracking mode** with a generic category list (no amounts)
- Phone layout tweaks (no overspent banner, groups start collapsed)

See **[CUSTOM.md](CUSTOM.md)** for the full details.

## Bank sync with Plaid

I sync my banks into Actual with Plaid, using a separate app that runs next to it.
See **[PLAID.md](PLAID.md)** for how I use it and how to set it up.

## Run it with Docker

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

Then open `http://localhost:5006`. Your data stays in the `data` folder.

## Help with Actual itself

For how to use Actual, see the [Actual docs](https://actualbudget.org/docs).
Problems with the custom changes in this version? Open an issue on this repo.

## Credit and license

All credit for Actual goes to the [Actual Budget team](https://github.com/actualbudget/actual).
This fork uses the same [MIT license](LICENSE.txt).
