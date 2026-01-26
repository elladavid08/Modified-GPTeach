# IIS Configuration Guide

This guide explains how to configure IIS as a reverse proxy for the GPTeach application on Windows Server.

---

## Prerequisites

Before configuring IIS, ensure:

1. ✅ IIS is installed (Windows Features → Internet Information Services)
2. ✅ URL Rewrite Module installed: https://www.iis.net/downloads/microsoft/url-rewrite
3. ✅ Application Request Routing (ARR) installed: https://www.iis.net/downloads/microsoft/application-request-routing
4. ✅ Backend is running on `localhost:3001` (managed by PM2)
5. ✅ DNS is propagated: `rambam-sim.cs.bgu.ac.il` → `132.73.84.233`

---

## Step 1: Enable ARR Proxy

1. Open **IIS Manager**
2. Select the **server node** (root level, not a specific site)
3. Double-click **Application Request Routing Cache**
4. Click **Server Proxy Settings** in the right panel
5. Check **"Enable proxy"**
6. Click **Apply**

---

## Step 2: Create IIS Website

1. In IIS Manager, right-click **Sites** → **Add Website**
2. Configure:
   - **Site name:** `GPTeach-RambamSim`
   - **Physical path:** `C:\path\to\GPTeach\build`
   - **Binding:**
     - Type: `https`
     - Host name: `rambam-sim.cs.bgu.ac.il`
     - Port: `443`
     - SSL Certificate: (select your certificate)
3. Click **OK**

---

## Step 3: Configure URL Rewrite Rules

1. Select your website (`GPTeach-RambamSim`) in IIS Manager
2. Double-click **URL Rewrite**
3. Click **Add Rule(s)** → **Reverse Proxy**

### Rule 1: API Reverse Proxy

**Purpose:** Forward all `/api/*` requests to Node.js backend

1. Click **Add Rules** → **Blank rule**
2. Configure:
   - **Name:** `API Reverse Proxy`
   - **Match URL:**
     - Requested URL: `Matches the Pattern`
     - Using: `Regular Expressions`
     - Pattern: `^api/(.*)`
   - **Conditions:**
     - (Leave empty or add conditions if needed)
   - **Action:**
     - Action type: `Rewrite`
     - Rewrite URL: `http://localhost:3001/api/{R:1}`
     - Append query string: ✅ Checked
     - Stop processing of subsequent rules: ✅ Checked
3. Click **Apply**

### Rule 2: React Router Support (Client-Side Routing)

**Purpose:** Serve `index.html` for all non-file, non-API requests

1. Click **Add Rules** → **Blank rule**
2. Configure:
   - **Name:** `React Router Support`
   - **Match URL:**
     - Requested URL: `Matches the Pattern`
     - Using: `Regular Expressions`
     - Pattern: `.*`
   - **Conditions:**
     - Click **Add** and add these conditions:
       1. **Condition 1:**
          - Condition input: `{REQUEST_FILENAME}`
          - Check if input string: `Is Not a File`
       2. **Condition 2:**
          - Condition input: `{REQUEST_FILENAME}`
          - Check if input string: `Is Not a Directory`
       3. **Condition 3:**
          - Condition input: `{REQUEST_URI}`
          - Check if input string: `Does Not Match the Pattern`
          - Pattern: `^/api/.*`
     - Logical grouping: `Match All`
   - **Action:**
     - Action type: `Rewrite`
     - Rewrite URL: `/index.html`
     - Append query string: ❌ Unchecked
     - Stop processing of subsequent rules: ✅ Checked
3. Click **Apply**

---

## Step 4: Verify URL Rewrite Rules

Your `web.config` in the `build/` folder should now contain (or you can create it manually):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <rule name="API Reverse Proxy" stopProcessing="true">
                    <match url="^api/(.*)" />
                    <action type="Rewrite" url="http://localhost:3001/api/{R:1}" appendQueryString="true" />
                </rule>
                <rule name="React Router Support" stopProcessing="true">
                    <match url=".*" />
                    <conditions logicalGrouping="MatchAll">
                        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
                        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
                        <add input="{REQUEST_URI}" pattern="^/api/.*" negate="true" />
                    </conditions>
                    <action type="Rewrite" url="/index.html" />
                </rule>
            </rules>
        </rewrite>
    </system.webServer>
