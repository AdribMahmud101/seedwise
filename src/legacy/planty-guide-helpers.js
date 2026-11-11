const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function placeBubble(target, bubble, viewport) {
  const margin = 12, gap = 16;
  const width = Math.min(bubble.width, viewport.width - margin * 2);
  const height = Math.min(bubble.height, viewport.height - margin * 2);
  let side = 'bottom', left, top;
  if (viewport.width <= 700) {
    left = (viewport.width - width) / 2;
    top = viewport.height - height - margin;
    // A fixed launcher can sit behind the bottom bubble; lift the bubble above it.
    if (target.top < top + height + gap && target.bottom > top - gap) {
      top = target.top - height - gap;
    }
  } else {
    side = target.right + gap + width <= viewport.width - margin ? 'right' : 'left';
    left = side === 'right' ? target.right + gap : target.left - width - gap;
    top = target.top + (target.height - height) / 2;
    if (left < margin) {
      side = target.bottom + gap + height <= viewport.height - margin ? 'bottom' : 'top';
      left = target.left + (target.width - width) / 2;
      top = side === 'bottom' ? target.bottom + gap : target.top - height - gap;
    }
  }
  return { left: clamp(left, margin, viewport.width - width - margin),
    top: clamp(top, margin, viewport.height - height - margin), width, height, side };
}

export function guideState(length, action = 'none') {
  return { index: 0, length, waiting: action !== 'none', done: length === 0 };
}

export function advanceGuide(state, event, actions = []) {
  if (state.done) return state;
  if (event === 'skip') return { ...state, done: true, waiting: false };
  if (event === 'next' && state.waiting) return state;
  if (event === 'action' && !state.waiting) return state;
  if (!['next', 'back', 'action', 'missing'].includes(event)) return state;
  const index = event === 'back' ? Math.max(0, state.index - 1) : state.index + 1;
  return { ...state, index, done: index >= state.length,
    waiting: index < state.length && (actions[index] ?? 'none') !== 'none' };
}

export function guideMotion(reduced) {
  return { behavior: reduced ? 'instant' : 'smooth', animate: !reduced };
}
