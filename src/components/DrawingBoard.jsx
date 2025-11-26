import React, { useState, useRef, useEffect } from "react";
const { fabric } = require("fabric");

export const DrawingBoard = ({ onDrawingCapture }) => {
	const canvasRef = useRef(null);
	const fabricCanvasRef = useRef(null);
	const canvasContextRef = useRef(null);
	const [includeInMessage, setIncludeInMessage] = useState(true);
	const [drawingMode, setDrawingMode] = useState("pen");
	const isDrawingRef = useRef(false);
	const tempShapeRef = useRef(null);
	const startPointRef = useRef(null);
	const isErasingRef = useRef(false);
	const lastEraserPointRef = useRef(null);
	const eraserCanvasRef = useRef(null);
	const hasFlattenedRef = useRef(false);

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
						width: Math.max(parentWidth - 20, 600),
						height: Math.max(parentHeight - 100, 500),
						selection: true,
						isDrawingMode: true,
					});
				
				// Configure the drawing brush
				if (canvas.freeDrawingBrush) {
					canvas.freeDrawingBrush.color = "#000000";
					canvas.freeDrawingBrush.width = 2;
				}

				fabricCanvasRef.current = canvas;
				
				// Get the underlying canvas context for pixel-based erasing
				const canvasElement = canvas.getElement();
				if (canvasElement) {
					canvasContextRef.current = canvasElement.getContext('2d');
				}

			// Handle window resize
			const handleResize = () => {
				if (canvasRef.current && fabricCanvasRef.current) {
					const parentWidth = canvasRef.current.parentElement.clientWidth;
					const parentHeight = canvasRef.current.parentElement.clientHeight;
					fabricCanvasRef.current.setDimensions({
						width: Math.max(parentWidth - 20, 600),
						height: Math.max(parentHeight - 100, 500),
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
		
		// Always clean up existing event listeners first
		canvas.off("mouse:down");
		canvas.off("mouse:move");
		canvas.off("mouse:up");
		
		// Reset eraser state when switching away from eraser
		if (drawingMode !== "eraser") {
			hasFlattenedRef.current = false;
			eraserCanvasRef.current = null;
		}
		
		if (drawingMode === "pen") {
			// Enable Fabric's built-in freehand drawing mode
			canvas.isDrawingMode = true;
			// Create new brush for pen mode
			canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
			canvas.freeDrawingBrush.color = "#000000";
			canvas.freeDrawingBrush.width = 2;
		} else if (drawingMode === "eraser") {
			// True pixel eraser - converts canvas to flat image first
			canvas.isDrawingMode = false;
			canvas.selection = false;
			
			canvas.on("mouse:down", (options) => {
				isErasingRef.current = true;
				const pointer = canvas.getPointer(options.e);
				lastEraserPointRef.current = pointer;
				
				// On first click, flatten all objects to a background image
				if (!hasFlattenedRef.current) {
					const dataURL = canvas.toDataURL({ format: 'png' });
					canvas.clear();
					canvas.backgroundColor = '#ffffff';
					
					// Create persistent eraser canvas
					const tempCanvas = document.createElement('canvas');
					tempCanvas.width = canvas.width;
					tempCanvas.height = canvas.height;
					eraserCanvasRef.current = tempCanvas;
					
					// Set the flattened image as background
					const img = new Image();
					img.onload = () => {
						// Draw to eraser canvas
						const ctx = tempCanvas.getContext('2d');
						ctx.drawImage(img, 0, 0);
						
						// Show in Fabric
						const fabricImg = new fabric.Image(img);
						canvas.setBackgroundImage(fabricImg, () => {
							canvas.renderAll();
							hasFlattenedRef.current = true;
						});
					};
					img.src = dataURL;
				}
			});
			
			canvas.on("mouse:move", (options) => {
				if (!isErasingRef.current || !hasFlattenedRef.current) return;
				
				const pointer = canvas.getPointer(options.e);
				const lastPoint = lastEraserPointRef.current;
				
				if (!lastPoint) {
					lastEraserPointRef.current = pointer;
					return;
				}
				
				// Erase on the persistent canvas
				const tempCanvas = eraserCanvasRef.current;
				if (tempCanvas) {
					const tempCtx = tempCanvas.getContext('2d');
					
					// Erase pixels
					tempCtx.globalCompositeOperation = 'destination-out';
					tempCtx.lineWidth = 20;
					tempCtx.lineCap = 'round';
					tempCtx.lineJoin = 'round';
					tempCtx.beginPath();
					tempCtx.moveTo(lastPoint.x, lastPoint.y);
					tempCtx.lineTo(pointer.x, pointer.y);
					tempCtx.stroke();
					
					// Update Fabric background image
					const dataURL = tempCanvas.toDataURL();
					fabric.Image.fromURL(dataURL, (img) => {
						canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
					});
				}
				
				lastEraserPointRef.current = pointer;
			});
			
			canvas.on("mouse:up", () => {
				isErasingRef.current = false;
				lastEraserPointRef.current = null;
			});
		} else {
			// Disable freehand mode for shape drawing
			canvas.isDrawingMode = false;
			canvas.selection = true;
			
			// Set up shape drawing event listeners

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
					<button onClick={() => setDrawingMode("eraser")} style={buttonStyle("eraser")}>
						<span role="img" aria-label="eraser">🧹</span> מחק
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

