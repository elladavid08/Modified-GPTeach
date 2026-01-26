# Manual Environment Setup

The following files need to be created **manually** on your Windows Server (they are gitignored for security).

---

## 1. Create server/.env

Location: `server/.env`

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

---

## 2. Copy Service Account Key

Copy your Google Cloud service account JSON key file to:

Location: `server/service-account-key.json`

⚠️ **This file must NEVER be committed to Git!**

---

## 3. Verify .env.production exists (Frontend)

This file should already be in the repository. If it's missing, create it:

Location: `.env.production` (project root)

```env
# Production Environment Variables for Frontend Build
REACT_APP_API_URL=/api
GENERATE_SOURCEMAP=false
```

---

## Quick Setup Commands

### On Windows Server:

1. Navigate to project directory:
   ```powershell
   cd C:\path\to\GPTeach
   ```

2. Create server/.env file:
   ```powershell
   notepad server\.env
   ```
   Then paste the content from step 1 above

3. Copy your service account key:
   ```powershell
   copy C:\path\to\your-key.json server\service-account-key.json
   ```

4. Verify files exist:
   ```powershell
   dir server\.env
   dir server\service-account-key.json
   ```

---

## Testing Configuration

Test that environment variables are loaded correctly:

```powershell
cd server
node -e "require('dotenv').config(); console.log('Project:', process.env.GOOGLE_CLOUD_PROJECT)"
```

Should output: `Project: cloud-run-455609`
