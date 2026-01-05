import React, { useEffect, useContext } from "react";
import { HistoryContext } from "../objects/ChatHistory";
import { InputField } from "./InputField.js";
import ChatBubble from "./ChatBubble";
import "../style/Messages.css";

export const Messages = ({ isWaitingOnStudent, onMessageSend }) => {
	const messagesWrapperRef = React.createRef();
	const history = useContext(HistoryContext);

	// Removed resizeChatWrapper - now using flexbox for layout
	useEffect(scrollToBottom, [isWaitingOnStudent, history.getMessages().length]);

	function scrollToBottom() {
		const scrollContainer = messagesWrapperRef.current;
		if (scrollContainer) {
			scrollContainer.scrollTo({
				top: scrollContainer.scrollHeight,
				behavior: "smooth",
			});
		}
	}

	/** as we type, scroll to bottom */
	function onKeystroke() {
		scrollToBottom();
	}

	return (
		<>
			<div
				className="d-flex flex-column messagesWrapper col"
				ref={messagesWrapperRef}
				style={{ flex: "1 1 auto", overflowY: "auto", minHeight: 0, padding: "8px" }}
			>
				{history.getMessages().map((msg, i) => (
					<ChatBubble key={i} message={msg} />
				))}

				{isWaitingOnStudent && (
					<div className="chatBubbleContainer">
						<div
							className="chatBubble chatBubbleOther"
							style={{ maxWidth: "10vw", textAlign: "center" }}
						>
							{/* Source: https://tenor.com/view/discord-loading-dots-discord-loading-loading-dots-gif-23479300 */}
							<img
								src="https://media.tenor.com/NqKNFHSmbssAAAAi/discord-loading-dots-discord-loading.gif"
								style={{ width: "20%" }}
								alt="waiting for response..."
							/>
						</div>
					</div>
				)}
			</div>

			<div style={{ flex: "0 0 auto", padding: "8px 10px", backgroundColor: "#f8f9fa", borderTop: "1px solid #dee2e6" }}>
				<InputField
					onSend={onMessageSend}
					undoMessage={history.undoMessage()}
					disabled={isWaitingOnStudent}
					onKeystroke={onKeystroke}
				/>
			</div>
		</>
	);
};
