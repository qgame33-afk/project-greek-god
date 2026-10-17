// Keyframes for the live workout. Only transform, opacity and stroke-dashoffset animate.
// Rendered with React 19's <style precedence>, so it is hoisted into <head> once and
// de-duplicated however many components include it.

const CSS = `
@keyframes wk-sheen{from{transform:translateX(-120%)}to{transform:translateX(220%)}}
@keyframes wk-pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes wk-check{from{transform:scale(.82)}to{transform:scale(1)}}
@keyframes wk-draw{to{stroke-dashoffset:0}}
@keyframes wk-burst{from{opacity:.7;transform:scale(1)}to{opacity:0;transform:scale(1.5)}}
@keyframes wk-ring{from{stroke-dashoffset:0}to{stroke-dashoffset:var(--wk-c)}}
@keyframes wk-meter{from{transform:translateX(0)}to{transform:translateX(-100%)}}
@keyframes wk-blink{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
@keyframes wk-up{from{transform:translateY(100%)}to{transform:none}}
@keyframes wk-fade{from{opacity:0}to{opacity:1}}
@keyframes wk-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.wk-ring-arc{animation:wk-ring var(--wk-dur) linear var(--wk-delay) 1 both}
.wk-meter{animation:wk-meter var(--wk-dur) linear var(--wk-delay) 1 both}
.wk-ring-arc[data-paused],.wk-meter[data-paused]{animation-play-state:paused}
.wk-sheen{animation:wk-sheen 700ms var(--ease-out) 1 both}
.wk-pop{animation:wk-pop 240ms var(--ease-pop) 1 both}
.wk-check{animation:wk-check 320ms var(--ease-bounce) 1 both}
.wk-check svg path{stroke-dasharray:24;stroke-dashoffset:24;animation:wk-draw 200ms var(--ease-out) 60ms 1 both}
.wk-check::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:0 0 0 2px var(--wk-burst,var(--success));animation:wk-burst 460ms var(--ease-out) 1 both}
.wk-blink{animation:wk-blink 1200ms var(--ease-out) 1 both}
.wk-flash{animation:wk-blink 360ms var(--ease-out) 1 both}
.wk-glow{animation:wk-blink 500ms var(--ease-out) 1 both}
.wk-up{animation:wk-up 320ms var(--ease-sheet) 1 both}
.wk-fade{animation:wk-fade 160ms var(--ease-out) 1 both}
.wk-rise{animation:wk-rise 220ms var(--ease-out) 1 both}
.wk-rise-late{animation:wk-rise 320ms var(--ease-out) 0ms 1 both}
.wk-sheen-late{animation:wk-sheen 900ms var(--ease-out) 1850ms 1 both}
@keyframes wk-edge{0%{opacity:0}35%{opacity:.35}100%{opacity:0}}
.wk-edge{animation:wk-edge 400ms var(--ease-out) 1 both}
::view-transition-group(session-title){animation-duration:220ms;animation-timing-function:var(--ease-out)}
.wk-ghost{text-decoration-line:underline;text-decoration-style:dotted;text-decoration-thickness:1.5px;text-underline-offset:4px;text-decoration-color:rgb(138 145 156/.8)}
@media (prefers-reduced-motion:reduce){
  /* the rest ring and meter carry information, so they keep draining */
  .wk-ring-arc,.wk-meter{animation-duration:var(--wk-dur)!important}
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
 * Toasts are top-centre app-wide, but on the workout's focus screens that is exactly where the
 * minimise chevron, Finish and the Inscription's ⋯ live — a "Set 2 logged · Undo" toast would sit
 * on Finish for six seconds after every set. While a workout screen is mounted, toasts drop just
 * below its top bar (over the frieze, --gym-toast-top), and below a record banner while one
 * shows. A plain (non-hoisted) <style>, so it disappears with the screen.
 */
export function ToastsBelowTopBar() {
  return (
    <style>{`[data-sonner-toaster][data-y-position="top"]{--offset-top:var(--gym-toast-top, calc(var(--safe-top) + 56px))!important;--mobile-offset-top:var(--gym-toast-top, calc(var(--safe-top) + 56px))!important}`}</style>
  );
}
