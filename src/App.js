import React from "react";
import { BrowserRouter } from "react-router-dom";
import { Router } from "./Router";
import "bootstrap/dist/css/bootstrap.min.css";
import { AppProvider } from "./objects/AppContext";
import { HistoryProvider } from "./objects/ChatHistory";
import { AuthProvider } from "./contexts/AuthContext";
import Navbar from "./components/NavBar";

export default function App() {
	return (
		<div className="app">
			<BrowserRouter>
				<AuthProvider>
					<AppProvider>
						<HistoryProvider>
							<Navbar />
							<Router />
						</HistoryProvider>
					</AppProvider>
				</AuthProvider>
			</BrowserRouter>
		</div>
	);
}