</configuration>
```

---

## Step 5: Configure SSL Certificate

### Option A: Let's Encrypt (Free)

1. Install **win-acme** (Windows ACME client): https://www.win-acme.com/
2. Run win-acme as Administrator:
   ```powershell
   wacs.exe
   ```
3. Follow the wizard:
   - Select **N: Create certificate (full options)**
   - Binding: **Single binding of an IIS site**
   - Select your site: `GPTeach-RambamSim`
   - Domain: `rambam-sim.cs.bgu.ac.il`
   - Validation: **http-01 (serve file from IIS)**
   - Store: **Windows Certificate Store**
   - Installation: **IIS Web**
4. win-acme will:
   - Request certificate from Let's Encrypt
   - Install it in Windows Certificate Store
   - Bind it to your IIS site
   - Set up automatic renewal

### Option B: University Certificate

If your university provides SSL certificates:

1. Obtain certificate from university IT
2. Import certificate to Windows Certificate Store
3. In IIS Manager:
   - Select your site
   - Click **Bindings** in the right panel
   - Select the HTTPS binding
   - Choose the imported certificate
   - Click **OK**

---

## Step 6: Test the Configuration

### Test 1: Static Files
```powershell
Invoke-WebRequest -Uri "https://rambam-sim.cs.bgu.ac.il/" -UseBasicParsing
```
Should return HTML (React app)

### Test 2: API Endpoint
```powershell
Invoke-WebRequest -Uri "https://rambam-sim.cs.bgu.ac.il/api/health" -UseBasicParsing
```
Should return JSON: `{"status":"OK",...}`

### Test 3: Browser
1. Open browser: `https://rambam-sim.cs.bgu.ac.il`
2. Open browser console (F12)
3. Check Network tab - API calls should be successful
4. Navigate between pages - React Router should work

---

## Troubleshooting

### 502 Bad Gateway
- **Cause:** Backend not running
- **Fix:** Check PM2: `pm2 status` and `pm2 logs gpteach-backend`

### 404 on /api/health
- **Cause:** URL Rewrite not forwarding correctly
- **Fix:** Check Rule 1 (API Reverse Proxy) is enabled and first in order

### Blank page or 404 on React routes
- **Cause:** React Router rule not working
- **Fix:** Check Rule 2 (React Router Support) conditions are correct

### SSL Certificate errors
- **Cause:** Certificate not properly installed or expired
- **Fix:** 
  - Check certificate in IIS Manager → Server Certificates
  - Ensure certificate matches domain name
  - Check certificate expiry date

### API calls fail with CORS errors
- **Cause:** CORS headers not passing through reverse proxy
- **Fix:** Backend already has CORS enabled. If issues persist, add to web.config:
  ```xml
  <httpProtocol>
      <customHeaders>
          <add name="Access-Control-Allow-Origin" value="*" />
          <add name="Access-Control-Allow-Methods" value="GET, POST, OPTIONS" />
          <add name="Access-Control-Allow-Headers" value="Content-Type" />
      </customHeaders>
  </httpProtocol>
  ```

---

## Firewall Configuration

Ensure Windows Firewall allows:
- **Inbound:** Port 443 (HTTPS) from all
- **Blocked:** Port 3001 from external networks (only localhost should access)

```powershell
# Allow HTTPS
New-NetFirewallRule -DisplayName "HTTPS Inbound" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Block direct backend access from external (if not already blocked)
New-NetFirewallRule -DisplayName "Block Backend 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -RemoteAddress Any -Action Block
```

---

## Monitoring

### Check IIS Logs
Location: `C:\inetpub\logs\LogFiles\W3SVC*\`

### Check Backend Logs
```powershell
pm2 logs gpteach-backend
```

### Check System Event Log
Event Viewer → Windows Logs → Application (filter for IIS errors)

---

## Performance Optimization (Optional)

### Enable IIS Compression
1. Select your site in IIS Manager
2. Double-click **Compression**
3. Enable:
   - ✅ Enable static content compression
   - ✅ Enable dynamic content compression
4. Click **Apply**

### Enable IIS Caching
1. Select your site in IIS Manager
2. Double-click **Output Caching**
3. Add rule for static files (js, css, images)
4. Set cache duration (e.g., 1 day for development, 30 days for production)

---

## Maintenance

### Updating the Application

1. Stop PM2 process:
   ```powershell
   pm2 stop gpteach-backend
   ```

2. Pull latest code:
   ```powershell
   git pull origin service-account-auth
   ```

3. Rebuild frontend:
   ```powershell
   npm run build
   ```

4. Restart PM2:
   ```powershell
   pm2 restart gpteach-backend
   ```

5. Clear browser cache and test

### Certificate Renewal

If using Let's Encrypt with win-acme:
- Automatic renewal task is created by win-acme
- Check Task Scheduler → win-acme tasks
- Certificates renew automatically 30 days before expiration

---

## Security Checklist

- [ ] HTTPS enabled with valid certificate (not self-signed)
- [ ] HTTP to HTTPS redirect configured
- [ ] Port 3001 blocked from external access
- [ ] Service account key file has restricted permissions
- [ ] `ENABLE_DEBUG_CREDENTIALS` set to `false` in production
- [ ] IIS application pool running with minimal required permissions
- [ ] Regular Windows Updates enabled
- [ ] Regular backups of configuration and data

---

For more information, see `DEPLOYMENT_GUIDE.md`
