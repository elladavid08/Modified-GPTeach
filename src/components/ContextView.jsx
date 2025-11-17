import React, { useContext } from "react";
import { GPTeachContext } from "../objects/GPTeach";
import "../style/ContextView.css";

export const ContextView = ({ scenario, children }) => {
	const GPTeachData = useContext(GPTeachContext);

	return (
		<div className="d-flex col-4 contextView">
			<div
				className="d-flex flex-column container"
				style={{
					justifyContent: "space-between",
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

				<h2>יעדי למידה</h2>
				<ul>
					{GPTeachData.learningGoals.map(function(goal, i) {
						return <li key={i}>{goal}</li>;
					})}
				</ul>
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
