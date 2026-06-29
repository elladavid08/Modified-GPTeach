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
import ResearchConversations from "./pages/ResearchConversations";
import AdminUsers from "./pages/AdminUsers";
import ResearchManagement from "./pages/ResearchManagement";
import ConvAnnotationAdmin from "./pages/ConvAnnotationAdmin";
import ConvAnnotationTasks from "./pages/ConvAnnotationTasks";
import ConvAnnotationEditor from "./pages/ConvAnnotationEditor";
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

	{/* Annotation interface - annotators only (always shows annotator view, even for admins) */}
	<Route path="/admin/annotate" element={<AnnotatorRoute><AnnotationDashboard isAdminView={false} /></AnnotatorRoute>} />
	<Route path="/admin/annotate/:submissionId" element={<AnnotatorRoute><AnnotationView /></AnnotatorRoute>} />

	{/* Admin conversation browser - admin only */}
	<Route path="/admin/logs" element={<AdminRoute><AdminConversationLogs /></AdminRoute>} />

	{/* Annotation dashboard accessible to admins (always shows admin view) */}
	<Route path="/admin/questionnaires" element={<AdminRoute><AnnotationDashboard isAdminView={true} /></AdminRoute>} />

	{/* Admin user management - placeholder */}
	<Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />

	{/* Research conversations for annotators */}
	<Route path="/research-conversations" element={<AnnotatorRoute><ResearchConversations /></AnnotatorRoute>} />

	{/* Research participant management - admin only */}
	<Route path="/admin/research" element={<AdminRoute><ResearchManagement /></AdminRoute>} />

	{/* Conversation annotation — admin management */}
	<Route path="/admin/conv-annotation" element={<AdminRoute><ConvAnnotationAdmin /></AdminRoute>} />

	{/* Conversation annotation — annotator task list and editor */}
	<Route path="/annotation/conv-tasks" element={<AnnotatorRoute><ConvAnnotationTasks /></AnnotatorRoute>} />
	<Route path="/annotation/conv-tasks/:assignmentId" element={<AnnotatorRoute><ConvAnnotationEditor /></AnnotatorRoute>} />
	</Routes>
	);
};
