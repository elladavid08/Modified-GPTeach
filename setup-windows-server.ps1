# Windows Server Setup Script for GPTeach Deployment
# Run this script on the Windows Server to prepare for deployment

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GPTeach - Windows Server Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  Warning: Not running as Administrator. Some checks may fail." -ForegroundColor Yellow
    Write-Host ""
}

# Function to check if a command exists
function Test-Command {
    param($Command)
    try {
        if (Get-Command $Command -ErrorAction Stop) {
            return $true
        }
    }
    catch {
        return $false
    }
}

# Function to check if a Windows feature is installed
function Test-WindowsFeature {
    param($FeatureName)
    $feature = Get-WindowsOptionalFeature -Online -FeatureName $FeatureName -ErrorAction SilentlyContinue
    return ($feature -and $feature.State -eq "Enabled")
}

Write-Host "📋 Checking Prerequisites..." -ForegroundColor Green
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js..." -NoNewline
if (Test-Command "node") {
    $nodeVersion = node --version
    Write-Host " ✅ Installed ($nodeVersion)" -ForegroundColor Green
} else {
    Write-Host " ❌ Not installed" -ForegroundColor Red
    Write-Host "   Download from: https://nodejs.org/ (LTS version recommended)" -ForegroundColor Yellow
}

# Check npm
Write-Host "Checking npm..." -NoNewline
if (Test-Command "npm") {
    $npmVersion = npm --version
    Write-Host " ✅ Installed (v$npmVersion)" -ForegroundColor Green
} else {
    Write-Host " ❌ Not installed" -ForegroundColor Red
}

# Check PM2
Write-Host "Checking PM2..." -NoNewline
if (Test-Command "pm2") {
    $pm2Version = pm2 --version
    Write-Host " ✅ Installed (v$pm2Version)" -ForegroundColor Green
} else {
    Write-Host " ❌ Not installed" -ForegroundColor Red
    Write-Host "   Install with: npm install -g pm2" -ForegroundColor Yellow
    Write-Host "   Then configure startup: pm2 startup" -ForegroundColor Yellow
}

# Check IIS
Write-Host "Checking IIS..." -NoNewline
if (Get-Service -Name W3SVC -ErrorAction SilentlyContinue) {
    Write-Host " ✅ Installed" -ForegroundColor Green
} else {
    Write-Host " ❌ Not installed" -ForegroundColor Red
    Write-Host "   Install via: Server Manager > Add Roles and Features > Web Server (IIS)" -ForegroundColor Yellow
}

# Check IIS URL Rewrite Module
Write-Host "Checking IIS URL Rewrite Module..." -NoNewline
$urlRewrite = Get-WebGlobalModule -Name "URL Rewrite*" -ErrorAction SilentlyContinue
if ($urlRewrite) {
    Write-Host " ✅ Installed" -ForegroundColor Green
} else {
    Write-Host " ❌ Not installed" -ForegroundColor Red
    Write-Host "   Download from: https://www.iis.net/downloads/microsoft/url-rewrite" -ForegroundColor Yellow
}

# Check IIS Application Request Routing (ARR)
Write-Host "Checking IIS Application Request Routing (ARR)..." -NoNewline
$arr = Get-WebGlobalModule -Name "*Application Request Routing*" -ErrorAction SilentlyContinue
if ($arr) {
    Write-Host " ✅ Installed" -ForegroundColor Green
} else {
    Write-Host " ❌ Not installed" -ForegroundColor Red
    Write-Host "   Download from: https://www.iis.net/downloads/microsoft/application-request-routing" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Project Setup Checklist" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get current directory
$currentDir = Get-Location

Write-Host "📁 Current directory: $currentDir" -ForegroundColor White
Write-Host ""

# Check if we're in the project directory
$isProjectDir = Test-Path "server\server.js"
if ($isProjectDir) {
    Write-Host "✅ Detected GPTeach project directory" -ForegroundColor Green
    Write-Host ""
    
    # Check for service account key
    Write-Host "Checking for service account key..." -NoNewline
    if (Test-Path "server\service-account-key.json") {
        Write-Host " ✅ Found" -ForegroundColor Green
    } else {
        Write-Host " ❌ Missing" -ForegroundColor Red
        Write-Host "   Action: Copy your service-account-key.json to server\ directory" -ForegroundColor Yellow
    }
    
    # Check for backend .env
    Write-Host "Checking for backend .env file..." -NoNewline
    if (Test-Path "server\.env") {
        Write-Host " ✅ Found" -ForegroundColor Green
    } else {
        Write-Host " ❌ Missing" -ForegroundColor Red
        Write-Host "   Action: Create server\.env from server\.env.production.example" -ForegroundColor Yellow
    }
    
    # Check for build folder
    Write-Host "Checking for frontend build..." -NoNewline
    if (Test-Path "build\index.html") {
        Write-Host " ✅ Found" -ForegroundColor Green
    } else {
        Write-Host " ❌ Missing" -ForegroundColor Red
        Write-Host "   Action: Run 'npm run build' to build the frontend" -ForegroundColor Yellow
    }
    
    # Check for node_modules
    Write-Host "Checking for dependencies..." -NoNewline
    if ((Test-Path "node_modules") -and (Test-Path "server\node_modules")) {
        Write-Host " ✅ Installed" -ForegroundColor Green
    } else {
        Write-Host " ❌ Missing" -ForegroundColor Red
        Write-Host "   Action: Run 'npm run install:all' to install dependencies" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Next Steps" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Install any missing prerequisites listed above" -ForegroundColor White
    Write-Host "2. Copy service-account-key.json to server\ directory" -ForegroundColor White
    Write-Host "3. Create server\.env with your configuration" -ForegroundColor White
    Write-Host "4. Run: npm run install:all" -ForegroundColor White
    Write-Host "5. Run: npm run build" -ForegroundColor White
    Write-Host "6. Test locally: cd server && set NODE_ENV=production && npm start" -ForegroundColor White
    Write-Host "7. If working, start with PM2: pm2 start server\server.js --name gpteach-backend" -ForegroundColor White
    Write-Host "8. Configure IIS reverse proxy (see DEPLOYMENT_GUIDE.md)" -ForegroundColor White
    Write-Host "9. Install SSL certificate" -ForegroundColor White
    Write-Host ""
    
} else {
    Write-Host "⚠️  Not in GPTeach project directory" -ForegroundColor Yellow
    Write-Host "   Action: Navigate to the project directory and run this script again" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DNS Status Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Checking DNS for rambam-sim.cs.bgu.ac.il..." -NoNewline
try {
    $dns = Resolve-DnsName -Name "rambam-sim.cs.bgu.ac.il" -ErrorAction Stop
    if ($dns) {
        $ip = ($dns | Where-Object {$_.Type -eq "A"}).IPAddress
        Write-Host " ✅ Resolved to: $ip" -ForegroundColor Green
        if ($ip -eq "132.73.84.233") {
            Write-Host "   ✅ DNS points to correct server!" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  DNS points to different IP. Expected: 132.73.84.233" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host " ❌ Not resolved yet" -ForegroundColor Red
    Write-Host "   DNS propagation may still be in progress (can take up to 24 hours)" -ForegroundColor Yellow
    Write-Host "   Contact IT if this persists beyond 24 hours" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup script completed!" -ForegroundColor Cyan
Write-Host "See DEPLOYMENT_GUIDE.md for detailed instructions" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
