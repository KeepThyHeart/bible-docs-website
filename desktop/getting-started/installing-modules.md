---
sidebar_position: 3
title: Installing Modules
---

# Installing Modules

Modules are things like Bible translations, commentaries, books, topical indexes, or sets of cross-references.  When you first start the app, it will suggest starter sets depending on your language (right now, only English is supported).  You can install more using the Module Manager.

## Opening the Module Manager

Go to *File → Module Manager*, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and type "module manager". The dialog has two tabs: *Available* lists modules you can install, and *Installed* lists modules you have.

![The Module Manager open on the Available tab](/img/desktop/modules-manager-available.png)

## Installing a module

1. Open the *Available* tab. The app fetches the catalog from `{{moduleRepositoryUrl}}`.
2. Filter the list by type (Bibles, commentaries, dictionaries, books) with the buttons above it, or search by name.
3. Click *Install*. You can pause, resume, or cancel the download while it runs.

Installed modules are available immediately, without a restart. New translations appear in the Bible pane's translation dropdown, and new commentaries appear as tabs in the study pane.

<!-- shot: modules-download-progress — A module downloading, with its progress indicator -->

## Installing from a file

To install a module file you already have, choose *Install from File* and select the `.db` file.

## Managing installed modules

From the *Installed* tab you can:

- Uninstall a module. This removes the module's content, but not your notes or highlights, which are in a separate database.
- Check for updates and install newer versions.
- Rebuild a module's search index. Do this if search results from that module are incomplete or out of date.

![The Installed tab, listing modules with their Uninstall and update controls](/img/desktop/modules-installed-tab.png)

## Where modules are stored

Modules are files in the application's data directory. You can back them up like any other file, or reinstall them from the repository.

Your notes, highlights, and sessions are stored separately from modules, so uninstalling or updating a module does not affect them. See [Backup & Restore](../user-guide/backup-and-restore.md).

## Repositories

The app is configured with one official repository by default. To add another, open the repository settings in the Module Manager and add its URL.

:::note
The official module repository is not live yet. Until it is, use *Install from File* to add modules you have obtained separately.
:::

## Troubleshooting

**The list of available modules is empty or won't load.** The app can't reach the repository. Check your internet connection and the repository URL in the repository settings.

**A module installed but doesn't appear.** Restart the app. If it still doesn't appear, check the *Installed* tab to confirm the installation completed.

**Search doesn't find text you know is there.** Rebuild that module's search index from the *Installed* tab.

**Study mode shows no interlinear data.** Interlinear data comes from a separate module. Install an interlinear module and make sure it is enabled. See [Study Tools](../user-guide/study-tools.md).
