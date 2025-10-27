# Credential Debugging Helper

The backend can optionally expose a `/api/debug/credentials` endpoint so you can confirm which Application Default Credentials (ADC) are loaded at runtime. The route is disabled by default and only becomes available when you set the `ENABLE_DEBUG_CREDENTIALS` environment variable to `true` before starting the server.

## Enabling the debug endpoint

```bash
# macOS / Linux
cd server
npm install  # Run once to install server dependencies
export ENABLE_DEBUG_CREDENTIALS=true
npm start
```

```powershell
# Windows PowerShell
Set-Location C:\projects\GPTeach\server
npm install  # Run once to install server dependencies
$env:ENABLE_DEBUG_CREDENTIALS = "true"
npm start
```

```cmd
REM Windows Command Prompt
cd C:\projects\GPTeach\server
npm install  REM Run once to install server dependencies
set ENABLE_DEBUG_CREDENTIALS=true
npm start
```

With the flag enabled you can fetch the credential details:

```bash
curl http://localhost:3001/api/debug/credentials
```

When you are finished, stop the server and start it again **without** setting
`ENABLE_DEBUG_CREDENTIALS` so the diagnostic route is no longer exposed. If you
prefer to keep a dedicated terminal for the debug session, open a second
PowerShell or Command Prompt window, run the same `Set-Location` command to
enter `C:\projects\GPTeach\server`, and execute the `curl` command there.

