import React, { useState, useEffect, useContext, useRef } from "react";
import { Link } from "react-router-dom";
import { Constants } from "../config/constants";
import callAI from "../utils/ai.js";
import { DrawingBoard } from "../components/DrawingBoard";
import { Messages } from "../components/Messages";
import { ContextView } from "../components/ContextView";
import { HistoryContext } from "../objects/ChatHistory";
import { AppContext } from "../objects/AppContext";
import { shuffleArray } from "../utils/primitiveManipulation";
import "../style/ChatOnly.css";

export const ChatWithCode = () => {
	const history = useContext(HistoryContext);
	const appData = useContext(AppContext);
	const [isQuerying, setIsQuerying] = useState(false);
	const [hasInitiated, setHasInitiated] = useState(false);
	const students = appData.students.slice(0, Constants.NUM_STUDENTS);
	// Select scenario once at mount and keep it stable throughout the session
	const [scenario] = useState(() => shuffleArray(appData.scenarios)[0]);
	// Reference to DrawingBoard for capturing drawings
	const drawingBoardRef = useRef(null);

	/** Add the tutor's message and wait for a response */
	async function addWrittenResponse(TAmessage) {
		// Check if we should include a drawing
		let messageWithImage = TAmessage;
		
		if (drawingBoardRef.current) {
			const shouldInclude = drawingBoardRef.current.shouldInclude();
			const hasDrawing = drawingBoardRef.current.hasDrawing();
			
			if (shouldInclude && hasDrawing) {
				const imageBase64 = await drawingBoardRef.current.exportAsImage();
				if (imageBase64) {
					// Create new message with image
					const ChatMessage = (await import("../objects/ChatMessage")).default;
					messageWithImage = new ChatMessage(
						TAmessage.agent,
						TAmessage.text,
						TAmessage.role,
						imageBase64
					);
				}
			}
		}
		
		history.addMessage(messageWithImage);
		setIsQuerying(true);
	}


	/** Students initiate the conversation when component mounts */
	useEffect(() => {
		console.log("🔍 Initiation check:", { 
			hasInitiated, 
			historyLength: history.getLength(),
			students: students ? students.length : null 
		});
		
		// Only initiate once and only if history is empty
		if (!hasInitiated && history.getLength() === 0) {
			console.log("✅ Starting conversation - students will initiate!");
			setHasInitiated(true);
			setIsQuerying(true);
		}
	}, [hasInitiated, history]);

	/** If we are now waiting for a response, call AI */
	useEffect(() => {
		console.log("🔍 Query check:", { isQuerying, historyLength: history.getLength() });
		
		if (isQuerying) {
			// For initial message when history is empty, add prompt for students to start
			const isInitialMessage = history.getLength() === 0;
			console.log("🤖 Calling AI - isInitialMessage:", isInitialMessage);
			
			const addendum = isInitialMessage 
				? "\n\n🎯 CRITICAL INSTRUCTION - STUDENT-INITIATED CONVERSATION: The students are arriving for their tutoring session and should START the conversation. They should greet you and IMMEDIATELY present a specific geometry problem or question related to today's topic. They are confused and need help. The tutor has NOT spoken yet - students speak FIRST. Example: 'שלום! אנחנו צריכים עזרה עם בעיה. יש לנו משולש שווה שוקיים עם...' Make it natural - students come WITH a problem already!"
				: "";
			
			callAI(
				history,
				students,
				scenario,
				addendum,
			(aiMessages, codePieces) => {
				// Add the messages from AI
				// Note: codePieces handling removed - using DrawingBoard now instead of code editor
				if (aiMessages[0]) {
					history
						.addMessages(aiMessages, Constants.IS_PRODUCTION)
						.then(() => {
							setIsQuerying(false);
						});
				} else {
					// Something has gone wrong!!!! (TODO: handle this)
					setIsQuerying(false);
					console.log("well shoot");
				}
			}
			);
		}
	}, [isQuerying, history, students, scenario]);

	return (
		<div className="d-flex flex-row row" id="everythingWrapper">
			<ContextView scenario={scenario}>
			<Link to={"#"}>
				<button className="btn btn-outline-success" disabled={isQuerying}>
					שיחה חדשה
				</button>
			</Link>
			</ContextView>

		<div className="codeEditorWrapper col-4">
			<h2>לוח ציור</h2>
			<DrawingBoard onDrawingCapture={drawingBoardRef} />
		</div>

		<div
			className="d-flex flex-column chatConvoWrapper col-4"
			style={{
				overflow: "auto",
				flexGrow: 1,
			}}
		>
			<h1
				style={{
					paddingTop: "15px",
					textAlign: "center",
				}}
			>
				<span role="img" aria-label="chat bubble">
					💬
				</span>{" "}
				שיעור עזר מקוון
			</h1>

			<h2
				style={{
					textAlign: "center",
					fontSize: "18px",
					color: "grey",
					fontStyle: "italic",
					margin: "0px",
					padding: "0px",
				}}
			>
				<span style={{ fontWeight: "bold" }}>{Constants.NUM_STUDENTS}</span>{" "}
				תלמידים נוכחים:{" "}
				{students.map((student) => student.name).join(", ")}
			</h2>

				<Messages
					isWaitingOnStudent={isQuerying}
					onMessageSend={addWrittenResponse}
				/>
			</div>
		</div>
	);
};
