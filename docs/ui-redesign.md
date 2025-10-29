# UI Redesign QA Checklist

Use the following manual checks before releasing UI changes to ensure the responsive layout, PWA shell, and offline experience remain healthy.

## Responsive layout smoke tests

### Desktop (≥1280px)
- Open the dashboard in a desktop browser window wider than 1280px.
- Confirm the sidebar remains sticky while scrolling the monitor list and that summary metric cards wrap cleanly.
- Trigger the “添加监控” modal and ensure focus is trapped inside the dialog and the overlay fills the viewport.
- Hover and keyboard-focus primary/secondary buttons to verify updated hover/focus states.

### Tablet landscape (~1024px)
- Using browser DevTools device emulation, switch to an iPad landscape profile.
- Check that the two-column layout collapses gracefully, sidebar and content areas maintain padding, and the metrics grid stays legible.
- Open the notification settings panel and validate toggle controls retain accessible touch targets.
- Scroll the page to confirm sticky headers and safe-area insets (iPad notch) render correctly.

### Mobile portrait (≤768px)
- Emulate a modern mobile device (e.g., Pixel 7) in portrait orientation.
- Verify the app shell stacks vertically with consistent spacing, and cards align edge-to-edge without horizontal scrolling.
- Submit the monitor form with missing fields to confirm validation messages remain visible and readable.
- Test keyboard navigation (Tab/Shift+Tab) to ensure focus outlines are present on all actionable elements.

## PWA install & theme validation
- In Chrome, open **Application → Manifest** and confirm no errors, the theme/background colors are `#2563eb` and `#f5f7fb`, and icons pass Lighthouse’s installability checks.
- Trigger the “安装应用” button (or browser prompt) to install to the desktop/home screen and verify the splash background and icon render with the refreshed palette.
- After install, reopen the app and confirm the browser UI adopts the light (`#2563eb`) or dark (`#0c1424`) theme color depending on the OS setting.

## Offline & service worker checks
- With DevTools **Network → Offline** enabled, hard refresh the app to ensure the shell loads using cached `/css/tokens.css`, `/css/base.css`, `/css/components.css`, and `/js/app.js`.
- Confirm the monitor list grid displays cached content (or loading skeleton) and no 404s appear in the console.
- Restore the connection and verify Network panel shows `from service worker` for precached assets during the first load, then falls back to live fetches.
- Toggle offline/online while observing the in-app status banner to ensure the offline message appears and dismisses as expected.

## Notifications & regression spot checks
- Re-request browser notification permission and send a test notification to validate the service worker handles the `SHOW_NOTIFICATION` message.
- Navigate between `/` and `/select` endpoints to confirm network-first routes gracefully fall back to cache when offline.
