# GPTeach - Google Cloud Vertex AI Setup Instructions

This project now uses Google Cloud's Vertex AI with Application Default Credentials instead of OpenAI.

## 🏗️ Architecture

- **Frontend**: React app (port 3000) - handles UI and user interactions
- **Backend**: Node.js/Express server (port 3001) - handles Google Cloud Vertex AI API calls
- **Authentication**: Google Cloud Application Default Credentials (ADC)

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 16+ installed (includes fetch polyfill for Node 16 compatibility)
- Google Cloud CLI installed (`gcloud`)
- Access to Google Cloud project `cloud-run-455609`

### 2. Authentication Setup

```bash
# Authenticate with Google Cloud
gcloud auth application-default login

# Verify authentication
gcloud auth application-default print-access-token
```

### 3. Install Dependencies

```bash
# Install both frontend and backend dependencies
npm run install:all
```

### 4. Run the Application

**Option A: Run both servers simultaneously (Recommended)**
```bash
npm run dev
```

**Option B: Run servers separately**

Terminal 1 (Backend):
```bash
npm run start:backend
```

Terminal 2 (Frontend):
```bash
npm run start:frontend
```

## 🔍 Testing the Setup

### 1. Backend Health Check
Visit: http://localhost:3001/api/health

### 2. AI Test Endpoint
Visit: http://localhost:3001/api/test

### 3. Frontend Application
Visit: http://localhost:3000

## 🎯 API Endpoints

- `GET /api/health` - Backend health check
- `GET /api/test` - Test AI functionality
- `POST /api/generate` - Chat completions (GPT 3.5/4 style)
- `POST /api/completion` - Text completions (GPT-3 style)

## 🔧 Configuration

### Provider Toggle
In `src/config/constants.js`:
```javascript
PROVIDER: "google"  // Use Google Vertex AI
// PROVIDER: "openai"  // Use OpenAI (requires API key)
```

### Backend URL
By default, the frontend connects to `http://localhost:3001`. To change this:
```bash
# Create .env file in project root
REACT_APP_API_URL=http://your-backend-url
```

## 🐛 Troubleshooting

### Backend Not Starting
1. Check if you're authenticated: `gcloud auth list`
2. Verify project access: `gcloud projects list`
3. Check server logs for specific errors

### Frontend Can't Connect to Backend
1. Ensure backend is running on port 3001
2. Check browser console for CORS errors
3. Verify `REACT_APP_API_URL` if using custom backend URL

### AI Responses Not Working
1. Check browser console for API errors
2. Test backend directly: `curl http://localhost:3001/api/test`
3. Verify Google Cloud quotas and API access

### Authentication Issues
```bash
# Re-authenticate
gcloud auth application-default login

# Check current authentication
gcloud auth list
gcloud config list
```

## 📁 Project Structure

```
GPTeach/
├── src/                    # React frontend
│   ├── services/
│   │   └── genai.js       # Backend API client
│   └── config/
│       └── constants.js   # Provider configuration
├── server/                # Node.js backend
│   ├── package.json       # Backend dependencies
│   └── server.js          # Express server with Vertex AI
├── package.json           # Frontend dependencies + scripts
└── SETUP_INSTRUCTIONS.md  # This file
```

## 🔄 Switching Between Providers

To switch back to OpenAI:
1. Change `PROVIDER: "openai"` in `src/config/constants.js`
2. Add `REACT_APP_OPENAI_API_KEY` to your `.env` file
3. Restart the frontend

## 🚀 Deployment

### Backend (Google Cloud Run)
```bash
cd server
gcloud run deploy gpteach-backend --source .
```

### Frontend (Static Hosting)
```bash
npm run build
# Deploy build/ folder to your preferred hosting service
```

## 📞 Support

If you encounter issues:
1. Check the browser console for frontend errors
2. Check terminal logs for backend errors
3. Verify Google Cloud authentication and permissions
4. Ensure all dependencies are installed correctly

## 🎉 Success Indicators

✅ Backend starts without errors
✅ Frontend connects to backend successfully  
✅ Students respond to your messages in the chat
✅ Console shows successful API calls and responses


