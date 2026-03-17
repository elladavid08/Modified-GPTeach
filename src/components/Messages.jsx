import React, { useEffect, useContext } from "react";
import { HistoryContext } from "../objects/ChatHistory";
import { InputField } from "./InputField.js";
import { DrawingBoard } from "./DrawingBoard";
import ChatBubble from "./ChatBubble";
import "../style/Messages.css";

export const Messages = ({ isWaitingOnStudent, onMessageSend, showBoard, onToggleBoard, drawingBoardRef }) => {
	const messagesWrapperRef = React.createRef();
	const history = useContext(HistoryContext);

	// Removed resizeChatWrapper - now using flexbox for layout
	useEffect(scrollToBottom, [isWaitingOnStudent, history.getMessages().length]);

	// When board becomes visible, resize canvas to fill its container
	useEffect(() => {
		if (showBoard && drawingBoardRef && drawingBoardRef.current && drawingBoardRef.current.resizeCanvas) {
			const timer = setTimeout(() => {
				drawingBoardRef.current.resizeCanvas();
			}, 50);
			return () => clearTimeout(timer);
		}
	}, [showBoard, drawingBoardRef]);

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
			{/* Messages list - hidden (not unmounted) when board is open, so scroll position is kept */}
			<div
				className="flex-column messagesWrapper col"
				ref={messagesWrapperRef}
				style={{ flex: "1 1 auto", overflowY: "auto", minHeight: 0, padding: "8px", display: showBoard ? "none" : "flex" }}
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

			{/* Drawing board - hidden (not unmounted) when closed, so canvas content is preserved */}
			<div style={{ flex: "1 1 auto", minHeight: 0, display: showBoard ? "flex" : "none", flexDirection: "column" }}>
				<DrawingBoard onDrawingCapture={drawingBoardRef} />
			</div>

			<div style={{ flex: "0 0 auto", padding: "8px 10px", backgroundColor: "#f8f9fa", borderTop: "1px solid #dee2e6" }}>
				<InputField
					onSend={onMessageSend}
					undoMessage={history.undoMessage()}
					disabled={isWaitingOnStudent}
					onKeystroke={onKeystroke}
					boardOpen={showBoard}
					onToggleBoard={onToggleBoard}
				/>
			</div>
		</>
	);
};
