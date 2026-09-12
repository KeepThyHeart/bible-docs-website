---
sidebar_position: 1
title: Installation
---

# Installation

{{productName}} runs on Windows, Mac, and Linux. Download the installer for your platform from the [downloads page]({{downloadsUrl}}).

| Platform | Download | Notes |
| --- | --- | --- |
| **Windows** | `.exe` installer | 64-bit (x64). Installs per-user; no administrator rights needed. |
| **macOS** | `.dmg` disk image | Drag to Applications. |
| **Linux** | `.deb` package or `.AppImage` | `.deb` for Debian, Ubuntu, and distributions based on them. The AppImage runs on any distribution without installation. |

> [TODO: real download links, checksums, and minimum system requirements go here once the first release ships.]

## Windows

Run the downloaded `.exe`. The installer lets you choose the installation directory and creates desktop and Start Menu shortcuts.

The installer is not yet code-signed, so Windows SmartScreen may warn that the publisher is unrecognized. Choose *More info*, then *Run anyway*.

<!-- shot: installation-windows-installer — The Windows installer on its directory selection step -->

## macOS

Open the `.dmg` and drag the app to your Applications folder.

The app is not yet notarized, so Gatekeeper blocks it the first time. Right-click the app, choose *Open*, and confirm. This is only needed once.

## Linux

There are two downloads for Linux: a `.deb` package and an AppImage.

### Debian, Ubuntu, and derivatives (.deb)

Install the package with `apt`, so that its dependencies are installed too:

```bash
sudo apt install ./<downloaded-file>.deb
```

<!-- TODO: replace <downloaded-file> with the real artifact name once a .deb has been built. -->

The app is installed under `/opt` and appears in your applications menu.

### Any distribution (AppImage)

Make the AppImage executable and run it:

```bash
chmod +x "{{productName}}"-*.AppImage
./"{{productName}}"-*.AppImage
```

The AppImage is self-contained. There is no installation step.

## First launch

The app opens to John 3 initially. See [Quick Start](./quick-start.md) for a tour of the window, and [Installing Modules](./installing-modules.md) to add commentaries, dictionaries, and translations.

## Updating

There is no automatic updater yet. To update, download the latest installer and run it over your existing installation. On Linux, install the new `.deb` with the same `apt install` command, or replace the old AppImage with the new one. Your notes and highlights are stored separately from the application and should not be affected. You may want to [back them up](../user-guide/backup-and-restore.md) before upgrading.

## Uninstalling

To uninstall this Bible app:

- **Windows:** uninstall from Settings → Apps, or run the uninstaller in the installation directory.
- **macOS:** drag the app from Applications to the Trash.
- **Linux (.deb):** remove the package with `apt` or your software manager.
- **Linux (AppImage):** delete the AppImage.

<!-- TODO: add the exact `sudo apt remove <package>` command once a .deb build confirms the package name. electron-builder derives it from the product name because the npm name (@bible/desktop) is scoped. -->

Uninstalling does not remove your notes and highlights. To remove them, you can delete the application data directory (varies by operating system). To keep a copy, [export them](../user-guide/backup-and-restore.md) first.

## Need help?

Report a problem on the [issue tracker]({{issuesUrl}}), or email {{supportEmail}}.
