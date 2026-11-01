/**
 * Eager math registration: fills the renderer slot in `./math` with KaTeX at
 * module evaluation, before any component renders.
 *
 * The annotate entry (`src/annotate/App.tsx`) imports this module for its
 * side effect, which keeps math typeset on the first commit. Without it, math
 * shows the TeX source for one frame, then the typeset markup once the chunk
 * lands.
 */
import katex from 'katex';
import { setMathRenderer } from './math';

setMathRenderer(katex);
