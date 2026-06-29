import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { logout } from "../services/authService";
import { useNavigate, Link } from "react-router-dom";

function DropdownMenu({ label, items }) {
	const [open, setOpen] = useState(false);
	const ref = useRef(null);

	useEffect(() => {
		const handleOutsideClick = (e) => {
			if (ref.current && !ref.current.contains(e.target)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleOutsideClick);
		return () => document.removeEventListener("mousedown", handleOutsideClick);
	}, []);

	return (
		<li className="nav-item" ref={ref} style={{ position: "relative" }}>
			<button
				type="button"
				className="nav-link text-light"
				onClick={() => setOpen((o) => !o)}
				style={{
					border: "none",
					background: "transparent",
					cursor: "pointer",
					padding: "0.5rem 0.75rem",
				}}
			>
				{label}
			</button>
			{open && (
				<ul
					className="dropdown-menu show"
					style={{
						position: "absolute",
						top: "100%",
						right: 0,
						left: "auto",
						minWidth: "10rem",
						zIndex: 1050,
					}}
				>
					{items.map((item, i) =>
						item.onClick ? (
							<li key={i}>
								<button
									className="dropdown-item"
									type="button"
									onClick={() => {
										item.onClick();
										setOpen(false);
									}}
								>
									{item.label}
								</button>
							</li>
						) : (
							<li key={i}>
								<Link
									className="dropdown-item"
									to={item.to}
									onClick={() => setOpen(false)}
								>
									{item.label}
								</Link>
							</li>
						)
					)}
				</ul>
			)}
		</li>
	);
}

export default function Navbar() {
	const { isAuthenticated, currentUser, userProfile } = useAuth();
	const isAnnotator = userProfile && userProfile.isAnnotator;
	const isAdmin = userProfile && userProfile.isAdmin;
	const navigate = useNavigate();

	const handleLogout = async () => {
		await logout();
		navigate("/login");
	};

	const getUserDisplayName = () => {
		if (userProfile && userProfile.fullName) return userProfile.fullName;
		if (currentUser && currentUser.email) return currentUser.email;
		return "פרופיל";
	};

	return (
		<nav
			className="navbar navbar-expand-lg navbar-light bg-primary"
			style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000, height: "60px" }}
		>
			<div className="container">
				{/* Static site name — not a link */}
				<span
					className="navbar-brand text-light"
					style={{ cursor: "default", userSelect: "none", fontWeight: 700, letterSpacing: "0.05em" }}
				>
					RAMBAM
				</span>

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
									<Link className="nav-link text-light" to="/">
										סימולטור
									</Link>
								</li>

								<li className="nav-item">
									<Link className="nav-link text-light" to="/logs">
										השיחות שלי
									</Link>
								</li>

								<DropdownMenu
									label="שאלונים ▾"
									items={[
										{ label: "שאלון פתיחה", to: "/pre-test" },
										{ label: "שאלון סיום", to: "/post-test" },
									]}
								/>

							{isAnnotator && (
								<DropdownMenu
									label="אזור צוות ▾"
									items={[
										{ label: "הערכת שאלונים", to: "/admin/annotate" },
										{ label: "שיחות מחקר", to: "/research-conversations" },
										{ label: "משימות תיוג", to: "/annotation/conv-tasks" },
									]}
								/>
							)}

							{isAdmin && (
								<DropdownMenu
									label="ניהול ▾"
									items={[
										{ label: "כל השיחות", to: "/admin/logs" },
										{ label: "לוח שאלונים", to: "/admin/questionnaires" },
										{ label: "ניהול מחקר", to: "/admin/research" },
										{ label: "תיוג שיחות", to: "/admin/conv-annotation" },
									]}
								/>
							)}

								<DropdownMenu
									label={`${getUserDisplayName()} ▾`}
									items={[
										{ label: "פרופיל", to: "/user-info" },
										{ label: "יציאה", onClick: handleLogout },
									]}
								/>
							</>
						) : (
							<>
								<li className="nav-item">
									<Link className="nav-link text-light" to="/login">
										התחברות
									</Link>
								</li>
								<li className="nav-item">
									<Link className="nav-link text-light" to="/sign-up">
										הרשמה
									</Link>
								</li>
							</>
						)}
					</ul>
				</div>
			</div>
		</nav>
	);
}
