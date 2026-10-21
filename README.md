# Open Dot Matrix

Desktop studio for iDotMatrix 64×64 LED displays. The Electron, Vite, and React app lives in `app/`.

## Run

```powershell
cd app
npm install
npm run dev
```

## Build

```powershell
cd app
npm run build
```

## Platform appearance

The React UI and Bluetooth client are shared across Windows, macOS, and Linux, and the interface looks the same on all three. Its design takes inspiration from Nothing's industrial style, with flat black widgets, pill controls, mono labels and a few dot-matrix titles. It ships its own fonts: Geist for text, Geist Mono for labels, and Doto for dot-matrix figures, all under the SIL Open Font License. Only the window chrome differs by platform:

| Platform | Window integration |
| --- | --- |
| Windows | Integrated draggable title bar with native caption buttons |
| macOS | Native traffic-light controls, system application menu and Command shortcuts |
| Linux | Window-manager title bar and native menu bar |

The interface follows the system light/dark setting, which updates while the app is open. It uses its own lime accent, taken from the LED glow. Window controls, menus, and file pickers are native.

Zoom the interface with Ctrl+= and Ctrl+- (Cmd on macOS), and reset it with Ctrl+0. On macOS and Linux these are also in the View menu.

## Weather

The Weather tab shows live conditions for a city as an animated 64×64 pixel scene (sun, moon and stars, clouds, rain, snow, fog, or lightning) with the temperature, the day's high and low, and the city name. Weather data comes from [Open-Meteo](https://open-meteo.com/), which is free and needs no API key.

- Search for a city and pick it from the list. Choose °C or °F and which details to show.
- Pick a style. Animated previews of each style are in [docs/weather-previews](docs/weather-previews).

  | Style | Look |
  | --- | --- |
  | Scene | Full-colour animated sky |
  | Bold | Huge temperature with a shine sweeping across it |
  | Glyph | White line-art icons with lime accents |
  | Phosphor | Lime CRT glow with scanlines |
  | Dots | Lime dot matrix, one LED per dot |
  | Gauge | Lime dial that fills from today's low to high |
- Turn on **Update the panel automatically** and choose an interval from 5 minutes to 1 hour. Each update fetches fresh weather and sends the animation as a GIF.
- **Reconnect automatically** remembers the last panel you picked. If the Bluetooth link drops, or the app was restarted, the next update scans for that panel and reconnects without the picker.
- **Keep running in the tray** keeps updates going after the window is closed. Use the tray icon to reopen the window, push an update now, or quit.
- **Start when I sign in** (installed Windows and macOS builds) launches the app hidden in the tray so updates resume after a restart.

## Package for distribution

Run the matching command from `app/` on the target operating system:

| Build host | Command | Output |
| --- | --- | --- |
| Windows | `npm run dist:win` | NSIS installer |
| macOS | `npm run dist:mac` | DMG |
| Linux | `npm run dist:linux` | AppImage |

Packages are written to `app/release/`. Signing and notarization require the appropriate developer credentials. The macOS bundle includes a Bluetooth permission description. Each platform's installer, Bluetooth permissions, and display connection need to be checked on that platform; a Windows build does not validate macOS or Linux behavior.
