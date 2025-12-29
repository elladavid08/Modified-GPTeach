import React, { useContext } from "react";
import { AppContext } from "../objects/AppContext";

export default function StudyGoogleForm() {
	const appData = useContext(AppContext);

	return (
		<div className="StudyGoogleForm">
			<div
				style={{
					backgroundColor: "#f0ebf8",
					height: "100%",
					width: "100%",
					overflow: "scroll",
				}}
			>
				<div style={{ margin: "auto" }}>
					<iframe
						style={{ width: "100%", height: "97vh", overflow: "scroll" }}
						src={`https://docs.google.com/forms/d/e/1FAIpQLScaHBk75AfinN5lQmsloAjPzD2Jl3cTrbljyxBuBwsS2cKWTA/viewform?embedded=true&usp=pp_url&entry.481491871=${appData.UID}`}
						title="Google Form"
					>
						Loading…
					</iframe>
				</div>
			</div>
		</div>
	);
}
