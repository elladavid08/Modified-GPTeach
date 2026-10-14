/**
 * Undo history for the drawing board (1.5.0, pilot request #7).
 *
 * A stack of canvas states: the state after the last completed user action is on top, and the state
 * before it below. `commit` records the state after an action, `undo` drops the top and returns the
 * state to restore (null when there is nothing to undo). States are opaque here (the board stores
 * Fabric `canvas.toJSON()` objects). At most `limit` steps are kept; the oldest are dropped.
 */
export const MAX_UNDO_STEPS = 50;

export function createDrawingHistory(limit = MAX_UNDO_STEPS) {
	let states = [];
	return {
		reset(state) {
			states = [state];
		},
		commit(state) {
			states.push(state);
			if (states.length > limit + 1) {
				states.splice(0, states.length - (limit + 1));
			}
		},
		canUndo() {
			return states.length > 1;
		},
		undo() {
			if (states.length <= 1) {
				return null;
			}
			states.pop();
			return states[states.length - 1];
		},
	};
}
