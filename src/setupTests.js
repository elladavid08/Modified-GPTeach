// Jest setup (auto-loaded by react-scripts). Test-only.
// Application code logs very verbosely; silence non-error console output unless TEST_VERBOSE=1.
// console.error is kept so React warnings and unexpected errors stay visible.
global.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 11 lacks Element.scrollTo (used by Messages.jsx auto-scroll).
if (!Element.prototype.scrollTo) {
	Element.prototype.scrollTo = function scrollTo() {};
}

if (!process.env.TEST_VERBOSE) {
	for (const method of ["log", "info", "debug", "warn"]) {
		jest.spyOn(console, method).mockImplementation(() => {});
	}
}
