# Server Deployment Branch

This branch (`server-deployment`) is specifically configured for deploying GPTeach to the university Windows Server.

## Quick Start

### On the Windows Server:

1. **Clone this branch:**
   ```powershell
   git clone -b server-deployment https://github.com/YOUR_USERNAME/GPTeach.git
   cd GPTeach
   ```

2. **Run the setup script:**
   ```powershell
   .\server-setup.ps1
   ```

3. **Configure environment variables:**
   - Copy `env.frontend.template` to `.env` and fill in values
   - Copy `server\env.backend.template` to `server\.env` and fill in values

4. **Set up Google Cloud credentials:**
   - Upload your service account key JSON file to the server
   - Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable

5. **Build and run:**
   ```powershell
   npm run build
   npm install -g pm2
   cd server
   pm2 start server.js --name gpteach-backend
   cd ..
   pm2 serve build 3000 --name gpteach-frontend
   pm2 save
   ```

## Documentation

📖 **See [SERVER_DEPLOYMENT_GUIDE.md](./SERVER_DEPLOYMENT_GUIDE.md) for complete deployment instructions**

## Files in This Branch

- `SERVER_DEPLOYMENT_GUIDE.md` - Complete deployment guide
- `SERVER_README.md` - This file
- `env.frontend.template` - Frontend environment variables template
- `server/env.backend.template` - Backend environment variables template
- `server-setup.ps1` - Windows PowerShell setup script

## Important Notes

⚠️ **Security:**
- Never commit `.env` files
- Never commit Google Cloud credential JSON files
- Keep the `credentials/` folder secure on the server

⚠️ **Updates:**
- Pull updates from this branch: `git pull origin server-deployment`
- Rebuild after updates: `npm run build`
- Restart services: `pm2 restart all`

## Server Information

- **IP**: 132.73.84.233 (Internal/VPN only)
- **Frontend Port**: 3000
- **Backend Port**: 3001
- **Access**: VPN + Remote Desktop

## Support

For issues or questions, refer to the main documentation or contact the development team.
