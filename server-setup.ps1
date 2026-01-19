# GPTeach Server Setup Script for Windows Server
# Run this script after cloning the repository on the server

Write-Host "🚀 GPTeach Server Setup Script" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

# Check if Node.js is installed
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Host "✅ npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm is not installed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Yellow
Write-Host ""

# Install all dependencies
try {
    npm run install:all
    Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Checking environment configuration..." -ForegroundColor Yellow

# Check if .env files exist
$frontendEnvExists = Test-Path ".env"
$backendEnvExists = Test-Path "server\.env"

if (-not $frontendEnvExists) {
    Write-Host "⚠️  Frontend .env file not found" -ForegroundColor Yellow
    Write-Host "   Please copy env.frontend.template to .env and configure" -ForegroundColor Yellow
}

if (-not $backendEnvExists) {
    Write-Host "⚠️  Backend .env file not found" -ForegroundColor Yellow
    Write-Host "   Please copy server\env.backend.template to server\.env and configure" -ForegroundColor Yellow
}

# Check Google Cloud credentials
$credPath = $env:GOOGLE_APPLICATION_CREDENTIALS
if ($credPath) {
    Write-Host "✅ GOOGLE_APPLICATION_CREDENTIALS is set to: $credPath" -ForegroundColor Green
    if (Test-Path $credPath) {
        Write-Host "✅ Credentials file exists" -ForegroundColor Green
    } else {
        Write-Host "❌ Credentials file not found at: $credPath" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️  GOOGLE_APPLICATION_CREDENTIALS environment variable not set" -ForegroundColor Yellow
    Write-Host "   Please set it to the path of your service account key file" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Checking Windows Firewall rules..." -ForegroundColor Yellow

$firewallRules = Get-NetFirewallRule -DisplayName "GPTeach*" -ErrorAction SilentlyContinue
if ($firewallRules) {
    Write-Host "✅ Firewall rules already configured" -ForegroundColor Green
} else {
    Write-Host "⚠️  Firewall rules not configured" -ForegroundColor Yellow
    $configureFirewall = Read-Host "Would you like to configure firewall rules now? (Y/N)"
    if ($configureFirewall -eq "Y" -or $configureFirewall -eq "y") {
        try {
            New-NetFirewallRule -DisplayName "GPTeach Frontend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
            New-NetFirewallRule -DisplayName "GPTeach Backend" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
            Write-Host "✅ Firewall rules configured successfully" -ForegroundColor Green
        } catch {
            Write-Host "❌ Failed to configure firewall rules (may need admin privileges)" -ForegroundColor Red
            Write-Host "   Run PowerShell as Administrator and execute:" -ForegroundColor Yellow
            Write-Host "   New-NetFirewallRule -DisplayName 'GPTeach Frontend' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow" -ForegroundColor Cyan
            Write-Host "   New-NetFirewallRule -DisplayName 'GPTeach Backend' -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow" -ForegroundColor Cyan
        }
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Configure .env files if not already done" -ForegroundColor White
Write-Host "2. Build the frontend: npm run build" -ForegroundColor White
Write-Host "3. Install PM2: npm install -g pm2" -ForegroundColor White
Write-Host "4. Start backend: cd server && pm2 start server.js --name gpteach-backend" -ForegroundColor White
Write-Host "5. Start frontend: pm2 serve build 3000 --name gpteach-frontend" -ForegroundColor White
Write-Host "6. Save PM2 config: pm2 save" -ForegroundColor White
Write-Host ""
Write-Host "For more details, see SERVER_DEPLOYMENT_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
