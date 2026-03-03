import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { updateUserProfile } from "../services/authService";

export default function ProfileSetupPage() {
	const { currentUser, userProfile, hasCompletedProfile, refreshUserProfile } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	
	const [formData, setFormData] = useState({
		fullName: "",
		gender: "",
		age: "",
		role: "",
		teachingLevel: "",
		yearsExperience: "",
		degree: "",
		institution: "",
		specialization: ""
	});
	
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);
	const [loading, setLoading] = useState(false);
	const [initializing, setInitializing] = useState(true);

	useEffect(() => {
		// If user is not authenticated, redirect to login
		if (!currentUser) {
			navigate("/login");
			return;
		}

		// If profile is complete and user didn't explicitly come to edit, redirect to home
		if (hasCompletedProfile && !(location.state && location.state.fromEdit)) {
			navigate("/");
			return;
		}

		// If profile exists, pre-fill the form for editing
		if (userProfile && userProfile.fullName) {
			setFormData({
				fullName: userProfile.fullName || "",
				gender: userProfile.gender || "",
				age: userProfile.age || "",
				role: userProfile.role || "",
				teachingLevel: userProfile.teachingLevel || "",
				yearsExperience: userProfile.yearsExperience || "",
				degree: userProfile.degree || "",
				institution: userProfile.institution || "",
				specialization: userProfile.specialization || ""
			});
			setInitializing(false);
		} else if (currentUser.displayName) {
			// Pre-fill name from Google if available (for new users)
			setFormData(prev => ({
				...prev,
				fullName: currentUser.displayName
			}));
			setInitializing(false);
		} else {
			// No profile data, ready to show form
			setInitializing(false);
		}
	}, [currentUser, userProfile, hasCompletedProfile, location.state, navigate]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		
		// If role changes to non-teacher, clear teaching fields
		if (name === 'role' && value !== 'teacher') {
			setFormData(prev => ({
				...prev,
				[name]: value,
				teachingLevel: '',
				yearsExperience: '',
				degree: '',
				institution: '',
				specialization: ''
			}));
		} else {
			setFormData(prev => ({
				...prev,
				[name]: value
			}));
		}
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		
		// Required fields for everyone
		const requiredFields = ['fullName', 'gender', 'age', 'role'];
		
		// If role is teacher, add teaching-related fields to required
		const fieldsToValidate = formData.role === 'teacher' 
			? [...requiredFields, 'teachingLevel', 'yearsExperience', 'degree', 'institution', 'specialization']
			: requiredFields;
		
		// Validate required fields are filled
		const emptyFields = fieldsToValidate.filter(field => !formData[field]);
		if (emptyFields.length > 0) {
			setError("נא למלא את כל השדות הנדרשים");
			return;
		}

		setError("");
		setLoading(true);

		// Prepare profile data - only include teaching fields if role is teacher
		const profileData = {
			fullName: formData.fullName,
			gender: formData.gender,
			age: formData.age,
			role: formData.role,
			email: currentUser.email,
			createdAt: new Date().toISOString()
		};

		// Add teaching fields only if role is teacher
		if (formData.role === 'teacher') {
			profileData.teachingLevel = formData.teachingLevel;
			profileData.yearsExperience = formData.yearsExperience;
			profileData.degree = formData.degree;
			profileData.institution = formData.institution;
			profileData.specialization = formData.specialization;
		}

		// Save profile to Firestore
		const { error: updateError } = await updateUserProfile(currentUser.uid, profileData);

		if (updateError) {
			console.error("Profile save error:", updateError);
			setError("שגיאה בשמירת הפרופיל. נסה שוב");
			setLoading(false);
		} else {
			// Success - show success message and refresh profile
			setSuccess(true);
			setLoading(false);
			
			// Refresh the user profile in context
			await refreshUserProfile();
			
			// Wait 2 seconds to show success message, then redirect
			setTimeout(() => {
				navigate("/user-info");
			}, 2000);
		}
	};

	if (!currentUser || initializing) {
		return null; // Will redirect in useEffect or still loading
	}

	return (
		<div style={{ minHeight: '100vh', overflowY: 'auto', paddingTop: '80px', paddingBottom: '50px' }}>
			<div className="container" dir="rtl">
				<div className="row justify-content-center">
					<div className="col-md-8">
						<div className="card shadow" style={{ marginTop: '20px', marginBottom: '30px' }}>
							<div className="card-body p-4">
								<h2 className="card-title text-center mb-2">
									{hasCompletedProfile ? "עריכת פרטי המשתמש" : "השלמת פרטי המשתמש"}
								</h2>
							<p className="text-center text-muted mb-4">
								{hasCompletedProfile 
									? "ערוך את הפרטים שלך וזכור לשמור את השינויים"
									: "נא למלא את הפרטים הבאים כדי להתחיל להשתמש במערכת"
								}
							</p>
							
							{error && (
								<div className="alert alert-danger" role="alert">
									{error}
								</div>
							)}

							{success && (
								<div className="alert alert-success" role="alert">
									הפרטים נשמרו בהצלחה!
								</div>
							)}

							<form onSubmit={handleSubmit}>
								{/* שם פרטי ומשפחה */}
								<div className="form-group mb-3">
									<label className="form-label fw-bold">שם פרטי ומשפחה:</label>
									<input
										type="text"
										className="form-control"
										name="fullName"
										value={formData.fullName}
										onChange={handleChange}
										placeholder="לדוגמה: יעל כהן"
										disabled={loading || success}
									/>
								</div>

								{/* מגדר */}
								<div className="form-group mb-3">
									<label className="form-label fw-bold">מגדר:</label>
									<select
										className="form-select"
										name="gender"
										value={formData.gender}
										onChange={handleChange}
										disabled={loading || success}
									>
										<option value="">בחר מגדר</option>
										<option value="male">זכר</option>
										<option value="female">נקבה</option>
										<option value="other">אחר</option>
										<option value="prefer-not-to-say">מעדיפ/ה לא לציין</option>
									</select>
								</div>

								{/* גיל */}
								<div className="form-group mb-3">
									<label className="form-label fw-bold">גיל:</label>
									<input
										type="number"
										className="form-control"
										name="age"
										value={formData.age}
										onChange={handleChange}
										placeholder="לדוגמה: 35"
										min="18"
										max="99"
										disabled={loading || success}
									/>
								</div>

								{/* תפקיד */}
								<div className="form-group mb-3">
									<label className="form-label fw-bold">תפקיד:</label>
									<select
										className="form-select"
										name="role"
										value={formData.role}
										onChange={handleChange}
										disabled={loading || success}
									>
										<option value="">בחר תפקיד</option>
										<option value="teacher">מורה</option>
										<option value="researcher">חוקר/ת</option>
										<option value="student">סטודנט/ית</option>
										<option value="other">אחר</option>
									</select>
								</div>

								{/* Teaching fields - only show if role is teacher */}
								{formData.role === 'teacher' && (
									<>
										{/* שכבת לימוד */}
										<div className="form-group mb-3">
											<label className="form-label fw-bold">שכבת לימוד:</label>
									<select
											className="form-select"
											name="teachingLevel"
											value={formData.teachingLevel}
											onChange={handleChange}
											disabled={loading || success}
										>
											<option value="">בחר שכבת לימוד</option>
											<option value="elementary">יסודי</option>
											<option value="middle-school">חטיבת ביניים</option>
											<option value="high-school">תיכון</option>
											<option value="special-education">חינוך מיוחד</option>
										</select>
										</div>

										{/* שנות ניסיון */}
										<div className="form-group mb-3">
											<label className="form-label fw-bold">שנות ניסיון בהוראה:</label>
											<input
												type="number"
												className="form-control"
												name="yearsExperience"
												value={formData.yearsExperience}
												onChange={handleChange}
												placeholder="לדוגמה: 10"
												min="0"
												max="50"
												disabled={loading || success}
											/>
										</div>

										{/* תואר */}
										<div className="form-group mb-3">
											<label className="form-label fw-bold">תואר אקדמי:</label>
											<select
												className="form-select"
												name="degree"
												value={formData.degree}
												onChange={handleChange}
												disabled={loading || success}
											>
												<option value="">בחר תואר</option>
												<option value="bachelors">תואר ראשון</option>
												<option value="masters">תואר שני</option>
												<option value="doctorate">דוקטורט</option>
												<option value="other">אחר</option>
											</select>
										</div>

										{/* מוסד לימוד */}
										<div className="form-group mb-3">
											<label className="form-label fw-bold">מוסד לימוד (שם המוסד בו אתה מלמד):</label>
											<input
												type="text"
												className="form-control"
												name="institution"
												value={formData.institution}
												onChange={handleChange}
												placeholder='לדוגמה: "בית ספר יסודי רמב״ם"'
												disabled={loading || success}
											/>
										</div>

										{/* תחום התמחות */}
										<div className="form-group mb-4">
											<label className="form-label fw-bold">תחום התמחות:</label>
											<input
												type="text"
												className="form-control"
												name="specialization"
												value={formData.specialization}
												onChange={handleChange}
												placeholder='לדוגמה: "מתמטיקה וגיאומטריה"'
												disabled={loading || success}
											/>
										</div>
									</>
								)}

								<div className="alert alert-info" role="alert">
									<small>
										<strong>הערה:</strong> המידע שתמסור ישמש למטרות מחקר בלבד ויישמר בצורה מאובטחת.
									</small>
								</div>

								<button
									type="submit"
									className="btn btn-primary w-100"
									disabled={loading || success}
								>
									{loading ? "שומר..." : success ? "נשמר בהצלחה!" : hasCompletedProfile ? "שמור שינויים" : "שמור והמשך"}
								</button>
							</form>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
