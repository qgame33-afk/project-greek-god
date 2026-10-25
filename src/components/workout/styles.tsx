// Keyframes for the live workout. Only transform, opacity and stroke-dashoffset animate.
// Rendered with React 19's <style precedence>, so it is hoisted into <head> once and
// de-duplicated however many components include it.

const CSS = `
@keyframes wk-ring{from{stroke-dashoffset:0}to{stroke-dashoffset:var(--wk-c)}}
@keyframes wk-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.wk-ring-arc{animation:wk-ring var(--wk-dur) linear var(--wk-delay) 1 both}
.wk-rise{animation:wk-rise 220ms var(--ease-out) 1 both}
@media (prefers-reduced-motion:reduce){
  /* the rest ring carries information, so it keeps draining */
  .wk-ring-arc{animation-duration:var(--wk-dur)!important}
}
`;

export function WorkoutStyles() {
  return (
    <style href="pgg-workout-css" precedence="medium">
      {CSS}
    </style>
  );
}

/**
 * Toasts are top-centre app-wide, but in the workout that is where ⌄ and Finish live — a "Set 2
 * logged · Undo" toast would sit on Finish. While a workout screen is mounted, toasts drop just
 * below its top bar (--gym-toast-top, measured by the live screen). A plain (non-hoisted) <style>,
 * so it disappears with the screen.
 */
export function ToastsBelowTopBar() {
  return (
    <style>{`[data-sonner-toaster][data-y-position="top"]{--offset-top:var(--gym-toast-top, calc(var(--safe-top) + 64px))!important;--mobile-offset-top:var(--gym-toast-top, calc(var(--safe-top) + 64px))!important}`}</style>
  );
}
