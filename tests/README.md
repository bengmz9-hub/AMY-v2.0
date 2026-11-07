# Browser regression checks

Use Node 22 or newer, the declared npm dependencies and an installed stable Google
Chrome. `playwright-core` launches the `chrome` channel; this suite does not
download a browser or install system packages.

```sh
npm ci
npm run build
npm run test:browser
```

The suite starts its own Vite preview at `http://127.0.0.1:4173/AMY-v2.0/`, tests
the existing build once, and stops only that child in `finally`. An occupied port
fails the run instead of reusing or stopping another server. Each scenario gets a
fresh browser context. JavaScript, console and HTTP errors fail normal scenarios;
only the explicit WebGL-disabled scenario permits the known WebGL startup errors.

Coverage includes cold Home, agents and setup fragments; menu navigation; glasses
and Escape focus restoration; five agents, all three archive tabs and abilities;
arrow-key/Tab selection preservation; native forward/reverse wheel navigation and
the nested scroll boundary; mobile/reduced-motion endpoints; independent cold/warm
fetch-policy checks; a body no-JavaScript presentation at 320px; and five reachable
social links in the WebGL fallback. Social links are activated with the keyboard
against local controlled responses, without opening the external services.

Optional environment variables:

| Variable | Effect |
| --- | --- |
| `AMY_TEST_BASE_URL` | Test an existing local or public URL, including its trailing slash and deployment prefix. No preview is spawned or stopped. |
| `AMY_BROWSER_EXECUTABLE_PATH` | Launch a particular installed Chrome executable instead of the `chrome` channel. |
| `AMY_TEST_PORT` | Change the strict preview port (default `4173`); ignored with `AMY_TEST_BASE_URL`. |
| `AMY_TEST_OUTPUT` | Opt in to `verification.json` and failure screenshots in this directory. Without it, the suite writes no reports or screenshots. |
| `AMY_TEST_SOFTWARE_WEBGL=1` | Use Chrome's CPU WebGL renderer in the isolated test browser, as CI does without a physical GPU. |

GitHub Actions builds once on PRs and main, then runs these checks using the
runner's installed Chrome. Deployment on main depends on successful verification
and uses that same build artifact. Verification has only `contents: read`; Pages
and OIDC write permissions belong to the deployment job. An active deployment is
not cancelled by a later run.

The mobile checks emulate a Chrome viewport and touch capability; the native
journey uses mouse wheel input. They do not certify physical touch devices,
Safari/Firefox, accessibility compliance, visual acceptance or sustained FPS.
The cache check verifies actual fetch options and reports resource timing; it
does not promise a cache hit from every HTTP server.
