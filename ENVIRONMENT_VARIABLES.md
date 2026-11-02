# Environment Variables Reference

This document describes all environment variables used in the GPTeach application.

---

## Backend Environment Variables (server/.env)

These variables must be set on the Windows Server in the `server/.env` file.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | **Yes** | `./service-account-key.json` | Path to Google Cloud service account JSON key file. Can be relative (to server directory) or absolute. |
| `GOOGLE_CLOUD_PROJECT` | **Yes** | `cloud-run-455609` | Google Cloud project ID |
| `GOOGLE_CLOUD_LOCATION` | No (ignored since 1.4.0) | `global` | Not used for model calls since 1.4.0: the Gemini 3.x models are served only from the `global` endpoint (`server/model_config.js`). If set to another value, the server logs a warning and ignores it. |
| `PORT` | No | `3001` | Port for backend server to listen on |
| `NODE_ENV` | **Yes** | `development` | Set to `production` for production deployment |
| `ENABLE_DEBUG_CREDENTIALS` | No | `false` | Set to `true` to enable `/api/debug/credentials` endpoint for troubleshooting |
| `PCK_STAGE2` | No | on | Two-stage PCK feedback (A1i, the 1.6.0 behaviour; `research/simulator_audit/pck_a1i_implementation_plan.md`). **ON** when unset or empty, or `on` / `1` / `true`: on turns the first PCK call shows, a second call with the frozen Stage-2 rubric decides the skill rows, scores and feedback text and the PCK information the students receive. If no row is left, no feedback is shown. If it fails, the 1.5.1 feedback is used. **OFF** with `off` / `0` / `false` (explicit override): the 1.5.1 behaviour exactly. Any other value stays ON and the server logs a warning. Trimmed, case-insensitive, read per request. **To check the active state:** the startup log line `🧩 PCK Stage 2: ON (default)` / `ON (environment, PCK_STAGE2=on)` / `OFF (explicit override, PCK_STAGE2=off)`, or `GET /api/health` → `pckStage2Enabled` (true / false) and `pckStage2Source` (`default` / `environment`). |
| `PCK_STAGE2_ATTEMPT_TIMEOUT_MS` | No | `8000` | Per-attempt limit of the Stage-2 call (at most 2 attempts) |
| `PCK_STAGE2_TOTAL_BUDGET_MS` | No | `12000` | Total limit of the Stage-2 call; after it the 1.5.1 feedback is used |
| `PCK_STAGE2_SKIP_AFTER_MS` | No | `30000` | Stage 2 is skipped (1.5.1 feedback) when the first PCK call already took longer than this |

### Example server/.env for Production

```env
# Google Cloud Service Account Configuration
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GOOGLE_CLOUD_PROJECT=cloud-run-455609
GOOGLE_CLOUD_LOCATION=us-central1

# Server Configuration
PORT=3001
NODE_ENV=production

# Debug (only enable if troubleshooting)
ENABLE_DEBUG_CREDENTIALS=false
```

---

## Frontend Environment Variables (.env.production)

These variables are used when building the frontend with `npm run build`. This file is already included in the repository.

| Variable | Required | Value | Description |
|----------|----------|-------|-------------|
| `REACT_APP_API_URL` | **Yes** | `/api` | API base URL for production. Using relative path allows same-origin requests. |
| `GENERATE_SOURCEMAP` | No | `false` | Disable source maps in production for smaller build size and security |

### .env.production (already in repo)

```env
# Production Environment Variables for Frontend Build
REACT_APP_API_URL=/api
GENERATE_SOURCEMAP=false
```

---

## Local Development Environment Variables (.env)

For local development, you may have a `.env` file in the project root (NOT committed to Git).

### Example .env for Local Development

```env
# Google Cloud Service Account Configuration
GOOGLE_APPLICATION_CREDENTIALS=./server/service-account-key.json
GOOGLE_CLOUD_PROJECT=cloud-run-455609
GOOGLE_CLOUD_LOCATION=us-central1

# Enable debug mode locally if needed
ENABLE_DEBUG_CREDENTIALS=false
```

**Note:** When running locally with `npm run dev`, the frontend uses `http://localhost:3001` as the API URL (configured in `src/services/genai.js`), NOT `/api`.

---

## Environment Files Summary

| File | Location | Purpose | Committed to Git? |
|------|----------|---------|-------------------|
| `.env` | Project root | Local development variables | ❌ No (gitignored) |
| `.env.production` | Project root | Frontend build variables | ✅ Yes |
| `server/.env` | server/ | Backend runtime variables | ❌ No (gitignored) |
| `server/.env.production.example` | server/ | Backend template for production | ✅ Yes |

---

## Security Best Practices

1. **Never commit** `.env` files or service account keys to Git
2. **Verify** `.gitignore` includes:
   ```
   .env
   .env.local
   .env.development.local
   .env.test.local
   .env.production.local
   **/service-account-key.json
   **/*-service-account.json
   **/*-credentials.json
   ```
3. **Restrict** file permissions on `server/.env` and `service-account-key.json` on the Windows Server
4. **Use** minimal required permissions for the Google Cloud service account
5. **Never** enable `ENABLE_DEBUG_CREDENTIALS=true` in production unless actively troubleshooting

---

## Troubleshooting

### "Application Default Credentials not found"
- Check `GOOGLE_APPLICATION_CREDENTIALS` path is correct
- Check `service-account-key.json` file exists at that path
- Use absolute path if relative path isn't working

### Frontend API calls fail in production
- Check `REACT_APP_API_URL=/api` in `.env.production`
- Rebuild frontend: `npm run build`
- Check IIS reverse proxy forwards `/api/*` to `localhost:3001`

### Backend won't start
- Check all required variables are set in `server/.env`
- Check `NODE_ENV=production` is set
- Run `cd server && node server.js` to see detailed error messages
