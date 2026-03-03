import React, { useEffect, useRef, useState, useContext } from "react";
import { FaPaperPlane, FaUndo } from "react-icons/fa"; // eslint-disable-line no-unused-vars
import ChatMessage from "../objects/ChatMessage";
import { AppContext } from "../objects/AppContext";

export const InputField = ({ disabled, onSend, undoMessage, onKeystroke }) => {
	const appData = useContext(AppContext);
	const [myMsg, setMyMsg] = useState("");
	const [textareaHeight, setTextareaHeight] = useState("auto");

	const inputRef = useRef(null);

	// submit tutor message
	const handleSubmit = (event) => {
		event.preventDefault();
		onSend(new ChatMessage(appData.TAname, myMsg, "user"));
		setMyMsg("");
		inputRef.current.focus();
	};

	// When msg is updated, focus the text box
	useEffect(() => {
		if (!disabled) {
			inputRef.current.focus();
		}
	}, [disabled, myMsg]);

	// Handle Enter key press
	const handleKeyDown = (event) => {
		// Check if Enter is pressed WITHOUT Shift
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault(); // Prevent new line from being added
			handleSubmit(event);
			setTextareaHeight("auto");
		}
		// If Shift+Enter, do nothing - allow default behavior (new line)
	};

	const handleKeypress = (event) => {
		setMyMsg(event.target.value);

		// Resize the textarea based on what the user has typed
		setTextareaHeight(`${inputRef.current.scrollHeight}px`);

		// If the user deletes all the text, reset the textarea height
		if (event.target.value === "") {
			setTextareaHeight("auto");
		}

		onKeystroke();
	};

	return (
		<>
			<div className="d-flex">
				<form
					id="msg-form"
					style={{ display: "flex", width: "100%" }}
					onSubmit={handleSubmit}
				>
					<div
						className="d-flex flex-column"
						style={{
							border: "1px",
							borderColor: "#ccc",
							borderStyle: "solid",
							borderRadius: "8px",
							padding: "4px",
							width: "100%",
						}}
					>
					<textarea
						disabled={disabled}
						value={myMsg}
						placeholder="הקלד הודעה..."
						style={{
							flexGrow: "2",
							resize: "none",
							border: "none",
							outline: "none",
							height: textareaHeight,
							marginBottom: "2px",
						}}
						onChange={handleKeypress}
						onKeyDown={handleKeyDown}
						autoFocus={true}
						ref={inputRef}
					/>

						<div className="d-flex justify-content-between align-items-flex-end">
							{/* <button
								title="Undo"
								className="btn btn-outline-secondary"
								disabled={disabled}
								onClick={undoMessage}
								value="Undo"
							>
								<FaUndo />
							</button> */}

						<button
							title="שלח"
							className="btn btn-primary ml-auto"
							disabled={disabled}
							onClick={undoMessage}
							type="submit"
							value="Submit"
						>
							<FaPaperPlane />
						</button>
						</div>
					</div>
				</form>
			</div>
		</>
	);
};
