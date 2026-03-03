import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithEmail, signInWithGoogle, getUserProfile } from "../services/authService";

export default function LoginPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();

	const handleEmailLogin = async (e) => {
		e.preventDefault();
		
		if (!email || !password) {
			setError("נא למלא את כל השדות");
			return;
		}

		setError("");
		setLoading(true);

		const { user, error: loginError } = await signInWithEmail(email, password);

		if (loginError) {
			setError(getHebrewErrorMessage(loginError));
			setLoading(false);
		} else if (user) {
			// Check if user has completed profile
			const { profile } = await getUserProfile(user.uid);
			if (profile && profile.profileComplete) {
				// Profile complete - go to home
				navigate("/");
			} else {
				// Profile incomplete - go to profile setup
				navigate("/profile-setup");
			}
		}
	};

	const handleGoogleLogin = async () => {
		setError("");
		setLoading(true);

		const { user, error: loginError } = await signInWithGoogle();

		if (loginError) {
			setError(getHebrewErrorMessage(loginError));
			setLoading(false);
		} else if (user) {
			// Check if user has completed profile
			const { profile } = await getUserProfile(user.uid);
			if (profile && profile.profileComplete) {
				// Profile complete - go to home
				navigate("/");
			} else {
				// Profile incomplete - go to profile setup
				navigate("/profile-setup");
			}
		}
	};

	const getHebrewErrorMessage = (error) => {
		if (error.includes("user-not-found") || error.includes("wrong-password")) {
			return "אימייל או סיסמה שגויים";
		}
		if (error.includes("invalid-email")) {
			return "כתובת אימייל לא תקינה";
		}
		if (error.includes("too-many-requests")) {
			return "יותר מדי נסיונות התחברות. נסה שוב מאוחר יותר";
		}
		return "שגיאה בהתחברות. נסה שוב";
	};

	return (
		<div className="container" dir="rtl" style={{ paddingTop: '80px', paddingBottom: '50px' }}>
			<div className="row justify-content-center">
				<div className="col-md-6">
					<div className="card shadow" style={{ marginTop: '20px', marginBottom: '30px' }}>
						<div className="card-body p-5">
							<h2 className="card-title text-center mb-4">התחברות למערכת RAMBAM</h2>
							
							{error && (
								<div className="alert alert-danger" role="alert">
									{error}
								</div>
							)}

							<form onSubmit={handleEmailLogin}>
								<div className="form-group mb-3">
									<label className="form-label">אימייל:</label>
									<input
										type="email"
										className="form-control"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="your.email@example.com"
										disabled={loading}
									/>
								</div>

								<div className="form-group mb-4">
									<label className="form-label">סיסמה:</label>
									<input
										type="password"
										className="form-control"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										placeholder="••••••••"
										disabled={loading}
									/>
								</div>

								<button
									type="submit"
									className="btn btn-primary w-100 mb-3"
									disabled={loading}
								>
									{loading ? "מתחבר..." : "התחבר"}
								</button>
							</form>

							<div className="text-center mb-3">
								<span className="text-muted">או</span>
							</div>

							<button
								type="button"
								className="btn btn-outline-danger w-100 mb-4"
								onClick={handleGoogleLogin}
								disabled={loading}
							>
								<svg width="18" height="18" viewBox="0 0 18 18" style={{ marginLeft: '8px' }}>
									<path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"></path>
									<path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"></path>
									<path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"></path>
									<path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"></path>
								</svg>
								התחבר עם Google
							</button>

							<div className="text-center">
								<p className="text-muted mb-0">
									אין לך חשבון? <Link to="/sign-up">הירשם כאן</Link>
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
