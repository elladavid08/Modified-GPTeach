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
import TestPage from "./pages/TestPage";
import AnnotationDashboard from "./pages/AnnotationDashboard";
import AnnotationView from "./pages/AnnotationView";
import AdminConversationLogs from "./pages/AdminConversationLogs";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AnnotatorRoute } from "./components/AnnotatorRoute";
import { AdminRoute } from "./components/AdminRoute";

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

			{/* PCK pre/post tests - protected */}
			<Route path="/pre-test" element={<ProtectedRoute><TestPage testType="pre" /></ProtectedRoute>} />
			<Route path="/post-test" element={<ProtectedRoute><TestPage testType="post" /></ProtectedRoute>} />

		{/* Annotation interface - annotators only */}
		<Route path="/admin/annotate" element={<AnnotatorRoute><AnnotationDashboard /></AnnotatorRoute>} />
		<Route path="/admin/annotate/:submissionId" element={<AnnotatorRoute><AnnotationView /></AnnotatorRoute>} />

		{/* Admin conversation browser - admin only */}
		<Route path="/admin/logs" element={<AdminRoute><AdminConversationLogs /></AdminRoute>} />
		</Routes>
	);
};
