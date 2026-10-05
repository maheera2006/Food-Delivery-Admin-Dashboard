# Food Delivery Admin Dashboard

Admin dashboard for a food delivery business: track orders, assign drivers, manage the menu.

## Features
- Dashboard with totals, in-progress count, delivered revenue and status breakdown
- Orders: enforced status flow (New > Preparing > Out for delivery > Delivered), cancel, driver assignment (required before dispatch), status filter, auto refresh
- Menu: add, edit price, sold out toggle, delete (past orders keep their records)
- Demo order button (disabled in production)

## Run
1. Install Node.js 18 or newer.
2. `npm install`
3. `npm start`, then open http://localhost:3000 (default password `admin123`)

## Production settings (environment variables)
| Variable | Purpose |
|---|---|
| `NODE_ENV=production` | Refuses to start with the default password, disables demo orders |
| `ADMIN_PASS` | Admin password (required in production) |
| `PORT` | Port to listen on (default 3000) |
| `DB_PATH` | Path of the JSON database file |
| `TRUST_PROXY=1` | Set when behind a reverse proxy so login lockout uses the real client IP |
| `ALLOW_DEMO=1` | Re-enable demo orders in production |

PowerShell example: `$env:NODE_ENV="production"; $env:ADMIN_PASS="a-long-password"; npm start`

## Security and reliability
Random session tokens (8 hour expiry, invalidated on sign out), constant-time password check, lockout after 5 wrong attempts for 15 minutes, security headers and a strict content policy, input validation and size limits on every endpoint, server-side rule checks for order status changes, atomic database writes, clear errors on startup if the database is corrupt.

## Tests
`npm test` runs 70 checks (auth, validation, order rules, concurrency, lockout, production mode) against a temporary database.

## Limits
One server instance and one admin, JSON file storage (suits a small restaurant), no customer app. Serve over HTTPS (for example behind Nginx or a host that provides it) when public. For many restaurants or heavy traffic, move to a real database.
