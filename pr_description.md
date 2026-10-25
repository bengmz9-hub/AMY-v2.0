🎯 **What:** This PR adds the missing tests for the complex `useAmyFrameSequence` hook. It introduces `vitest`, `jsdom`, and `@testing-library/react` to test browser-dependent canvas and fetching logic.

📊 **Coverage:** The tests now comprehensively cover:
- Hook initialization and early exits when disabled.
- Frame fetching and caching logic.
- Drawing frames onto the canvas considering the `canDraw` condition.
- Error handling strategies when APIs like `createImageBitmap` are missing or when fetch calls fail.
- Memory leak prevention via correctly verifying fetch aborts and bitmap closures on component unmount.
- Requesting specific frames via the `requestFrame` export.

✨ **Result:** Improved confidence when making future changes to the frame sequence loading and caching logic, ensuring we avoid memory leaks and maintain expected frame delivery.
