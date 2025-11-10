import React from "react";
// TEMPORARY: Editor replaced with geometry image
// TODO: Later replace with GeoGebra or interactive board
// import AceEditor from "react-ace";
// import "ace-builds/src-noconflict/mode-python";
// import "ace-builds/src-noconflict/theme-textmate";
// import "ace-builds/src-min-noconflict/ext-language_tools";
// import "ace-builds/src-noconflict/snippets/python";

export const ChatCode = props => {
	// TEMPORARY: Showing geometry reference image instead of code editor
	// To switch back to code editor, uncomment the AceEditor code below and remove the img tag
	return (
		<div style={{ 
			width: "100%", 
			height: "100%", 
			overflow: "auto",
			border: "1px solid #ddd",
			backgroundColor: "#f5f5f5",
			display: "flex",
			justifyContent: "center",
			alignItems: "center",
			padding: "10px"
		}}>
		<img 
			src="/geometric-formulas.png" 
			alt="Geometry formulas reference" 
			style={{ 
				maxWidth: "100%", 
				maxHeight: "100%",
				objectFit: "contain"
			}}
		/>
		</div>
	);

	/* ORIGINAL CODE EDITOR - Commented out for temporary geometry feature
	return (
		<AceEditor
			mode="python"
			value={props.content}
			onChange={e => props.update(e)}
			width="100%"
			fontSize="15px"
			enableBasicAutocompletion={true}
			enableLiveAutocompletion={true}
			enableSnippets={true}
			readOnly={false}
			wrapEnabled={true}
			maxLines={Infinity}
			style={{ width: "100%", flexGrow: 2, border: "1px solid #ddd" }}
		/>
	);
	*/
};
