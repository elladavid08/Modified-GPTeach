import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function UserInfoPage() {
	const { currentUser, userProfile } = useAuth();
	const navigate = useNavigate();

	if (!currentUser || !userProfile) {
		return null; // Will redirect via ProtectedRoute
	}

	const getGenderLabel = (gender) => {
		const labels = {
			'male': 'זכר',
			'female': 'נקבה',
			'other': 'אחר',
			'prefer-not-to-say': 'מעדיפ/ה לא לציין'
		};
		return labels[gender] || gender;
	};

	const getTeachingLevelLabel = (level) => {
		const labels = {
			'elementary': 'יסודי',
			'middle-school': 'חטיבת ביניים',
			'high-school': 'תיכון',
			'special-education': 'חינוך מיוחד'
		};
		return labels[level] || level;
	};

	const getDegreeLabel = (degree) => {
		const labels = {
			'bachelors': 'תואר ראשון',
			'masters': 'תואר שני',
			'doctorate': 'דוקטורט',
			'other': 'אחר'
		};
		return labels[degree] || degree;
	};

	const getRoleLabel = (role) => {
		const labels = {
			'teacher': 'מורה',
			'researcher': 'חוקר/ת',
			'student': 'סטודנט/ית',
			'other': 'אחר'
		};
		return labels[role] || role;
	};

	return (
		<div className="container" dir="rtl" style={{ paddingTop: '80px', paddingBottom: '50px' }}>
			<div className="row justify-content-center">
				<div className="col-md-8">
					<div className="card shadow" style={{ marginTop: '20px', marginBottom: '30px' }}>
						<div className="card-body p-5">
							<h2 className="card-title text-center mb-4">פרטי המשתמש</h2>
							
							<div className="row mb-3">
								<div className="col-md-6">
									<strong>שם מלא:</strong>
									<p className="text-muted">{userProfile.fullName}</p>
								</div>
								<div className="col-md-6">
									<strong>אימייל:</strong>
									<p className="text-muted">{currentUser.email}</p>
								</div>
							</div>

							<div className="row mb-3">
								<div className="col-md-6">
									<strong>מגדר:</strong>
									<p className="text-muted">{getGenderLabel(userProfile.gender)}</p>
								</div>
								<div className="col-md-6">
									<strong>גיל:</strong>
									<p className="text-muted">{userProfile.age}</p>
								</div>
							</div>

							<div className="row mb-3">
								<div className="col-md-6">
									<strong>תפקיד:</strong>
									<p className="text-muted">{getRoleLabel(userProfile.role)}</p>
								</div>
							</div>

							{userProfile.role === 'teacher' && userProfile.teachingLevel && (
								<>
									<div className="row mb-3">
										<div className="col-md-6">
											<strong>שכבת לימוד:</strong>
											<p className="text-muted">{getTeachingLevelLabel(userProfile.teachingLevel)}</p>
										</div>
										<div className="col-md-6">
											<strong>שנות ניסיון:</strong>
											<p className="text-muted">{userProfile.yearsExperience} שנים</p>
										</div>
									</div>

									<div className="row mb-3">
										<div className="col-md-6">
											<strong>תואר:</strong>
											<p className="text-muted">{getDegreeLabel(userProfile.degree)}</p>
										</div>
										<div className="col-md-6">
											<strong>מוסד לימוד:</strong>
											<p className="text-muted">{userProfile.institution}</p>
										</div>
									</div>

									<div className="mb-4">
										<strong>תחום התמחות:</strong>
										<p className="text-muted">{userProfile.specialization}</p>
									</div>
								</>
							)}

							<div className="d-flex gap-2">
								<button
									className="btn btn-primary"
									onClick={() => navigate("/profile-setup", { state: { fromEdit: true } })}
								>
									ערוך פרטים
								</button>
								<button
									className="btn btn-outline-secondary"
									onClick={() => navigate("/")}
								>
									חזרה לדף הבית
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
