import React, { useState, useContext, useEffect } from "react";
import { Link } from "react-router-dom";
import { Constants } from "../config/constants";
import callAI from "../utils/ai.js";
import { Messages } from "../components/Messages";
import { ContextView } from "../components/ContextView";
import { HistoryContext } from "../objects/ChatHistory";
import { AppContext } from "../objects/AppContext";
import { shuffleArray } from "../utils/primitiveManipulation";
import "../style/ChatOnly.css";

export const Chat = () => {
	const history = useContext(HistoryContext);
	const appData = useContext(AppContext);
	const [isQuerying, setIsQuerying] = useState(false);
	const [hasInitiated, setHasInitiated] = useState(false);
	const students = appData.students.slice(0, Constants.NUM_STUDENTS);
	const scenario = shuffleArray(appData.scenarios)[0];

	/** Add the teacher's message and wait for a response */
	function addUserResponse(TAmessage) {
		history.addMessage(TAmessage);
		setIsQuerying(true);
	}

	/** Initiate conversation when component mounts (based on scenario) */
	useEffect(() => {
		// Only initiate once and only if history is empty
		if (!hasInitiated && history.getLength() === 0) {
			setHasInitiated(true);
			
			// Check who should initiate based on scenario configuration
			if (scenario.initiated_by === "students") {
				// Students start - trigger AI to generate first message
				setIsQuerying(true);
			}
			// If scenario.initiated_by === "teacher", do nothing - wait for teacher to type
		}
	}, [hasInitiated, history, scenario]);

	/** If we are now waiting for a response, call AI */
	useEffect(() => {
		if (isQuerying) {
			const isInitialMessage = history.getLength() === 0;
			let addendum = "";
			
			if (isInitialMessage) {
				// First message - different instructions based on who initiated
				if (scenario.initiated_by === "students") {
					addendum = `\n\n🎯 CRITICAL INSTRUCTION - FIRST MESSAGE: This is the VERY FIRST message of today's geometry lesson. The students are in class and should IMMEDIATELY present a specific geometry problem or question related to today's topic. ${scenario.initial_prompt ? 'Context: ' + scenario.initial_prompt : ''} They should seem engaged but confused/uncertain about something specific. Do NOT wait for the teacher to speak first - students initiate by bringing up a problem or question. Example: 'מורה, יש לנו שאלה. אנחנו לא מבינים למה...' Be natural and jump right into the problem!`;
				} else {
					// Teacher initiated - students respond to teacher's opening
					addendum = `\n\n🎯 FIRST RESPONSE TO TEACHER: The teacher just started the lesson. Students should respond naturally to what the teacher said - asking clarifying questions, showing initial thoughts or confusion, or engaging with the topic the teacher introduced. ${scenario.initial_prompt ? 'Context: ' + scenario.initial_prompt : ''} Be responsive and curious about the topic. Show genuine student reactions.`;
				}
			}
			
			callAI(history, students, scenario, addendum, (aiMessages) => {
				// Handle case where no students respond (silence is valid with selective responses)
				if (!aiMessages || aiMessages.length === 0) {
					console.log("📭 No student responses this turn - continuing conversation");
					setIsQuerying(false);
					return;
				}
				
				// Add messages, with delay only if in production
				history.addMessages(aiMessages, Constants.IS_PRODUCTION).then(() => {
					setIsQuerying(false);
				});
			});
		}
	}, [isQuerying, history, students, scenario]);

	return (
		<div className="d-flex flex-row row chatOnly" id="everythingWrapper">
			<ContextView scenario={scenario}>
				<Link to={"#"}>
					<button
						className="btn btn-outline-success"
						disabled={
							Constants.IS_PRODUCTION &&
							(isQuerying || history.getLength() === 0)
						}
					>
						New Session
					</button>
				</Link>
			</ContextView>

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
				<span role="img" aria-label="classroom">
					🏫
				</span>{" "}
				Geometry Lesson - Grade 8
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
					student(s) present:{" "}
					{students.map((student) => student.name).join(", ")}
				</h2>

				{/* Show prompt when teacher should initiate */}
				{history.getLength() === 0 && scenario.initiated_by === "teacher" && !isQuerying && (
					<div
						style={{
							padding: "20px",
							margin: "20px",
							backgroundColor: "#f0f8ff",
							border: "2px solid #4a90e2",
							borderRadius: "8px",
							textAlign: "center",
						}}
					>
						<div style={{ fontSize: "24px", marginBottom: "10px" }}>💡</div>
						<div style={{ fontSize: "16px", fontWeight: "bold", color: "#2c5aa0", marginBottom: "8px" }}>
							{scenario.initiated_by === "teacher" ? "אתה מתחיל את השיעור" : "Students will start"}
						</div>
						<div style={{ fontSize: "14px", color: "#555", fontStyle: "italic" }}>
							{scenario.initial_prompt || "התחל את השיחה עם התלמידים"}
						</div>
					</div>
				)}

				<Messages
					isWaitingOnStudent={isQuerying}
					onMessageSend={addUserResponse}
				/>
			</div>
		</div>
	);
};
