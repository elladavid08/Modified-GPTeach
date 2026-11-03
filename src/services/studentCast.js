/**
 * Student cast (B5).
 *
 * Every conversation draws its own cast: NUM_STUDENTS distinct personas, sampled uniformly at random (in random order)
 * from the full persona set. The cast is drawn once when the conversation (ChatSession) starts and stays fixed for
 * it; a new conversation draws again. The cast is recorded with the conversation (ConversationLog studentRefs).
 *
 * Before this, the cast was the first NUM_STUDENTS of a list shuffled once per page load (AppContext), so every
 * conversation in the same tab got the same three students.
 *
 * The carrier rule (misconceptionCarrier.js) relies on the cast order being random.
 */

/** NUM_STUDENTS distinct personas in random order; the input array is not modified. */
export function selectSessionCast(students, size, random = Math.random) {
	const pool = Array.isArray(students) ? students.slice() : [];
	const n = Math.min(size, pool.length);
	// Partial Fisher-Yates: positions 0..n-1 become a uniform random draw without replacement.
	for (let i = 0; i < n; i++) {
		const j = i + Math.floor(random() * (pool.length - i));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, n);
}
