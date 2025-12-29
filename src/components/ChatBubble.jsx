import React, { useContext } from "react";
import { AppContext } from "../objects/AppContext.js";

export default function ChatBubble({ message, children }) {
	const appData = useContext(AppContext);

	let className = "chatBubble";
	const isOther = message.agent !== appData.TAname;

	if (isOther) {
		className += " chatBubbleOther";
	} else {
		className += " chatBubbleUser";
	}

	return (
		<div className="chatBubbleContainer">
			{isOther && (
				<div className="chatBubbleSenderLabel">
					{message.agent}{" "}
					{
						// <ChatAudio
						// 	message={message}
						// 	// Use the voice specified for the student, or default to "alloy"
						// 	voice={
						// 		GPTeachData.students.find(
						// 			(student) => student.name === message.agent
						// 		).voice || "alloy"
						// 	}
						// />
					}
				</div>
			)}

		<div className={className}>
			{message.text}
			{message.image && (
				<div style={{ marginTop: "10px" }}>
					<img 
						src={`data:image/png;base64,${message.image}`}
						alt="ציור של המורה"
						style={{
							maxWidth: "100%",
							maxHeight: "300px",
							borderRadius: "8px",
							border: "1px solid #ddd"
						}}
					/>
				</div>
			)}
			<div>{children}</div>
		</div>
		</div>
	);
}
