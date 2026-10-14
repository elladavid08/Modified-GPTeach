// Minimal React 18 DOM helpers for Jest (no extra testing-library dependency).
import { act } from "react";
import { createRoot } from "react-dom/client";

global.IS_REACT_ACT_ENVIRONMENT = true;

export function render(element) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => {
		root.render(element);
	});
	return {
		container,
		unmount: () => {
			act(() => root.unmount());
			container.remove();
		},
	};
}

/** Resolve pending promises/effects inside act(). */
export async function flush(times = 3) {
	for (let i = 0; i < times; i++) {
		// eslint-disable-next-line no-await-in-loop
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
}

export function click(el) {
	act(() => {
		el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
	});
}

/** Set a controlled <textarea>/<input> value so React's onChange fires. */
export function typeInto(el, value) {
	const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
	const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
	act(() => {
		setter.call(el, value);
		el.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

export function submit(form) {
	act(() => {
		form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
	});
}

export function findButtonByText(container, text) {
	return Array.from(container.querySelectorAll("button")).find((b) => b.textContent.includes(text));
}

/** A promise whose resolution the test controls. */
export function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
