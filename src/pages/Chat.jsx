import React, { useState, useContext, useEffect, useRef } from "react";
import { Constants } from "../config/constants";
import { SYSTEM_VERSION } from "../config/version";
import callAI from "../utils/ai.js";
import { getPCKFeedback, getPCKSummary } from "../services/genai.js";
import { Messages } from "../components/Messages";
import { LessonTargetsSidebar } from "../components/LessonTargetsSidebar";
import { PCKFeedbackSidebar } from "../components/PCKFeedbackSidebar";
import { PCKSummaryModal } from "../components/PCKSummaryModal";
import { HistoryContext } from "../objects/ChatHistory";
import { AppContext } from "../objects/AppContext";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { ConversationLog } from "../services/conversationLogger";
import { useAuth } from "../contexts/AuthContext";
import ChatMessage from "../objects/ChatMessage";
import "../style/ChatOnly.css";

export const Chat = () => {
	const history = useContext(HistoryContext);
	const appData = useContext(AppContext);
	const { currentUser, userProfile } = useAuth();
	const [isQuerying, setIsQuerying] = useState(false);
	const [hasInitiated, setHasInitiated] = useState(false);
	const [scenario, setScenario] = useState(null);
	const [pckFeedback, setPckFeedback] = useState(null);
	const [feedbackHistory, setFeedbackHistory] = useState([]);
	const [isSessionEnded, setIsSessionEnded] = useState(false);
	const [showSummary, setShowSummary] = useState(false);
	const [summaryFeedback, setSummaryFeedback] = useState(null);
	const [isLoadingSummary, setIsLoadingSummary] = useState(false);
	
	// Use ref to maintain conversation logger across renders
	const conversationLoggerRef = useRef(null);
	
	// Drawing board
	const drawingBoardRef = useRef(null);
	const [showBoard, setShowBoard] = useState(false);
	
	// Scenario is set by the ScenarioSelector — no random pre-selection
	
	// Initialize conversation logger when scenario and students are ready
	useEffect(() => {
		if (scenario && students.length > 0 && !conversationLoggerRef.current && currentUser) {
			console.log("📊 Initializing conversation logger...");
			conversationLoggerRef.current = new ConversationLog(
				scenario, 
				students, 
				currentUser.uid, 
				userProfile, 
				SYSTEM_VERSION
			);
			console.log("✅ Conversation logger initialized:", conversationLoggerRef.current.sessionId);
		}
	}, [scenario, students, currentUser, userProfile]);
	
	const students = appData.students ? appData.students.slice(0, Constants.NUM_STUDENTS) : [];

	/** Add the teacher's message and wait for a response */
	async function addUserResponse(TAmessage) {
		// Clear any previous feedback immediately so it doesn't persist into the next turn
		setPckFeedback(null);

		let messageWithImage = TAmessage;
		
		// Attach drawing to message if the board is open and teacher opted to include it
		if (drawingBoardRef.current) {
			const shouldInclude = drawingBoardRef.current.shouldInclude();
			const hasDrawing = drawingBoardRef.current.hasDrawing();
			
			if (shouldInclude && hasDrawing) {
				const imageBase64 = await drawingBoardRef.current.exportAsImage();
				if (imageBase64) {
					messageWithImage = new ChatMessage(
						TAmessage.agent,
						TAmessage.text,
						TAmessage.role,
						imageBase64
					);
				}
			}
			// Always close the board after sending a message and reset the checkbox
			setShowBoard(false);
			if (drawingBoardRef.current.resetInclude) {
				drawingBoardRef.current.resetInclude();
			}
		}
		
		history.addMessage(messageWithImage);
		setIsQuerying(true);
	}

	/** Initiate conversation when component mounts (based on scenario) */
	useEffect(() => {
		// Guard: Don't run if data isn't loaded yet
		if (!scenario || !appData.students) {
			return;
		}
		
		// Debug logging
		console.log("🔍 Initiation check:", {
			hasInitiated,
			historyLength: history.getLength(),
			initiatedBy: scenario.initiated_by,
			scenarioText: scenario.text ? scenario.text.substring(0, 50) : ''
		});
		
		// Only initiate once and only if history is empty
		if (!hasInitiated && history.getLength() === 0) {
			setHasInitiated(true);
			
			// Check who should initiate based on scenario configuration
			if (scenario.initiated_by === "students") {
				console.log("✅ Students will initiate");
				// Students start - trigger AI to generate first message
				setIsQuerying(true);
			} else {
				console.log("✅ Waiting for teacher to initiate");
			}
			// If scenario.initiated_by === "teacher", do nothing - wait for teacher to type
		}
	}, [hasInitiated, history, scenario, appData.students]);

	/** If we are now waiting for a response, call AI */
	useEffect(() => {
		// Guard: Don't run if scenario isn't loaded yet
		if (!scenario) {
			return;
		}
		
		if (isQuerying) {
			console.log("🤖 Querying AI:", {
				historyLength: history.getLength(),
				initiatedBy: scenario.initiated_by
			});
			
			// Check if this is the first AI response in the conversation
			// For student-initiated: history.length === 0 (students speak first)
			// For teacher-initiated: history.length === 1 (teacher spoke, now students respond)
			const isFirstStudentResponse = 
				(scenario.initiated_by === "students" && history.getLength() === 0) ||
				(scenario.initiated_by === "teacher" && history.getLength() === 1);
			
			let addendum = "";
			
			if (isFirstStudentResponse) {
				// First message - different instructions based on who initiated
				if (scenario.initiated_by === "students") {
					addendum = `\n\n🎯 CRITICAL INSTRUCTION - FIRST MESSAGE: This is the VERY FIRST message of today's geometry lesson.

RESPONSE PATTERN FOR FIRST MESSAGE:
- START WITH 1-2 STUDENTS ONLY (not all 3)
- First student should introduce the problem/question
- If a second student responds, they should BUILD ON what the first said
- Third student should wait for teacher's response before joining
- Make it feel like a natural conversation, not everyone talking at once

CONVERSATION BUILDING:
- Students should build on each other's comments naturally
- Use phrases like: "נכון, וגם...", "אני חושב שזה קשור ל...", "רגע, אז..."
- Create a flowing discussion, not separate statements

${scenario.initial_prompt ? 'Context: ' + scenario.initial_prompt : ''}

Example of good first message:
תלמיד א': "מורה, אמרת לנו שבמעויין האלכסונים מאונכים זה לזה."
תלמיד ב': "נכון. וגם בריבוע האלכסונים מאונכים."

Do NOT wait for the teacher to speak first - students initiate naturally!`;
				} else {
					// Teacher initiated - students respond to teacher's opening
					addendum = `\n\n🎯 FIRST RESPONSE TO TEACHER: This is the FIRST STUDENT RESPONSE to the teacher's opening message. The teacher just started the lesson. Students should respond naturally and appropriately to what the teacher said - asking clarifying questions, showing initial thoughts or confusion, or engaging with the topic the teacher introduced. ${scenario.initial_prompt ? 'Context: ' + scenario.initial_prompt : ''} Be responsive and curious. Show genuine student reactions. NOT ALL STUDENTS need to respond - typically 1-2 students respond to an opening, not all 3 at once.`;
				}
			}
			
		// Set querying to false immediately to prevent double trigger
		setIsQuerying(false);
		
		// NEW FLOW: PCK Analysis FIRST, then student responses
		// This ensures students react based on pedagogical quality
		(async () => {
			let impact_analysis = null;
			let feedbackForLog = null;
			
			// Step 1: Get PCK feedback analysis FIRST (except for first message)
			try {
				const teacherMessages = history.getMessages().filter(msg => msg.role === "user");
				const lastTeacherMessage = teacherMessages[teacherMessages.length - 1];
				
				if (lastTeacherMessage) {
					console.log("🎯 STEP 1: Analyzing teacher's pedagogical move...");
					console.log("💡 Requesting PCK feedback for teacher message...");
					console.log(`📊 Feedback history: ${feedbackHistory.length} previous turns`);
					
					impact_analysis = await getPCKFeedback(
						lastTeacherMessage.text,
						history.getMessages(),
						scenario,
						feedbackHistory.slice(-3) // Pass last 3 feedback items for context
					);
					
				console.log("✅ PCK analysis received:");
				console.log("   - Quality:", impact_analysis.pedagogical_quality);
				console.log("   - Addressed misconception:", impact_analysis.addressed_misconception);
				console.log("   - Predicted understanding:", impact_analysis.predicted_student_state && impact_analysis.predicted_student_state.understanding_level);
					
				// Format feedback for sidebar display
				const formattedFeedback = {
					detected_skills: impact_analysis.demonstrated_skills || [],
					missed_opportunities: impact_analysis.missed_opportunities || [],
					feedback_message: impact_analysis.feedback_message_hebrew || "",
					should_display: impact_analysis.should_provide_feedback || false,  // Respect backend decision
					feedback_type: impact_analysis.pedagogical_quality === "positive" ? "positive" : 
								   impact_analysis.pedagogical_quality === "problematic" ? "negative" : "neutral",
					pedagogical_quality: impact_analysis.pedagogical_quality,
					misconception_addressed: impact_analysis.addressed_misconception,
					scenario_alignment: impact_analysis.scenario_alignment
				};
				
			// Display feedback only if backend says to provide it
			if (impact_analysis.should_provide_feedback) {
				setPckFeedback(formattedFeedback);
			} else {
				// Clear feedback if not needed
				setPckFeedback(null);
			}
				feedbackForLog = formattedFeedback;
				
				// Update feedback history for persistence tracking (last 3 turns)
				setFeedbackHistory(prev => {
					const newHistory = [...prev, {
						pedagogical_quality: impact_analysis.pedagogical_quality,
						feedback_message_hebrew: impact_analysis.feedback_message_hebrew,
						predicted_student_state: impact_analysis.predicted_student_state
					}];
					// Keep only last 5 items for performance
					return newHistory.slice(-5);
				});
				
				console.log("📊 PCK feedback displayed to teacher");
			}
			} catch (error) {
				console.error("❌ Error getting PCK feedback:", error);
				// Continue even if PCK feedback fails, but log it
				impact_analysis = null;
			}
			
			// Step 2: Generate student responses WITH the impact analysis
			console.log("🎯 STEP 2: Generating student responses based on PCK analysis...");
			
			callAI(
				history, 
				students, 
				scenario, 
				addendum,
				impact_analysis,  // NEW: Pass impact_analysis to student agent
				async (aiMessages) => {
					// Handle case where no students respond (silence is valid with selective responses)
					if (!aiMessages || aiMessages.length === 0) {
						console.log("📭 No student responses this turn - continuing conversation");
						return;
					}
					
					console.log(`✅ ${aiMessages.length} student response(s) generated`);
					
					// Add messages, with delay only if in production
					await history.addMessages(aiMessages, Constants.IS_PRODUCTION);
					
					// Log this conversation turn
					if (conversationLoggerRef.current) {
						const teacherMessages = history.getMessages().filter(msg => msg.role === "user");
						const lastTeacherMessage = teacherMessages[teacherMessages.length - 1];
						
					if (lastTeacherMessage) {
						console.log("📊 Logging conversation turn...");
						conversationLoggerRef.current.addTurn(
							lastTeacherMessage.text,
							aiMessages.map(msg => ({ name: msg.name, text: msg.text })),
							feedbackForLog,
							lastTeacherMessage.image || null  // include drawing image if teacher sent one
						);
							console.log("✅ Turn logged. Total turns:", conversationLoggerRef.current.turns.length);
						}
					}
					
					console.log("🎉 Turn complete: PCK analysis → Student responses → Display");
				}
			);
		})();
		}
	}, [isQuerying, scenario]);

	// Handle finishing the conversation
	const handleFinishConversation = () => {
		if (!conversationLoggerRef.current) {
			console.warn("No conversation logger found");
			return;
		}
		
		// End the session
		conversationLoggerRef.current.endSession();
		console.log("🏁 Conversation session ended");
		
		// Save to localStorage
		conversationLoggerRef.current.saveToLocalStorage();
		console.log("💾 Conversation log saved to localStorage");
		
		// Mark session as ended
		setIsSessionEnded(true);
		
		// Show confirmation
		alert(`שיחה הסתיימה!\n\nהשיחה נשמרה בהצלחה.\n\nמזהה שיחה: ${conversationLoggerRef.current.sessionId}\nמספר תגובות: ${conversationLoggerRef.current.turns.length}\nמשך זמן: ${conversationLoggerRef.current.stats.durationMinutes} דקות\n\nכעת תוכל לקבל ניתוח מקיף PCK של השיחה!`);
	};
	
	const handleGetSummary = async () => {
		// If analysis was already generated, just re-show it without a new API call
		if (summaryFeedback) {
			setShowSummary(true);
			return;
		}

		if (!conversationLoggerRef.current) {
			console.warn("No conversation logger found");
			alert("לא נמצא לוג שיחה. אנא סיים את השיחה תחילה.");
			return;
		}
		
		try {
			setIsLoadingSummary(true);
			setShowSummary(true);
			
			console.log("📊 Requesting summary feedback...");
			const conversationLog = conversationLoggerRef.current.toJSON();
			const summary = await getPCKSummary(conversationLog);
			
			console.log("✅ Summary feedback received!");
			setSummaryFeedback(summary.summary);
			
			// Save the feedback to the conversation log
			conversationLoggerRef.current.addSummaryFeedback(summary.summary);
			console.log("💾 Summary feedback saved to conversation log");
		} catch (error) {
			console.error("❌ Error getting summary:", error);
			alert(`שגיאה בקבלת הניתוח: ${error.message}`);
			setShowSummary(false);
		} finally {
			setIsLoadingSummary(false);
		}
	};
	
	// Show spinner while app data is still loading
	if (!appData.students || !appData.scenarios) {
		return (
			<div style={{ padding: "50px", textAlign: "center", direction: "rtl" }}>
				<h2>טוען...</h2>
			</div>
		);
	}

	// Show scenario selector until teacher picks a lesson
	if (!scenario) {
		return (
			<ScenarioSelector
				scenarios={appData.scenarios}
				onSelect={(chosen) => {
					console.log("📝 Scenario selected:", chosen.text);
					setScenario(chosen);
				}}
			/>
		);
	}
	
	return (
		<div style={{ position: 'fixed', width: '100%', height: '100vh', top: 0, left: 0, overflow: 'hidden' }}>
			{/* Left Sidebar - Lesson Targets */}
			<LessonTargetsSidebar scenario={scenario} />

			{/* Main Chat Area */}
			<div
				className="d-flex flex-column"
				style={{
					position: 'fixed',
					left: '22%',
					right: '22%',
					top: '60px',
					bottom: 0,
					height: 'calc(100vh - 60px)',
					overflow: 'hidden',
					direction: "rtl",
					display: 'flex',
					flexDirection: 'column'
				}}
			>
				<div style={{ padding: "20px 15px 8px 15px", borderBottom: "1px solid #dee2e6", flex: "0 0 auto" }}>
					<h1
						style={{
							textAlign: "center",
							direction: "rtl",
							margin: "0 0 5px 0",
							fontSize: "24px",
							lineHeight: "1.2"
						}}
					>
						<span role="img" aria-label="classroom">
							🏫
						</span>{" "}
						שיעור גיאומטריה
					</h1>

					<div style={{ 
						display: "flex", 
						alignItems: "center", 
						justifyContent: "space-between",
						direction: "rtl",
						marginTop: "5px"
					}}>
						<button
							className="btn btn-outline-success btn-sm"
							disabled={
								Constants.IS_PRODUCTION &&
								(isQuerying || history.getLength() === 0)
							}
							onClick={() => {
								window.location.reload();
							}}
							style={{ direction: "rtl", fontSize: "12px", padding: "4px 12px" }}
						>
							שיחה חדשה
						</button>

						<h2
							style={{
								textAlign: "center",
								fontSize: "14px",
								color: "grey",
								fontStyle: "italic",
								margin: 0,
								padding: "0px",
								direction: "rtl",
								flex: 1
							}}
						>
							<span style={{ fontWeight: "bold" }}>{Constants.NUM_STUDENTS}</span>{" "}
							תלמידים נוכחים:{" "}
							{students.map((student) => student.name).join(", ")}
						</h2>

						<div style={{ display: "flex", gap: "8px" }}>
							{isSessionEnded && (
								<button
									className="btn btn-success btn-sm"
									onClick={handleGetSummary}
									disabled={isLoadingSummary}
									style={{ direction: "rtl", fontSize: "12px", padding: "4px 12px" }}
								>
									{isLoadingSummary ? "⏳ מכין ניתוח..." : summaryFeedback ? "📊 צפה בניתוח PCK" : "📊 קבל ניתוח PCK"}
								</button>
							)}
							<button
								className="btn btn-primary btn-sm"
								disabled={isSessionEnded || history.getLength() === 0}
								onClick={handleFinishConversation}
								style={{ direction: "rtl", fontSize: "12px", padding: "4px 12px" }}
							>
								{isSessionEnded ? "✓ שיחה הסתיימה" : "סיים שיחה"}
							</button>
						</div>
					</div>
				</div>

			{/* Show rich briefing when teacher should initiate */}
			{history.getLength() === 0 && scenario.initiated_by === "teacher" && !isQuerying && (
			<div
				style={{
					padding: "15px 20px",
					margin: "10px 15px",
					backgroundColor: "#f8f9fa",
					border: "2px solid #0d6efd",
					borderRadius: "10px",
					direction: "rtl",
					flex: "0 0 auto"
				}}
			>
			{/* Header */}
			<div style={{ textAlign: "center", marginBottom: "15px" }}>
				<div style={{ fontSize: "24px", marginBottom: "8px" }}>📚</div>
				<div style={{ fontSize: "17px", fontWeight: "bold", color: "#0d6efd", marginBottom: "4px" }}>
					אתה מתחיל את השיעור
				</div>
			</div>

			{/* Teacher Briefing - Instructions only */}
			{scenario.teacher_briefing && (
				<div style={{ padding: "12px", backgroundColor: "#fff3cd", borderRadius: "6px" }}>
					<div style={{ fontSize: "14px", fontWeight: "bold", color: "#856404", marginBottom: "8px" }}>
						📋 הנחיות:
					</div>
					<div style={{ fontSize: "13px", color: "#333", whiteSpace: "pre-line", lineHeight: "1.6" }}>
						{scenario.teacher_briefing}
					</div>
				</div>
			)}

			{/* Simple fallback if no teacher briefing */}
			{!scenario.teacher_briefing && (
				<div style={{ fontSize: "13px", color: "#555", fontStyle: "italic", textAlign: "center" }}>
					{scenario.initial_prompt || "התחל את השיחה עם התלמידים"}
				</div>
			)}
			</div>
			)}

				<div style={{ flex: "1 1 auto", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
				<Messages
					isWaitingOnStudent={isQuerying}
					onMessageSend={addUserResponse}
					showBoard={showBoard}
					onToggleBoard={setShowBoard}
					drawingBoardRef={drawingBoardRef}
				/>
				</div>
			</div>

			{/* Right Sidebar - PCK Feedback */}
			<PCKFeedbackSidebar 
				feedback={pckFeedback} 
				isVisible={true}
			/>
			
			{/* PCK Summary Modal */}
			{showSummary && (
				<PCKSummaryModal
					summary={summaryFeedback}
					isLoading={isLoadingSummary}
					onClose={() => setShowSummary(false)}
				/>
			)}
		</div>
	);
};
