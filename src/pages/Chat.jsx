import React, { useState, useContext, useEffect } from "react";
import { Constants } from "../config/constants";
import callAI from "../utils/ai.js";
import { getPCKFeedback } from "../services/genai.js";
import { Messages } from "../components/Messages";
import { LessonTargetsSidebar } from "../components/LessonTargetsSidebar";
import { PCKFeedbackSidebar } from "../components/PCKFeedbackSidebar";
import { HistoryContext } from "../objects/ChatHistory";
import { AppContext } from "../objects/AppContext";
import { shuffleArray } from "../utils/primitiveManipulation";
import "../style/ChatOnly.css";

export const Chat = () => {
	const history = useContext(HistoryContext);
	const appData = useContext(AppContext);
	const [isQuerying, setIsQuerying] = useState(false);
	const [hasInitiated, setHasInitiated] = useState(false);
	const [scenario, setScenario] = useState(null);
	const [pckFeedback, setPckFeedback] = useState(null);
	
	// Select scenario once when appData is loaded
	useEffect(() => {
		if (appData.scenarios && !scenario) {
			const selectedScenario = shuffleArray(appData.scenarios)[0];
			console.log("📝 Selected scenario:", {
				text: selectedScenario.text ? selectedScenario.text.substring(0, 50) : '',
				initiatedBy: selectedScenario.initiated_by
			});
			setScenario(selectedScenario);
		}
	}, [appData.scenarios, scenario]);
	
	const students = appData.students ? appData.students.slice(0, Constants.NUM_STUDENTS) : [];

	/** Add the teacher's message and wait for a response */
	function addUserResponse(TAmessage) {
		history.addMessage(TAmessage);
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
			
			// Call AI for student responses
			callAI(history, students, scenario, addendum, async (aiMessages) => {
				// Handle case where no students respond (silence is valid with selective responses)
				if (!aiMessages || aiMessages.length === 0) {
					console.log("📭 No student responses this turn - continuing conversation");
					return;
				}
				
				// Add messages, with delay only if in production
				await history.addMessages(aiMessages, Constants.IS_PRODUCTION);
				
				// NEW: Get PCK feedback in parallel (separate AI call)
				try {
					const teacherMessages = history.getMessages().filter(msg => msg.role === "user");
					const lastTeacherMessage = teacherMessages[teacherMessages.length - 1];
					
					if (lastTeacherMessage) {
						console.log("💡 Requesting PCK feedback for teacher message...");
						const feedback = await getPCKFeedback(
							lastTeacherMessage.text,
							history.getMessages(),
							scenario
						);
						
						console.log("✅ PCK feedback received:", feedback);
						
						// Format feedback for sidebar
						const formattedFeedback = {
							detected_skills: [],
							missed_opportunities: [],
							feedback_message: feedback,
							should_display: true,
							feedback_type: "positive"
						};
						
						setPckFeedback(formattedFeedback);
					}
				} catch (error) {
					console.error("❌ Error getting PCK feedback:", error);
					// Don't block the conversation if PCK feedback fails
				}
			});
		}
	}, [isQuerying, scenario]);

	// Show loading state if data isn't ready
	if (!scenario || !appData.students) {
		return (
			<div style={{ padding: "50px", textAlign: "center", direction: "rtl" }}>
				<h2>טוען...</h2>
			</div>
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
					left: '300px',
					right: '300px',
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
						שיעור גיאומטריה - כיתה ח׳
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

						<div style={{ width: "80px" }}></div> {/* Spacer for symmetry */}
					</div>
				</div>

			{/* Show prompt when teacher should initiate */}
			{history.getLength() === 0 && scenario.initiated_by === "teacher" && !isQuerying && (
			<div
				style={{
					padding: "12px 15px",
					margin: "10px 15px",
					backgroundColor: "#fff3cd",
					border: "2px solid #ffc107",
					borderRadius: "8px",
					textAlign: "center",
					direction: "rtl",
					flex: "0 0 auto"
				}}
			>
				<div style={{ fontSize: "20px", marginBottom: "6px" }}>👋</div>
				<div style={{ fontSize: "15px", fontWeight: "bold", color: "#856404", marginBottom: "6px" }}>
					אתה מתחיל את השיעור
				</div>
				
				<div style={{ fontSize: "13px", color: "#555", fontStyle: "italic", marginTop: "6px" }}>
					{scenario.initial_prompt || "התחל את השיחה עם התלמידים"}
				</div>
			</div>
			)}

				<div style={{ flex: "1 1 auto", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
					<Messages
						isWaitingOnStudent={isQuerying}
						onMessageSend={addUserResponse}
					/>
				</div>
			</div>

			{/* Right Sidebar - PCK Feedback */}
			<PCKFeedbackSidebar 
				feedback={pckFeedback} 
				isVisible={true}
			/>
		</div>
	);
};
