# Windows development and build environment

This guide targets Windows 11 x64 and the GitHub Actions `windows-2022` runner.

## Requirements

- Git for Windows
- Node.js 22 (the repository requires Node >=22.12.0)
- Python 3.11 for native Node module builds
- Visual Studio 2022 Build Tools with **Desktop development with C++** (MSVC v143 and Windows 10/11 SDK)
- PowerShell 7 is recommended
- An internet connection to install npm dependencies and Electron headers

## Clone and build

Open PowerShell:

```powershell
git clone https://github.com/jtekelenburg/FreeShow-mod.git
cd FreeShow-mod
git switch feature/media-reliability
node --version
npm --version
npm ci
npm run test:unit
npm run build:electron:dev
npm run build
```

The repository's `postinstall` script invokes `electron-builder install-app-deps` to rebuild native modules for Electron.

For interactive development, run:

```powershell
npm start
```

## GitHub Actions

The workflow `.github/workflows/windows-build.yml` runs on Windows Server 2022 with Node 22 x64 and Python 3.11. It installs dependencies, runs unit tests, compiles Electron TypeScript, builds the application, and uploads compiled files.

Use **Actions → Windows build verification → Run workflow** to start it manually, or push to the feature branch.

## Native integrations

NDI and Blackmagic DeckLink depend on native libraries and compatible hardware/drivers. Successful TypeScript compilation does not establish that NDI output or DeckLink playback works. Test those separately on a Windows machine with the relevant SDK runtime, drivers and devices.

## Packaging and signing

The normal `npm run build` produces application build assets; it does not produce an installer. The repository's production electron-builder configuration includes Azure Trusted Signing settings tied to the original publisher. Do not assume those credentials are available in this fork. Configure your own signing identity and packaging workflow before publishing Windows installers.

## Troubleshooting

- If `npm ci` fails on a native module, confirm Python, MSVC v143 and Windows SDK installation; rerun in a fresh terminal.
- If `node-gyp` cannot find Visual Studio, install the **Desktop development with C++** workload and restart the shell.
- If `npm ci` fails with a lockfile error, inspect `package-lock.json` and the matching Node/npm versions; do not automatically regenerate the lockfile.
- Check the **Actions** job logs for exact compilation and native dependency errors.
