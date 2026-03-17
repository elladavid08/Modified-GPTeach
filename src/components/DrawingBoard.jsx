import React, { useState, useRef, useEffect } from "react";
import { FaMousePointer, FaEraser } from "react-icons/fa";
const { fabric } = require("fabric");

export const DrawingBoard = ({ onDrawingCapture }) => {
	const canvasRef = useRef(null);
	const containerRef = useRef(null);
	const fabricCanvasRef = useRef(null);
	const canvasContextRef = useRef(null);
	const [includeInMessage, setIncludeInMessage] = useState(false);
	const [drawingMode, setDrawingMode] = useState("pen");
	// Position for the floating delete button (shown when a shape is selected)
	const [deleteButtonPos, setDeleteButtonPos] = useState(null);
	const isDrawingRef = useRef(false);
	const tempShapeRef = useRef(null);
	const startPointRef = useRef(null);
	const isErasingRef = useRef(false);
	const lastEraserPointRef = useRef(null);
	const eraserCanvasRef = useRef(null);
	const hasFlattenedRef = useRef(false);

	// Resize the Fabric canvas to fill its container
	const resizeCanvas = () => {
		if (!fabricCanvasRef.current || !containerRef.current) return;
		const w = Math.max(containerRef.current.clientWidth - 4, 300);
		const h = Math.max(containerRef.current.clientHeight - 4, 300);
		fabricCanvasRef.current.setWidth(w);
		fabricCanvasRef.current.setHeight(h);
		fabricCanvasRef.current.renderAll();
	};

	// Initialize Fabric canvas
	useEffect(() => {
		if (!fabric) {
			console.error("Fabric not available!");
			return;
		}
		
		// Add a small delay to ensure DOM is ready
		const timer = setTimeout(() => {
			if (canvasRef.current && !fabricCanvasRef.current) {
				// Use container dimensions if available, otherwise fall back to defaults
				const parentEl = containerRef.current;
				const initWidth = parentEl ? Math.max(parentEl.clientWidth - 4, 400) : 600;
				const initHeight = parentEl ? Math.max(parentEl.clientHeight - 4, 350) : 450;

				const canvas = new fabric.Canvas('drawing-canvas', {
					backgroundColor: "#ffffff",
					width: initWidth,
					height: initHeight,
					selection: true,
					isDrawingMode: true,
				});
			
				// Configure the drawing brush
				if (canvas.freeDrawingBrush) {
					canvas.freeDrawingBrush.color = "#000000";
					canvas.freeDrawingBrush.width = 2;
				}

				fabricCanvasRef.current = canvas;

				// Track selected shape to show floating delete button
				const updateDeletePos = () => {
					const active = canvas.getActiveObject();
					if (!active) { setDeleteButtonPos(null); return; }
					const bound = active.getBoundingRect();
					setDeleteButtonPos({ x: bound.left + bound.width, y: bound.top });
				};
				canvas.on('selection:created', updateDeletePos);
				canvas.on('selection:updated', updateDeletePos);
				canvas.on('object:moving', updateDeletePos);
				canvas.on('object:scaling', updateDeletePos);
				canvas.on('object:rotating', updateDeletePos);
				canvas.on('selection:cleared', () => setDeleteButtonPos(null));
				
				// Get the underlying canvas context for pixel-based erasing
				const canvasElement = canvas.getElement();
				if (canvasElement) {
					canvasContextRef.current = canvasElement.getContext('2d');
				}

				// Handle window resize
				const handleResize = () => {
					if (containerRef.current && fabricCanvasRef.current) {
						const w = Math.max(containerRef.current.clientWidth - 4, 300);
						const h = Math.max(containerRef.current.clientHeight - 4, 300);
						fabricCanvasRef.current.setWidth(w);
						fabricCanvasRef.current.setHeight(h);
						fabricCanvasRef.current.renderAll();
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

	// Delete selected shape(s) when pressing Delete or Backspace
	useEffect(() => {
		const handleKeyDown = (e) => {
			// Don't interfere with typing in text inputs
			const tag = document.activeElement && document.activeElement.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;

			if (e.key === 'Delete' || e.key === 'Backspace') {
				const canvas = fabricCanvasRef.current;
				if (!canvas) return;
				const activeObjects = canvas.getActiveObjects();
				if (activeObjects && activeObjects.length > 0) {
					e.preventDefault();
					activeObjects.forEach(obj => canvas.remove(obj));
					canvas.discardActiveObject();
					canvas.renderAll();
				}
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
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
		
	if (drawingMode === "select") {
		// Selection-only mode: move, resize, rotate existing shapes — no drawing
		canvas.isDrawingMode = false;
		canvas.selection = true;
		// Restore full interactivity on all objects and refresh Fabric's hit-detection
		canvas.forEachObject(obj => {
			obj.selectable = true;
			obj.evented = true;
			obj.hoverCursor = "move";
			obj.setCoords();
		});
		canvas.renderAll();
		// No mouse event listeners needed — Fabric handles selection natively
	} else if (drawingMode === "pen") {
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
		// Make all objects completely non-interactive while erasing
		canvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; obj.hoverCursor = "crosshair"; });
		canvas.discardActiveObject();
		canvas.renderAll();
			
			canvas.on("mouse:down", (options) => {
				isErasingRef.current = true;
				const pointer = canvas.getPointer(options.e);
				lastEraserPointRef.current = pointer;
				
				// On first click, flatten ONLY freehand pen paths to background image.
				// Shapes (rect, line, polygon, etc.) remain as Fabric objects so they
				// stay selectable even after erasing.
				if (!hasFlattenedRef.current) {
					const allObjects = canvas.getObjects();
					// Separate freehand paths from shapes
					const penPaths = allObjects.filter(obj => obj.type === 'path');
					const shapes = allObjects.filter(obj => obj.type !== 'path');

					// Temporarily remove shapes so the snapshot captures only pen strokes
					shapes.forEach(s => canvas.remove(s));

					const dataURL = canvas.toDataURL({ format: 'png' });

					// Clear canvas (removes remaining paths + any background)
					canvas.clear();
					canvas.backgroundColor = '#ffffff';

					// Create persistent eraser canvas for the pen-strokes layer
					const tempCanvas = document.createElement('canvas');
					tempCanvas.width = canvas.width;
					tempCanvas.height = canvas.height;
					eraserCanvasRef.current = tempCanvas;

					const img = new Image();
					img.onload = () => {
						// Draw pen strokes onto eraser canvas
						const ctx = tempCanvas.getContext('2d');
						ctx.drawImage(img, 0, 0);

					// Set pen-strokes layer as Fabric background
					const fabricImg = new fabric.Image(img);
					canvas.setBackgroundImage(fabricImg, () => {
						// Re-add shapes on top — keep them non-interactive while erasing
						shapes.forEach(s => {
							s.set({ selectable: false, evented: false, hoverCursor: "crosshair" });
							canvas.add(s);
						});
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
		// Disable selection entirely while drawing a shape — clicking on an existing
		// shape should start a new drawing, not select the old one.
		// (We auto-switch to "select" mode after mouse:up, which restores selectability.)
		canvas.selection = false;
		// Make all existing objects completely non-interactive while drawing a new shape,
		// so clicking on/near them only starts the new drawing and doesn't select them
		canvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; obj.hoverCursor = "crosshair"; });
		canvas.discardActiveObject();
		canvas.renderAll();
			
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
				} else if (drawingMode === "square") {
					shape = new fabric.Rect({
						left: pointer.x,
						top: pointer.y,
						width: 0,
						height: 0,
						fill: "transparent",
						stroke: "#000000",
						strokeWidth: 2,
					});
				} else if (drawingMode === "line") {
					shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
						stroke: "#000000",
						strokeWidth: 2,
					});
				}
				// parallelogram: shape created dynamically on mouse:move

				if (shape) {
					canvas.add(shape);
					tempShapeRef.current = shape;
				}
			});

			canvas.on("mouse:move", (options) => {
				if (!isDrawingRef.current) return;

				const pointer = canvas.getPointer(options.e);
				const dx = pointer.x - startPointRef.current.x;
				const dy = pointer.y - startPointRef.current.y;

				if (drawingMode === "rectangle") {
					const shape = tempShapeRef.current;
					if (!shape) return;
					shape.set({
						width: Math.abs(dx),
						height: Math.abs(dy),
					});
					if (dx < 0) shape.set({ left: pointer.x });
					if (dy < 0) shape.set({ top: pointer.y });

				} else if (drawingMode === "square") {
					const shape = tempShapeRef.current;
					if (!shape) return;
					const size = Math.max(Math.abs(dx), Math.abs(dy));
					shape.set({ width: size, height: size });
					if (dx < 0) shape.set({ left: startPointRef.current.x - size });
					if (dy < 0) shape.set({ top: startPointRef.current.y - size });

				} else if (drawingMode === "line") {
					const shape = tempShapeRef.current;
					if (!shape) return;
					shape.set({ x2: pointer.x, y2: pointer.y });

				} else if (drawingMode === "parallelogram") {
					// Recreate polygon dynamically on each mouse:move
					if (tempShapeRef.current) {
						canvas.remove(tempShapeRef.current);
					}
					const absX = Math.abs(dx);
					const absY = Math.abs(dy);
					const slant = absX * 0.25;
					const pts = [
						{ x: slant, y: 0 },
						{ x: absX, y: 0 },
						{ x: absX - slant, y: absY },
						{ x: 0, y: absY },
					];
					const newShape = new fabric.Polygon(pts, {
						left: Math.min(pointer.x, startPointRef.current.x),
						top: Math.min(pointer.y, startPointRef.current.y),
						fill: "transparent",
						stroke: "#000000",
						strokeWidth: 2,
						objectCaching: false,
					});
					canvas.add(newShape);
					tempShapeRef.current = newShape;
				}

				canvas.renderAll();
			});

		canvas.on("mouse:up", () => {
			// If a shape was being drawn, auto-switch to select mode
			// so the user can immediately move/resize without drawing another shape
			const drewShape = tempShapeRef.current !== null;
			isDrawingRef.current = false;
			tempShapeRef.current = null;
			if (drewShape) {
				setDrawingMode("select");
			}
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
			const hasBackground = fabricCanvasRef.current.backgroundImage !== null;
			
			// Return null only if truly empty (no objects AND no background image from eraser)
			if ((!objects || objects.length === 0) && !hasBackground) {
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

	// Expose methods to parent component
	React.useImperativeHandle(onDrawingCapture, () => ({
		exportAsImage,
		shouldInclude: () => includeInMessage,
		hasDrawing: () => {
			if (!fabricCanvasRef.current) return false;
			const objects = fabricCanvasRef.current.getObjects();
			const hasBackground = fabricCanvasRef.current.backgroundImage !== null;
			return (objects && objects.length > 0) || hasBackground;
		},
		// Resize canvas to fill its current container (call when board becomes visible)
		resizeCanvas,
		// Reset the "include in message" checkbox to unchecked
		resetInclude: () => setIncludeInMessage(false),
	}));

	const handleClearDrawing = () => {
		if (fabricCanvasRef.current) {
			try {
				fabricCanvasRef.current.clear();
				fabricCanvasRef.current.backgroundColor = "#ffffff";
				fabricCanvasRef.current.renderAll();
				// Also reset eraser state
				hasFlattenedRef.current = false;
				eraserCanvasRef.current = null;
			} catch (error) {
				console.error("Error clearing canvas:", error);
			}
		}
	};

	const buttonStyle = (mode) => ({
		padding: "5px 10px",
		margin: "0 3px",
		border: drawingMode === mode ? "2px solid #007bff" : "1px solid #ddd",
		borderRadius: "4px",
		backgroundColor: drawingMode === mode ? "#e7f3ff" : "#fff",
		cursor: "pointer",
		fontSize: "13px",
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
				padding: "6px 10px", 
				borderBottom: "1px solid #ddd",
				backgroundColor: "#f8f9fa",
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				flexShrink: 0,
			}}>
				<div style={{ display: "flex", gap: "3px", flexWrap: "wrap", alignItems: "center" }}>
					{/* Select mode — icon only */}
					<button onClick={() => setDrawingMode("select")} style={buttonStyle("select")} title="בחר / הזז צורה">
						<FaMousePointer />
					</button>
					{/* Eraser — icon only (before pen) */}
					<button onClick={() => setDrawingMode("eraser")} style={buttonStyle("eraser")} title="מחק">
						<FaEraser />
					</button>
					{/* Pen — icon only */}
					<button onClick={() => setDrawingMode("pen")} style={buttonStyle("pen")} title="עפרון">
						<span role="img" aria-label="pen">✏️</span>
					</button>
					{/* Line — SVG diagonal line icon */}
					<button onClick={() => setDrawingMode("line")} style={buttonStyle("line")} title="קו">
						<svg width="15" height="15" viewBox="0 0 15 15" style={{ display: "block" }}>
							<line x1="2" y1="13" x2="13" y2="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
						</svg>
					</button>
					{/* Shapes with label */}
					<button onClick={() => setDrawingMode("rectangle")} style={buttonStyle("rectangle")}>
						<span role="img" aria-label="rectangle">▭</span> מלבן
					</button>
					<button onClick={() => setDrawingMode("square")} style={buttonStyle("square")}>
						<span role="img" aria-label="square">⬜</span> ריבוע
					</button>
					<button onClick={() => setDrawingMode("parallelogram")} style={buttonStyle("parallelogram")}>
						<span role="img" aria-label="parallelogram">▱</span> מקבילית
					</button>
					<button 
						onClick={handleClearDrawing}
						style={{
							padding: "5px 10px",
							margin: "0 3px",
							border: "1px solid #dc3545",
							borderRadius: "4px",
							backgroundColor: "#fff",
							color: "#dc3545",
							cursor: "pointer",
							fontSize: "13px",
						}}
					>
						<span role="img" aria-label="clear">🗑️</span> נקה הכל
					</button>
				</div>
				
				<label style={{ 
					display: "flex", 
					alignItems: "center", 
					margin: 0,
					cursor: "pointer",
					whiteSpace: "nowrap",
					marginRight: "6px"
				}}>
					<input 
						type="checkbox" 
						checked={includeInMessage}
						onChange={(e) => setIncludeInMessage(e.target.checked)}
						style={{ marginLeft: "6px" }}
					/>
					<span>כלול בהודעה</span>
				</label>
			</div>

		{/* Canvas container - fills all remaining space */}
		<div
			ref={containerRef}
			style={{ 
				flex: "1 1 0",
				overflow: "hidden", 
				position: "relative",
				border: "2px solid #007bff",
				margin: "6px",
				backgroundColor: "#ffffff",
				minHeight: 0,
			}}
		>
			<canvas 
				ref={canvasRef}
				id="drawing-canvas"
			/>

			{/* Floating delete button — appears next to the selected shape */}
			{deleteButtonPos && (
				<button
					title="מחק צורה (Delete)"
					onClick={() => {
						const canvas = fabricCanvasRef.current;
						if (!canvas) return;
						const activeObjects = canvas.getActiveObjects();
						if (activeObjects && activeObjects.length > 0) {
							activeObjects.forEach(obj => canvas.remove(obj));
							canvas.discardActiveObject();
							canvas.renderAll();
						}
						setDeleteButtonPos(null);
					}}
					style={{
						position: "absolute",
						left: deleteButtonPos.x + 6,
						top: deleteButtonPos.y,
						width: "26px",
						height: "26px",
						border: "1px solid #dc3545",
						borderRadius: "4px",
						backgroundColor: "#fff",
						color: "#dc3545",
						cursor: "pointer",
						fontSize: "14px",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 0,
						zIndex: 10,
						boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
					}}
				>
					🗑️
				</button>
			)}
		</div>
		</div>
	);
};
