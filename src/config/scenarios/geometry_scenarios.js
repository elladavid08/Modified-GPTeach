const scenarios = [
	// {
	// 	text: "השיעור של השבוע הוא על משולשים: סוגי משולשים, תכונות משולשים, ומשפט אי-השוויון במשולש.",
	// 	keywords: ["משולשים", "שווה צלעות", "שווה שוקיים", "שונה צלעות", "אי-שוויון במשולש"],
	// 	initiated_by: "students", // Who starts: "students" or "teacher"
	// 	initial_prompt: "התלמידים מגיעים לשיעור עזר עם שאלות על משולשים ומשפט אי-השוויון"
	// },
	// {
	// 	text: "השיעור של השבוע הוא על זוויות: זוויות משלימות, זוויות צמודות, וזוויות קדקוד.",
	// 	keywords: ["זוויות", "משלימות", "צמודות", "זוויות קדקוד"],
	// 	initiated_by: "teacher", // Teacher introduces the topic
	// 	initial_prompt: "התחל את השיעור על זוויות - אתה יכול להציג בעיה, לשאול שאלה כללית, או להסביר מושג"
	// },
	// {
	// 	text: "השיעור של השבוע הוא על שטח והיקף: חישוב שטח והיקף של מלבנים, ריבועים ומשולשים.",
	// 	keywords: ["שטח", "היקף", "מלבנים", "ריבועים", "משולשים", "נוסחאות"],
	// 	initiated_by: "students", // Students come with confusion about formulas
	// 	initial_prompt: "התלמידים מבולבלים בין נוסחאות שטח והיקף ומבקשים הבהרה"
	// },

	// ==================== PCK-FOCUSED SCENARIOS ====================
	
	// SCENARIO 1: Perpendicular Diagonals Misconception
	{
		text: "השיעור של השבוע הוא על אלכסונים במרובעים: מעויין, דלתון, ריבוע ומלבן",
		keywords: ["אלכסונים", "מעויין", "דלתון", "ניצבים", "מאונכים"],
		initiated_by: "students",
		initial_prompt: "התלמידים מגיעים עם בלבול לגבי הקשר בין אלכסונים מאונכים למעויין",
		target_pck_skills: ["identify-diagonal-misconception-perpendicular"],
		misconception_focus: "התלמידים יטענו שאם האלכסונים מאונכים אז המרובע הוא בהכרח מעויין",
		pck_guidance: "חפש הזדמנות לזהות בלבול בין טענה לטענה ההפוכה ולבקש דוגמה נגדית"
	},
	
	// SCENARIO 2: Equal Diagonals Misconception
	{
		text: "השיעור של השבוע הוא על תכונות מלבן ודלתון - אלכסונים שווים וחוצים",
		keywords: ["מלבן", "דלתון", "אלכסונים", "שווים", "חוצים"],
		initiated_by: "students",
		initial_prompt: "התלמידים חושבים שאלכסונים שווים מספיקים כדי להגדיר מלבן",
		target_pck_skills: ["identify-diagonal-misconception-equal"],
		misconception_focus: "התלמידים יטענו שאם האלכסונים שווים אז המרובע הוא בהכרח מלבן",
		pck_guidance: "זהה הנחה שגויה שתכונה הכרחית היא גם מספיקה ובקש דוגמה נגדית"
	},
	
	// SCENARIO 3: Angle Bisectors Misconception
	{
		text: "השיעור של השבוע הוא על ריבוע ומעויין - השוואה בין התכונות",
		keywords: ["ריבוע", "מעויין", "אלכסונים", "חוצה זווית", "תכונות"],
		initiated_by: "teacher",
		initial_prompt: "הצג שאלה: מה ההבדל בין ריבוע למעויין? שניהם בעלי אלכסונים החוצים זוויות",
		target_pck_skills: ["identify-diagonal-misconception-angle-bisectors"],
		misconception_focus: "התלמידים יבלבלו בין ריבוע למעויין ויחשבו שחציית זוויות מספיקה לריבוע",
		pck_guidance: "השווה בין צורות קרובות וחדד את ההבחנה בין תכונות משותפות לייחודיות"
	},
	
	// SCENARIO 4: Inclusion Relationships Misconception
	{
		text: "השיעור של השבוע הוא על סיווג מרובעים ויחסי הכלה: ריבוע, מלבן, מעויין",
		keywords: ["סיווג", "הכלה", "ריבוע", "מלבן", "מעויין", "יחס"],
		initiated_by: "students",
		initial_prompt: "התלמידים חושבים שריבוע, מלבן ומעויין הם שלוש צורות נפרדות לגמרי",
		target_pck_skills: ["identify-inclusion-misconception-square"],
		misconception_focus: "התלמידים יראו את המרובעים כקטגוריות נפרדות ולא כהיררכיה עם יחסי הכלה",
		pck_guidance: "זהה הזדמנות ללמד על יחסי הכלה באמצעות שפה של 'כל' ו'חלק מ'"
	}
];

export default { scenarios };

