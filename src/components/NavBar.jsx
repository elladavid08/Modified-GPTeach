import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { logout } from "../services/authService";
import { useNavigate } from "react-router-dom";

export default function Navbar() {
	const { isAuthenticated, currentUser, userProfile } = useAuth();
	const isAnnotator = userProfile && userProfile.isAnnotator;
	const navigate = useNavigate();

	const handleLogout = async () => {
		await logout();
		navigate("/login");
	};

	const getUserDisplayName = () => {
		if (userProfile && userProfile.fullName) {
			return userProfile.fullName;
		}
		if (currentUser && currentUser.email) {
			return currentUser.email;
		}
		return 'פרופיל';
	};

	return (
		<nav className="navbar navbar-expand-lg navbar-light bg-primary" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, height: '60px' }}>
			<div className="container">
				<a className="navbar-brand text-light" href="/">
					סימולטור RAMBAM
				</a>
				<button
					className="navbar-toggler"
					type="button"
					data-bs-toggle="collapse"
					data-bs-target="#navbarNav"
					aria-controls="navbarNav"
					aria-expanded="false"
					aria-label="Toggle navigation"
				>
					<span className="navbar-toggler-icon"></span>
				</button>

				<div className="collapse navbar-collapse" id="navbarNav">
					<ul className="navbar-nav ms-auto">
						{isAuthenticated ? (
							<>
								<li className="nav-item">
									<a className="nav-link text-light" href="/">
										דף הבית
									</a>
								</li>
								
							<li className="nav-item">
								<a
									className="nav-link text-light"
									href="/logs"
								>
									היסטוריית שיחות
								</a>
							</li>

							<li className="nav-item">
								<a className="nav-link text-light" href="/pre-test">
									שאלון לפני
								</a>
							</li>

							<li className="nav-item">
								<a className="nav-link text-light" href="/post-test">
									שאלון אחרי
								</a>
							</li>

							{isAnnotator && (
								<li className="nav-item">
									<a className="nav-link text-light" href="/admin/annotate"
										style={{ fontWeight: 600, opacity: 0.9 }}>
										הערכת שאלונים
									</a>
								</li>
							)}

							<li className="nav-item">
								<a className="nav-link text-light" href="/user-info">
									{getUserDisplayName()}
								</a>
							</li>

								<li className="nav-item">
									<button
										className="btn btn-outline-light btn-sm"
										onClick={handleLogout}
										style={{ marginTop: '4px' }}
									>
										יציאה
									</button>
								</li>
							</>
						) : (
							<>
								<li className="nav-item">
									<a className="nav-link text-light" href="/login">
										התחברות
									</a>
								</li>

								<li className="nav-item">
									<a className="nav-link text-light" href="/sign-up">
										הרשמה
									</a>
								</li>
							</>
						)}
					</ul>
				</div>
			</div>
		</nav>
	);
}
