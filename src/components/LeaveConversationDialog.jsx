import React, { useEffect, useRef } from "react";

/**
 * 1.5.0: shown when the teacher asks to return to scenario selection before finishing the conversation.
 * Three choices: finish with the existing flow, return anyway (what was logged stays as it is; the next
 * selection starts a new conversation), or continue. Escape and a click outside also continue.
 * Unfinished conversations cannot be resumed, so the text promises nothing of the kind.
 */
export const LeaveConversationDialog = ({ onFinish, onLeave, onCancel, disabled = false }) => {
	const continueRef = useRef(null);

	useEffect(() => {
		// Focus the safe choice, so Enter in the chat input cannot send a message behind the dialog
		if (continueRef.current) continueRef.current.focus();
		const onKeyDown = (e) => {
			if (e.key === "Escape") onCancel();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onCancel]);

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: "rgba(0, 0, 0, 0.5)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 2000,
				padding: "20px",
			}}
			onClick={onCancel}
		>
			<div
				data-testid="leave-conversation-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="leave-conversation-title"
				aria-describedby="leave-conversation-body"
				dir="rtl"
				style={{
					backgroundColor: "white",
					borderRadius: "12px",
					maxWidth: "480px",
					width: "100%",
					padding: "24px",
					direction: "rtl",
					textAlign: "right",
					boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)",
				}}
				onClick={(e) => e.stopPropagation()}
			>
				<h4 id="leave-conversation-title" style={{ marginTop: 0, marginBottom: "12px" }}>
					השיחה עדיין לא הסתיימה
				</h4>
				<div id="leave-conversation-body" style={{ fontSize: "15px", lineHeight: 1.6 }}>
					<p style={{ marginBottom: "8px" }}>אם סיימת את השיעור, מומלץ לסיים את השיחה ולקבל משוב מסכם.</p>
					<p style={{ marginBottom: 0 }}>
						אם תחזור עכשיו לבחירת התרחישים, מה שנאמר עד כה יישמר ברשומות, אבל כשתבחר שוב בתרחיש תתחיל שיחה חדשה.
					</p>
				</div>
				<div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "20px" }}>
					<button type="button" className="btn btn-primary btn-sm" onClick={onFinish} disabled={disabled}>
						סיים שיחה וקבל משוב
					</button>
					<button type="button" className="btn btn-outline-danger btn-sm" onClick={onLeave} disabled={disabled}>
						חזרה לבחירת תרחיש
					</button>
					<button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel} ref={continueRef}>
						המשך בשיחה
					</button>
				</div>
			</div>
		</div>
	);
};
