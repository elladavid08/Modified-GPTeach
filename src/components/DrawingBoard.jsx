import React, { useState, useRef, useEffect } from "react";
const { fabric } = require("fabric");

export const DrawingBoard = ({ onDrawingCapture }) => {
	const canvasRef = useRef(null);
	const fabricCanvasRef = useRef(null);
	const [includeInMessage, setIncludeInMessage] = useState(true);
	const [drawingMode, setDrawingMode] = useState("pen");
	const isDrawingRef = useRef(false);
	const tempShapeRef = useRef(null);
	const startPointRef = useRef(null);

	// Initialize Fabric canvas
	useEffect(() => {
		if (!fabric) {
			console.error("Fabric not available!");
			return;
		}
		
		// Add a small delay to ensure DOM is ready
		const timer = setTimeout(() => {
			if (canvasRef.current && !fabricCanvasRef.current) {
				const parentWidth = canvasRef.current.parentElement.clientWidth;
				const parentHeight = canvasRef.current.parentElement.clientHeight;
				
				const canvas = new fabric.Canvas('drawing-canvas', {
					backgroundColor: "#ffffff",
					width: Math.max(parentWidth - 20, 300),
					height: Math.max(parentHeight - 20, 400),
					selection: true,
					isDrawingMode: true,
				});
				
				// Configure the drawing brush
				if (canvas.freeDrawingBrush) {
					canvas.freeDrawingBrush.color = "#000000";
					canvas.freeDrawingBrush.width = 2;
				}

				fabricCanvasRef.current = canvas;

			// Handle window resize
			const handleResize = () => {
				if (canvasRef.current && fabricCanvasRef.current) {
					fabricCanvasRef.current.setDimensions({
						width: canvasRef.current.parentElement.clientWidth,
						height: canvasRef.current.parentElement.clientHeight - 60,
					});
				}
			};

			window.addEventListener("resize", handleResize);

				return () => {
					window.removeEventListener("resize", handleResize);
					canvas.dispose();
				};
			}
		}, 100); // 100ms delay
		
		return () => clearTimeout(timer);
	}, []);

	// Handle drawing mode changes
	useEffect(() => {
		if (!fabricCanvasRef.current) return;

		const canvas = fabricCanvasRef.current;
		
		if (drawingMode === "pen") {
			canvas.isDrawingMode = true;
		} else {
			canvas.isDrawingMode = false;
			
			// Set up shape drawing
			canvas.off("mouse:down");
			canvas.off("mouse:move");
			canvas.off("mouse:up");

		canvas.on("mouse:down", (options) => {
			isDrawingRef.current = true;
			const pointer = canvas.getPointer(options.e);
			startPointRef.current = pointer;

			let shape;
			if (drawingMode === "rectangle") {
				shape = new fabric.Rect({
					left: pointer.x,
					top: pointer.y,
					width: 0,
					height: 0,
					fill: "transparent",
					stroke: "#000000",
					strokeWidth: 2,
				});
			} else if (drawingMode === "circle") {
				shape = new fabric.Circle({
					left: pointer.x,
					top: pointer.y,
					radius: 0,
					fill: "transparent",
					stroke: "#000000",
					strokeWidth: 2,
				});
			} else if (drawingMode === "line") {
				shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
					stroke: "#000000",
					strokeWidth: 2,
				});
			} else if (drawingMode === "triangle") {
				shape = new fabric.Triangle({
					left: pointer.x,
					top: pointer.y,
					width: 0,
					height: 0,
					fill: "transparent",
					stroke: "#000000",
					strokeWidth: 2,
				});
			}

			if (shape) {
				canvas.add(shape);
				tempShapeRef.current = shape;
			}
		});

		canvas.on("mouse:move", (options) => {
			if (!isDrawingRef.current || !tempShapeRef.current) return;

			const pointer = canvas.getPointer(options.e);
			const shape = tempShapeRef.current;

				if (drawingMode === "rectangle") {
					shape.set({
						width: Math.abs(pointer.x - startPointRef.current.x),
						height: Math.abs(pointer.y - startPointRef.current.y),
					});
					if (pointer.x < startPointRef.current.x) {
						shape.set({ left: pointer.x });
					}
					if (pointer.y < startPointRef.current.y) {
						shape.set({ top: pointer.y });
					}
				} else if (drawingMode === "circle") {
					const radius = Math.sqrt(
						Math.pow(pointer.x - startPointRef.current.x, 2) +
						Math.pow(pointer.y - startPointRef.current.y, 2)
					) / 2;
					shape.set({ radius: radius });
				} else if (drawingMode === "line") {
					shape.set({ x2: pointer.x, y2: pointer.y });
				} else if (drawingMode === "triangle") {
					const width = Math.abs(pointer.x - startPointRef.current.x);
					const height = Math.abs(pointer.y - startPointRef.current.y);
					shape.set({ width: width, height: height });
					if (pointer.x < startPointRef.current.x) {
						shape.set({ left: pointer.x });
					}
					if (pointer.y < startPointRef.current.y) {
						shape.set({ top: pointer.y });
					}
				}

				canvas.renderAll();
			});

		canvas.on("mouse:up", () => {
			isDrawingRef.current = false;
			tempShapeRef.current = null;
		});
	}
}, [drawingMode]);

	// Export current drawing as base64 PNG
	const exportAsImage = async () => {
		if (!fabricCanvasRef.current) {
			return null;
		}

		try {
			const objects = fabricCanvasRef.current.getObjects();
			
			// Check if there are any objects drawn
			if (!objects || objects.length === 0) {
				return null;
			}

			// Export as data URL and extract base64
			const dataURL = fabricCanvasRef.current.toDataURL({
				format: "png",
				quality: 1,
			});

			// Remove data URL prefix to get just base64 string
			const base64 = dataURL.split(',')[1];
			return base64;
		} catch (error) {
			console.error("Error exporting drawing:", error);
			return null;
		}
	};

	// Expose export method to parent component
	React.useImperativeHandle(onDrawingCapture, () => ({
		exportAsImage,
		shouldInclude: () => includeInMessage,
		hasDrawing: () => {
			if (!fabricCanvasRef.current) return false;
			const objects = fabricCanvasRef.current.getObjects();
			return objects && objects.length > 0;
		}
	}));

	const handleClearDrawing = () => {
		if (fabricCanvasRef.current) {
			try {
				fabricCanvasRef.current.clear();
				fabricCanvasRef.current.backgroundColor = "#ffffff";
				fabricCanvasRef.current.renderAll();
			} catch (error) {
				console.error("Error clearing canvas:", error);
			}
		}
	};

	const buttonStyle = (mode) => ({
		padding: "6px 12px",
		margin: "0 4px",
		border: drawingMode === mode ? "2px solid #007bff" : "1px solid #ddd",
		borderRadius: "4px",
		backgroundColor: drawingMode === mode ? "#e7f3ff" : "#fff",
		cursor: "pointer",
		fontSize: "14px",
	});

	// Show error if fabric not available
	if (!fabric) {
		return (
			<div style={{ 
				height: "100%", 
				width: "100%", 
				display: "flex", 
				alignItems: "center", 
				justifyContent: "center",
				backgroundColor: "#f8f9fa"
			}}>
				<div>שגיאה בטעינת לוח הציור</div>
			</div>
		);
	}

	return (
		<div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
			{/* Toolbar */}
			<div style={{ 
				padding: "10px", 
				borderBottom: "1px solid #ddd",
				backgroundColor: "#f8f9fa",
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
			}}>
				<div style={{ display: "flex", gap: "4px" }}>
					<button onClick={() => setDrawingMode("pen")} style={buttonStyle("pen")}>
						<span role="img" aria-label="pen">✏️</span> עפרון
					</button>
					<button onClick={() => setDrawingMode("line")} style={buttonStyle("line")}>
						<span role="img" aria-label="line">📏</span> קו
					</button>
					<button onClick={() => setDrawingMode("rectangle")} style={buttonStyle("rectangle")}>
						<span role="img" aria-label="rectangle">▭</span> מלבן
					</button>
					<button onClick={() => setDrawingMode("circle")} style={buttonStyle("circle")}>
						<span role="img" aria-label="circle">⭕</span> עיגול
					</button>
					<button onClick={() => setDrawingMode("triangle")} style={buttonStyle("triangle")}>
						<span role="img" aria-label="triangle">🔺</span> משולש
					</button>
					<button 
						onClick={handleClearDrawing}
						style={{
							padding: "6px 12px",
							margin: "0 4px",
							border: "1px solid #dc3545",
							borderRadius: "4px",
							backgroundColor: "#fff",
							color: "#dc3545",
							cursor: "pointer",
							fontSize: "14px",
						}}
					>
						<span role="img" aria-label="clear">🗑️</span> נקה
					</button>
				</div>
				
				<label style={{ 
					display: "flex", 
					alignItems: "center", 
					margin: 0,
					cursor: "pointer"
				}}>
					<input 
						type="checkbox" 
						checked={includeInMessage}
						onChange={(e) => setIncludeInMessage(e.target.checked)}
						style={{ marginLeft: "8px" }}
					/>
					<span>כלול בהודעה</span>
				</label>
			</div>

		{/* Canvas */}
		<div style={{ 
			flexGrow: 1, 
			overflow: "hidden", 
			position: "relative",
			border: "2px solid #007bff",
			margin: "10px",
			backgroundColor: "#ffffff"
		}}>
		<canvas 
			ref={canvasRef}
			id="drawing-canvas"
			width="800"
			height="600"
		/>
		</div>
		</div>
	);
};

