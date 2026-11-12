// One shared WebGL support check. Probing creates a real GL context; Chrome keeps only ~16
// alive and drops the oldest (the visible 3D view went blank), so probe once and release it.
let available = null;
export function webglAvailable() {
  if (available !== null) return available;
  try {
    const context = window.WebGLRenderingContext && (document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'));
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    available = Boolean(context);
  } catch {
    available = false;
  }
  return available;
}
