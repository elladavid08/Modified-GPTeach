# Deployment Guide for Windows Server

**Target Domain:** https://rambam-sim.cs.bgu.ac.il  
**Server IP:** 132.73.84.233  
**Branch:** service-account-auth

---

## Overview

This application consists of:
- **Frontend:** React app (built as static files)
- **Backend:** Node.js/Express server (serves API + static files in production)
- **Authentication:** Google Cloud Service Account (JSON key)

---

## Required Environment Variables

### Backend Server (server/.env)

Create `server/.env` with the following:

```env
# Google Cloud Service Account Configuration
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
GOOGLE_CLOUD_PROJECT=cloud-run-455609
GOOGLE_CLOUD_LOCATION=us-central1

# Server Configuration
PORT=3001
NODE_ENV=production

# Debug (optional - set to true only if troubleshooting)
ENABLE_DEBUG_CREDENTIALS=false
```

### Frontend Build (.env.production)

This file already exists and contains:

```env
REACT_APP_API_URL=/api
GENERATE_SOURCEMAP=false
```

---

## Deployment Steps Summary

### Phase 1: Immediate Preparation (✅ Complete)
- [x] Backend configured to serve static files in production
- [x] Environment variable structure defined
- [x] Documentation created
- [x] `.gitignore` configured

### Phase 2: Pre-DNS Installation (Can Do Now)
- [ ] Install Node.js on Windows Server
- [ ] Install PM2 process manager
- [ ] Install IIS (if not already installed)
- [ ] Install IIS URL Rewrite and ARR modules
- [ ] Transfer project files to server
- [ ] Copy service account key to `server/service-account-key.json`
- [ ] Create `server/.env` (see above)
- [ ] Build frontend: `npm run build`
- [ ] Test backend locally: `cd server && npm start`

### Phase 3: DNS Wait Period
- [ ] Wait for DNS propagation (up to 24 hours)
- [ ] Verify DNS: `nslookup rambam-sim.cs.bgu.ac.il`

### Phase 4: Production Deployment (After DNS)
- [ ] Start backend with PM2: `pm2 start server/server.js --name gpteach-backend`
- [ ] Configure IIS website for domain
- [ ] Set up IIS reverse proxy (port 443 → 3001)
- [ ] Install SSL certificate (Let's Encrypt or university cert)
- [ ] Test production: https://rambam-sim.cs.bgu.ac.il

---

## Important Files

### Must Transfer to Server
- `server/` - Backend code
- `build/` - Frontend static files (after building)
- `server/service-account-key.json` - Google Cloud credentials (⚠️ NEVER commit to Git)

### Configuration Files
- `server/.env` - Backend environment (create on server)
- `.env.production` - Frontend build config (already in repo)

---

## Testing Locally Before Deployment

1. Build the frontend:
   ```bash
   npm run build
   ```

2. Start backend in production mode:
   ```bash
   cd server
   set NODE_ENV=production
   npm start
   ```

3. Test in browser:
   - Backend should serve static files from `build/` folder
   - API endpoints should work at `http://localhost:3001/api/*`
   - React app should work at `http://localhost:3001`

---

## Process Management

### PM2 Commands

```bash
# Start application
pm2 start server/server.js --name gpteach-backend

# Monitor
pm2 status
pm2 logs gpteach-backend

# Restart
pm2 restart gpteach-backend

# Stop
pm2 stop gpteach-backend

# Auto-start on Windows boot
pm2 startup
pm2 save
```

---

## Security Checklist

- [x] `.gitignore` configured to exclude `.env` and service account keys
- [ ] Service account key has minimal required permissions
- [ ] `server/.env` file permissions restricted on Windows Server
- [ ] HTTPS certificate installed (not self-signed)
- [ ] Firewall configured (allow 443, block direct 3001 from outside)

---

## Troubleshooting

### Backend won't start
- Check `server/.env` exists and has correct values
- Check `service-account-key.json` is in `server/` folder
- Run: `cd server && node server.js` to see error messages

### Frontend shows errors
- Check build was successful: `npm run build`
- Check `build/` folder exists
- Check backend is serving static files (NODE_ENV=production)

### API calls fail
- Check browser console for errors
- Check IIS reverse proxy is forwarding `/api/*` to `localhost:3001`
- Check PM2 logs: `pm2 logs gpteach-backend`

### DNS issues
- Verify DNS propagation: `nslookup rambam-sim.cs.bgu.ac.il`
- Wait up to 24 hours after IT configures DNS
- Try from different networks to confirm

---

## Next Steps

Run the PowerShell setup script on the Windows Server:
```powershell
.\setup-windows-server.ps1
```

This will check for required software and guide you through installation.
