# GPTeach Server Deployment Guide

## Windows Server Deployment (University Server)

This guide is specifically for deploying GPTeach to the university Windows Server.

### Server Information
- **IP Address**: 132.73.84.233
- **Access**: VPN + Microsoft Remote Desktop
- **User**: `.\user`
- **Operating System**: Windows Server

---

## Prerequisites Installation

### 1. Connect to Server
1. Connect to university VPN
2. Open Remote Desktop Connection (mstsc)
3. Connect to: `132.73.84.233`
4. Login with credentials

### 2. Install Node.js
1. Open browser on server
2. Go to: https://nodejs.org/
3. Download LTS version (20.x or higher)
4. Run installer with default options
5. Restart PowerShell

### 3. Install Git
1. Go to: https://git-scm.com/download/win
2. Download and install with default options

### 4. Verify Installation
Open PowerShell and run:
```powershell
node --version
npm --version
git --version
```

---

## Google Cloud Authentication Setup

### 1. Create Service Account (on your local machine)
1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts?project=cloud-run-455609
2. Click "Create Service Account"
3. Name: `gpteach-production`
4. Grant role: **Vertex AI User**
5. Click "Create Key" → JSON → Download
6. Save as: `gpteach-key.json`

### 2. Transfer Key to Server
- Copy the JSON key file to the Windows Server via Remote Desktop clipboard
- Or upload via secure file transfer

### 3. Configure on Server (PowerShell)
```powershell
# Create credentials directory
New-Item -ItemType Directory -Path "C:\GPTeach\credentials" -Force

# Move the key file (adjust path if needed)
Move-Item "C:\Users\user\Desktop\gpteach-key.json" "C:\GPTeach\credentials\gpteach-key.json"

# Set system-wide environment variable
[System.Environment]::SetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', 'C:\GPTeach\credentials\gpteach-key.json', 'Machine')

# Restart PowerShell after this
```

---

## Application Deployment

### 1. Clone Repository
```powershell
# Navigate to deployment location
cd C:\inetpub\
# Or: cd C:\Apps\

# Clone from the server-deployment branch
git clone -b server-deployment https://github.com/YOUR_USERNAME/GPTeach.git
cd GPTeach
```

### 2. Install Dependencies
```powershell
npm run install:all
```

### 3. Configure Environment Variables

#### Frontend .env
Create `.env` in the root directory:
```env
REACT_APP_API_URL=http://132.73.84.233:3001
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key_here
```

#### Backend .env
Create `server/.env`:
```env
GOOGLE_APPLICATION_CREDENTIALS=C:\GPTeach\credentials\gpteach-key.json
GOOGLE_CLOUD_PROJECT=cloud-run-455609
GOOGLE_CLOUD_LOCATION=us-central1
PORT=3001
```

### 4. Build Frontend
```powershell
npm run build
```

### 5. Configure Windows Firewall
```powershell
# Allow ports 3000 and 3001
New-NetFirewallRule -DisplayName "GPTeach Frontend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "GPTeach Backend" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

---

## Running the Application

### Option A: Manual Start (for testing)

**Terminal 1 - Backend:**
```powershell
cd C:\inetpub\GPTeach\server
node server.js
```

**Terminal 2 - Frontend:**
```powershell
cd C:\inetpub\GPTeach
npm install -g serve
serve -s build -l 3000
```

### Option B: PM2 (Production - Recommended)

```powershell
# Install PM2
npm install -g pm2
npm install -g pm2-windows-service
pm2-service-install

# Start backend
cd C:\inetpub\GPTeach\server
pm2 start server.js --name gpteach-backend

# Start frontend
cd C:\inetpub\GPTeach
pm2 serve build 3000 --name gpteach-frontend

# Save configuration
pm2 save

# View status
pm2 status

# View logs
pm2 logs
```

---

## Testing the Deployment

### From University Network (with VPN)
1. Open browser
2. Navigate to: `http://132.73.84.233:3000`
3. Application should load

### Backend Health Check
```
http://132.73.84.233:3001/api/health
```

---

## Updating the Application

```powershell
# Navigate to app directory
cd C:\inetpub\GPTeach

# Stop services (if using PM2)
pm2 stop all

# Pull latest changes
git pull origin server-deployment

# Reinstall dependencies (if package.json changed)
npm run install:all

# Rebuild frontend
npm run build

# Restart services
pm2 restart all
```

---

## Troubleshooting

### Backend Not Starting
1. Check credentials: `echo $env:GOOGLE_APPLICATION_CREDENTIALS`
2. Verify key file exists: `Test-Path C:\GPTeach\credentials\gpteach-key.json`
3. Check backend logs: `pm2 logs gpteach-backend`

### Frontend Not Loading
1. Check if build folder exists: `Test-Path C:\inetpub\GPTeach\build`
2. Check frontend logs: `pm2 logs gpteach-frontend`
3. Verify firewall rules: `Get-NetFirewallRule -DisplayName "GPTeach*"`

### Authentication Errors
1. Verify service account has Vertex AI User role
2. Check project ID in server/.env
3. Test credentials: Navigate to `http://132.73.84.233:3001/api/test`

---

## Security Checklist

- [ ] Service account key file has restricted permissions
- [ ] Environment variables contain no sensitive data in git
- [ ] Firewall rules are configured
- [ ] PM2 configured to restart on server reboot
- [ ] Regular Windows Updates enabled

---

## Useful Commands

```powershell
# Check what's running on ports
netstat -ano | findstr ":3000"
netstat -ano | findstr ":3001"

# View PM2 status
pm2 status
pm2 logs
pm2 monit

# Restart everything
pm2 restart all

# Stop everything
pm2 stop all

# Delete all PM2 processes
pm2 delete all
```

---

## Contact

For issues or questions, contact the development team.
