export default class ChatMessage {
	constructor(agent, text, role, image = null) {
		// Student name or Tutor
		this.agent = agent;
		this.name = agent;
		// Required by chat-style AI models (GPT 3.5/4, Gemini)
		this.role = role;
		// Get rid of any newlines
		this.text = text.replace(/[\n]/gm, "");
		// Optional image (base64 PNG string)
		this.image = image;
		// Creation date
		this.dateObject = new Date();
		// Now, as epoch time (in ms)
		this.timestamp = this.dateObject.valueOf();
	}

	toString() {
		return `${this.agent}: ${this.text}`;
	}

	toAIformat() {
		// If there's an image, use multimodal content format (Gemini)
		if (this.image) {
			return {
				role: this.role,
				content: [
					{ text: this.text },
					{ 
						inline_data: { 
							mime_type: "image/png", 
							data: this.image 
						} 
					}
				],
				name: this.agent,
			};
		}
		
		// Text-only format (original behavior)
		return {
			role: this.role,
			content: this.text,
			name: this.agent,
		};
	}
}
