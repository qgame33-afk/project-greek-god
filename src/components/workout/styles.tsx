// Keyframes for the live workout. Only transform, opacity and stroke-dashoffset animate.
// Rendered with React 19's <style precedence>, so it is hoisted into <head> once and
// de-duplicated however many components include it.

const CSS = `
@keyframes wk-sheen{from{transform:translateX(-120%)}to{transform:translateX(220%)}}
@keyframes wk-pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes wk-check{from{transform:scale(.9)}to{transform:scale(1)}}
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
.wk-check{animation:wk-check 240ms var(--ease-pop) 1 both}
.wk-blink{animation:wk-blink 1200ms var(--ease-out) 1 both}
.wk-flash{animation:wk-blink 360ms var(--ease-out) 1 both}
.wk-glow{animation:wk-blink 500ms var(--ease-out) 1 both}
.wk-up{animation:wk-up 320ms var(--ease-sheet) 1 both}
.wk-fade{animation:wk-fade 160ms var(--ease-out) 1 both}
.wk-rise{animation:wk-rise 420ms var(--ease-gold) 1 both}
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
