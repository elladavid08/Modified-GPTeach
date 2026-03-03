/**
 * System Version Configuration
 * 
 * Update this version number when making significant changes to the system:
 * - Major changes to AI prompts (student behavior, PCK analysis)
 * - UI/UX changes that affect user interaction
 * - New features or functionality
 * - Bug fixes that change behavior
 * 
 * Version Format: X.Y.Z
 * - X: Major version (breaking changes, major new features)
 * - Y: Minor version (new features, significant improvements)
 * - Z: Patch version (bug fixes, minor improvements)
 */

export const SYSTEM_VERSION = "1.0.0";

/**
 * Version History:
 * 
 * 1.0.0 (2026-03-03):
 * - Initial production version with Firebase authentication
 * - User profile collection (Hebrew fields)
 * - Automatic conversation logging to Firestore
 * - Improved student agent behavior:
 *   - Better detection of incomplete teacher messages
 *   - Multi-part instruction compliance (persona-based initial, full on second request)
 *   - Consistent knowledge tracking throughout conversation
 *   - Better handling of teacher refocus
 * - Two-agent architecture (PCK feedback agent + student agent)
 * - Protected routes requiring authentication
 */
