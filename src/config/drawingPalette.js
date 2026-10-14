/**
 * Drawing-board colours (1.5.0, pilot request #7). A small fixed palette for geometry annotations,
 * from the Okabe-Ito colour-blind-safe set, so the colours stay distinguishable for colour-blind
 * viewers and against the white board. Black is the default.
 */
export const DRAWING_COLORS = [
	{ id: "black", value: "#000000", label: "שחור" },
	{ id: "blue", value: "#0072B2", label: "כחול" },
	{ id: "red", value: "#D55E00", label: "אדום" },
	{ id: "green", value: "#009E73", label: "ירוק" },
];

export const DEFAULT_DRAWING_COLOR = DRAWING_COLORS[0].value;
