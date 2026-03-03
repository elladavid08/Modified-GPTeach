# Firebase Setup Instructions for RAMBAM Simulator

## Environment Variables to Add

### Frontend (.env file in project root)

Create or update your `.env` file with these values:

```env
# Firebase Configuration (Frontend)
# ⚠️ Get these values from Firebase Console > Project Settings > Your apps
REACT_APP_FIREBASE_API_KEY=your_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id

# API Configuration (leave empty for production)
REACT_APP_API_URL=
```

### Backend (server/.env file)

Your existing `server/.env` should already have:
```env
GOOGLE_APPLICATION_CREDENTIALS=C:\secrets\service-account-key.json
NODE_ENV=production
```

The same service account key works for both Vertex AI and Firebase!

## Installation Commands

### On Local Machine (✅ DONE):
```bash
npm install firebase                    # ✅ Installed
cd server && npm install firebase-admin # ✅ Installed
```

### On Remote Server (After pulling from Git):
```bash
npm install
cd server
npm install
```

## Files Created

1. `src/config/firebase.js` - Firebase initialization for frontend
2. `src/services/authService.js` - Authentication service (to be created)
3. `src/services/firestoreService.js` - Database service (to be created)
4. `server/services/firebaseAdmin.js` - Firebase Admin for backend (to be created)

## ✅ Completed Steps

1. ✅ Install Firebase packages (frontend + backend)
2. ✅ Create Firebase config file (`src/config/firebase.js`)
3. ✅ Create authentication service (`src/services/authService.js`)
4. ✅ Create Firestore database service (`src/services/firestoreService.js`)
5. ✅ Update backend to save conversations (`server/services/firebaseAdmin.js` + endpoints)

## ⏳ Next Steps (Manual)

### IMPORTANT: Create .env File
You MUST create a `.env` file in the project root with the Firebase configuration shown above.

Copy the values from the "Frontend (.env file in project root)" section above into your `.env` file.

### Then:
1. ⏳ Commit and push changes to Git
2. ⏳ Pull on remote server
3. ⏳ Install packages on server
4. ⏳ Create .env file on server
5. ⏳ Restart services
