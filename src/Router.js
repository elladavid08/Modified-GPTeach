import React from "react";
import { Routes, Route } from "react-router";
import { Chat } from "./pages/Chat";
import { ChatWithCode } from "./pages/ChatWithCode";
import { LandingPage } from "./pages/LandingPage";
import { StudySplashPage } from "./pages/StudySplashPage";
import { StudyScenario } from "./pages/StudyScenario";
import StudyGoogleForm from "./pages/StudyGoogleForm";
import ConfigPage from "./pages/Config";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import ProfileSetupPage from "./pages/ProfileSetupPage";
import UserInfoPage from "./pages/UserInfoPage";
import ConversationLogs from "./pages/ConversationLogs";
import { ProtectedRoute } from "./components/ProtectedRoute";

export const Router = () => {
	return (
		<Routes>
			{/* Authentication routes - no protection needed */}
			<Route path="/login" element={<LoginPage />} />
			<Route path="/sign-up" element={<SignUpPage />} />
			<Route path="/profile-setup" element={<ProfileSetupPage />} />

			{/* Main chat route - protected */}
			<Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
			<Route path="/" element={<ProtectedRoute><Chat /></ProtectedRoute>} />

			{/* Other protected routes */}
			<Route path="/code" element={<ProtectedRoute><ChatWithCode /></ProtectedRoute>} />
			<Route path="/logs" element={<ProtectedRoute><ConversationLogs /></ProtectedRoute>} />
			<Route path="/config/" element={<ProtectedRoute><ConfigPage /></ProtectedRoute>} />
			<Route path="/user-info" element={<ProtectedRoute><UserInfoPage /></ProtectedRoute>} />

			{/* Study sequence routes - protected */}
			<Route path="/sequence/" element={<ProtectedRoute><StudySplashPage /></ProtectedRoute>} />
			<Route path="/sequence/postTest" element={<ProtectedRoute><StudyGoogleForm /></ProtectedRoute>} />
			<Route path="/sequence/:num" element={<ProtectedRoute><StudyScenario /></ProtectedRoute>} />

			{/* Landing page - protected */}
			<Route path="/home" element={<ProtectedRoute><LandingPage /></ProtectedRoute>} />
		</Routes>
	);
};
