// One startup fence, polled without blocking the browser's main thread.
export function waitForGpu(renderer) {
  const gl = renderer.getContext();
  if (gl.isContextLost()) return Promise.reject(new Error('WebGL context lost during preparation.'));
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) return Promise.reject(new Error('Cannot fence startup rendering.'));
  gl.flush();
  const deadline = performance.now() + 15000;
  return new Promise((resolve, reject) => {
    const poll = () => {
      const status = gl.clientWaitSync(fence, 0, 0);
      if (gl.isContextLost() || status === gl.WAIT_FAILED) {
        gl.deleteSync(fence);
        reject(new Error('GPU preparation failed or timed out.'));
      } else if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
        gl.deleteSync(fence);
        resolve();
      } else if (performance.now() > deadline) {
        gl.deleteSync(fence);
        reject(new Error('GPU preparation timed out.'));
      } else setTimeout(poll, 16);
    };
    poll();
  });
}
