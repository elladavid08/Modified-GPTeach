# Credential Debugging Helper

The backend can optionally expose a `/api/debug/credentials` endpoint so you can confirm which Application Default Credentials (ADC) are loaded at runtime. The route is disabled by default and only becomes available when you set the `ENABLE_DEBUG_CREDENTIALS` environment variable to `true` before starting the server.

## Enabling the debug endpoint

```bash
# macOS / Linux
export ENABLE_DEBUG_CREDENTIALS=true
npm start
```

```powershell
# Windows PowerShell
$env:ENABLE_DEBUG_CREDENTIALS = "true"
npm start
```

```cmd
REM Windows Command Prompt
set ENABLE_DEBUG_CREDENTIALS=true
npm start
```

With the flag enabled you can fetch the credential details:

```bash
curl http://localhost:3001/api/debug/credentials
```

Remember to unset the variable (or restart the server without it) once you are done inspecting credentials so the route is no longer available.
