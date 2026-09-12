---
sidebar_position: 9
title: Backup & Restore
---

# Backup & Restore

Your notes, highlights, and other data exist only on your computer.  You can back them up to avoid losing them.

## What is included

A backup contains what you have created:

- Verse notes, documents, journal entries, and prayer lists
- Highlights and underlines
- Bookmarks
- Your own cross-references
- Sessions and layout

It does not include the modules themselves (which you can re-install from the Module Manager if you switch computers, for example).

## Creating a backup

There is no automatic backup, but here's how to do it manually:

1. Go to *File → Export My Notes*.
2. Enter a password (optional).  This can be useful if you want to protect personal notes, like journal entries, for example.
3. Choose where to save the file.

![The backup dialog, asking for the password that will encrypt the file](/img/desktop/backup-dialog.png)

:::warning
The password cannot be recovered. Without it, the backup cannot be opened.
:::

It's a good idea to keep a backup on a separate computer than your main one, or in cloud storage online.

## Restoring

1. Open *File → Export My Notes* and choose the restore option.
2. Select the backup file and enter its password. The dialog shows the backup's details.
3. Choose a restore mode:
   - **Merge** adds the backup's contents to your current data. Nothing is deleted. Use this to move to a new computer, recover deleted items, or combine data from two computers.
   - **Replace All** deletes all current data and replaces it with the backup.

![The restore dialog, showing the Merge and Replace All choice](/img/desktop/restore-dialog.png)

:::danger
Replace All permanently deletes your current notes and highlights. Make a separate, new backup before using Replace All, just in case.
:::

## Moving to a new computer

1. On the old computer, use *File → Export My Notes* to save a backup somewhere you can reach from the new one.
2. Install {{productName}} on the new computer.
3. Reinstall your modules from *File → Module Manager*.
4. Restore the backup in Merge mode.

Modules are not in the backup, so the file is small.

## Where your data lives

Your data is stored in a database in the application's data directory, separate from modules. Updating or uninstalling a module does not affect it.
