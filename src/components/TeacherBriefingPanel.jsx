import React, { useState } from "react";

const BRIEFING_CONTENT_ID = "teacher-briefing-content";

/**
 * Teacher briefing of a teacher-initiated scenario (B20; collapsible since 1.4.4).
 *
 * - Before the first message: the open pre-lesson card (unchanged from earlier versions).
 * - Once the conversation has started: a one-line toggle at the same place, collapsed at first,
 *   that opens the same briefing text and can be opened and closed at any time.
 *
 * Display only: the open / closed state is local to this component and never touches the
 * conversation, the turn lock, logging or any agent call.
 */
export const TeacherBriefingPanel = ({ briefing, fallbackText, lessonStarted }) => {
	const [isOpen, setIsOpen] = useState(false);

	if (!lessonStarted) {
		return (
			<div
				data-testid="teacher-briefing-prelesson"
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
				{briefing && (
					<div style={{ padding: "12px", backgroundColor: "#fff3cd", borderRadius: "6px" }}>
						<div style={{ fontSize: "14px", fontWeight: "bold", color: "#856404", marginBottom: "8px" }}>
							📋 הנחיות:
						</div>
						<div style={{ fontSize: "13px", color: "#333", whiteSpace: "pre-line", lineHeight: "1.6" }}>
							{briefing}
						</div>
					</div>
				)}

				{/* Simple fallback if no teacher briefing */}
				{!briefing && (
					<div style={{ fontSize: "13px", color: "#555", fontStyle: "italic", textAlign: "center" }}>
						{fallbackText}
					</div>
				)}
			</div>
		);
	}

	// Nothing to reopen without a briefing (the fallback is only a "start the lesson" prompt)
	if (!briefing) {
		return null;
	}

	return (
		<div
			data-testid="teacher-briefing-panel"
			style={{ margin: "6px 15px 0 15px", direction: "rtl", flex: "0 0 auto" }}
		>
			<button
				type="button"
				data-testid="teacher-briefing-toggle"
				aria-expanded={isOpen}
				aria-controls={BRIEFING_CONTENT_ID}
				onClick={() => setIsOpen((open) => !open)}
				style={{
					width: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					direction: "rtl",
					padding: "4px 12px",
					fontSize: "13px",
					color: "#856404",
					backgroundColor: isOpen ? "#fff3cd" : "#fffbea",
					border: "1px solid #ffeeba",
					borderRadius: isOpen ? "6px 6px 0 0" : "6px",
					cursor: "pointer"
				}}
			>
				<span style={{ fontWeight: "bold" }}>📋 הנחיות לשיעור</span>
				<span style={{ fontSize: "12px" }}>{isOpen ? "הסתר ▴" : "הצג ▾"}</span>
			</button>
			{isOpen && (
				<div
					id={BRIEFING_CONTENT_ID}
					data-testid="teacher-briefing-content"
					role="region"
					aria-label="הנחיות לשיעור"
					style={{
						padding: "10px 12px",
						backgroundColor: "#fff3cd",
						border: "1px solid #ffeeba",
						borderTop: "none",
						borderRadius: "0 0 6px 6px",
						fontSize: "13px",
						color: "#333",
						whiteSpace: "pre-line",
						lineHeight: "1.6",
						maxHeight: "30vh",
						overflowY: "auto"
					}}
				>{briefing}</div>
			)}
		</div>
	);
};

export default TeacherBriefingPanel;
