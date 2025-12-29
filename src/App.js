import React from "react";
import { Router } from "./Router";
import "bootstrap/dist/css/bootstrap.min.css";
import { AppProvider } from "./objects/AppContext";
import { HistoryProvider } from "./objects/ChatHistory";
import Navbar from "./components/NavBar";

export default function App() {
	return (
		<div className="app">
			<AppProvider>
				<HistoryProvider>
					<Navbar />
					<Router />
				</HistoryProvider>
			</AppProvider>
		</div>
	);
}
