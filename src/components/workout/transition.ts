/**
 * Lights Out (docs/DESIGN-V2.md §1.8.2): the view-transition name the session title carries.
 * Begin on Now or Train wraps its session title ("Push A") in
 *   <ViewTransition name={SESSION_TITLE_VT} default="none" share="auto">…</ViewTransition>
 * and Gym Mode's header carries the same name, so the title morphs into the header (≤ 240 ms,
 * the duration is set in workout/styles.tsx) while the deck is live from the first frame.
 */
export const SESSION_TITLE_VT = "session-title";
