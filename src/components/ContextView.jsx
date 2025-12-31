import React, { useContext } from "react";
import { AppContext } from "../objects/AppContext";
import "../style/ContextView.css";

export const ContextView = ({ scenario, children }) => {
	const appData = useContext(AppContext);

	return (
		<div className="d-flex col-4 contextView">
			<div
				className="d-flex flex-column container"
				style={{
					justifyContent: "space-between",
					direction: "rtl",
					textAlign: "right"
				}}
			>
			<div>
				<h2>תיאור השיעור</h2>
				<p>
					אתה מורה לתלמידי חטיבת ביניים הלומדים גאומטריה.
					אתה מקיים שיעורי עזר מקוונים.
				</p>

				<div
					className="alert alert-primary"
					role="alert"
					style={{ fontWeight: "bold" }}
				>
					{scenario.text}
				</div>

				{/* Show lesson goals for teacher-initiated scenarios */}
				{scenario.initiated_by === "teacher" && scenario.lesson_goals && (
					<div
						style={{
							padding: "15px",
							marginTop: "15px",
							marginBottom: "15px",
							backgroundColor: "#f0f8ff",
							border: "2px solid #4a90e2",
							borderRadius: "8px",
							textAlign: "right",
							direction: "rtl"
						}}
					>
						<div style={{ fontSize: "20px", marginBottom: "10px", textAlign: "center" }}>💡</div>
						<div style={{ 
							fontSize: "16px", 
							fontWeight: "bold", 
							color: "#2c5aa0", 
							marginBottom: "10px",
							textAlign: "center"
						}}>
							מטרות השיעור
						</div>
						<div style={{ 
							fontSize: "14px", 
							color: "#333",
							whiteSpace: "pre-line",
							lineHeight: "1.6"
						}}>
							{scenario.lesson_goals}
						</div>
					</div>
				)}
			</div>

				<div
					className="d-flex flex-column container"
					style={{
						height: "100%",
						justifyContent: "space-between",
					}}
				>
					{children}
				</div>
			</div>
		</div>
	);
};
