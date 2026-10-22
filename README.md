# Open Dot Matrix

A desktop studio for iDotMatrix 64 × 64 RGB LED panels. Prepare images, animations, and text; control built-in panel modes; and send content over Bluetooth Low Energy.

## Features

| Tool | What it does |
| --- | --- |
| **Image** | Fit, fill, or stretch a raster image to 64 × 64; set the background, rotate it 180°, or use pixelated scaling. Includes a calibration pattern. |
| **GIF** | Resize and re-encode animated GIFs for the panel, with framing, background, rotation, and pixelated scaling controls. Supports files up to 50 MB and sends up to 64 frames. |
| **Text** | Render a message locally and send it with one of nine motion modes, adjustable speed, solid or rainbow color, and a configurable background. |
| **Weather** | Turn current weather into an animated panel scene. Choose a location, °C or °F, and a Scene, Bold, Glyph, Phosphor, Dots, or Gauge style; optionally show the city and daily high/low. Weather and location search use [Open-Meteo](https://open-meteo.com/) and require no API key. |
| **Modes** | Set a solid color, one of eight clock faces, a countdown, stopwatch, scoreboard, screen timeout, or time indicator. These are built-in panel modes. |
| **Display controls** | Adjust brightness, power the panel on or off, flip it, or sync its clock. |

The Weather tool can send an update on demand or on a 5, 10, 15, 30, or 60 minute schedule. It can reconnect to the last selected panel and keep running in the system tray. Launch at sign-in is available in installed Windows and macOS builds.

### Weather style preview

![Animated preview of the six weather styles](docs/weather-previews/0-all-styles.gif)

Individual previews are in [`docs/weather-previews`](docs/weather-previews).

## Quick start

Install Node.js with npm, then run from the repository root:

```sh
cd app
npm ci
npm run dev
```

This starts the Electron desktop app in development mode. Select **Demo** to try the tools with a simulated panel, or choose **Connect panel** and select an iDotMatrix device from the Bluetooth picker.

## Use the studio

1. Choose a tool from the **Image**, **GIF**, **Text**, **Weather**, or **Modes** tabs.
2. Prepare the content and check its preview in the left panel.
3. Connect a display, then send the content or apply the selected built-in mode.

Weather needs an internet connection to search for a location and fetch current conditions. Enable automatic updates in the Weather tab to refresh and send on a schedule. With **Keep running in the tray** enabled, closing the window hides it and scheduled updates continue; use the tray menu to reopen the app, send an update now, or quit.

## Build and package

Run these commands from `app/`:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Type-check the Electron and renderer TypeScript projects. |
| `npm test` | Run the Vitest unit tests. |
| `npm run build` | Type-check and create the production app bundle. |
| `npm run dist:win` | Build a Windows NSIS installer. |
| `npm run dist:mac` | Build a macOS DMG. |
| `npm run dist:linux` | Build a Linux AppImage. |

The package targets are defined in `app/electron-builder.yml`; distribution commands write to `app/release/`.

## Project structure

- `app/src/main/` — Electron window, platform appearance, Bluetooth device selection, and tray behavior.
- `app/src/preload/` — limited bridge between the Electron main process and the UI.
- `app/src/renderer/` — React interface, panel tools, image/GIF/text rendering, weather scenes, and Bluetooth client.
- `app/src/shared/` — types shared by the main and renderer processes.
- `docs/weather-previews/` — exported animations for the Weather styles.

The desktop shell is Electron; the interface is React and TypeScript, built with Vite through `electron-vite`. The renderer converts image and text content locally and communicates with the panel over Bluetooth Low Energy. Weather data is fetched from Open-Meteo.
