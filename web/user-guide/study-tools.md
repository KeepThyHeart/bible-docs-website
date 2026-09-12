---
sidebar_position: 2
title: Study Tools
---

# Study Tools

The study panel beside the Bible text shows material for the selected verse and updates as you move through the text.

## The study panel

On a desktop, the panel is on the right side of the window, with these tabs:

| Tab | What it holds |
| --- | --- |
| **Study** | Cross-references, topics, a combined commentary summary, and interlinear words — all for the selected verse |
| **Commentary** | Full commentary entries, one tab per commentary |
| **Topics** | The topical-index browser, searchable by name |
| **Dictionary** | Dictionary and Strong's entries |

- Drag the divider between the Bible and the panel to resize it.
- Click the › at the right of the tab row to collapse the panel.
- A Search tab appears when a search is open.

On a phone, the same material is on separate screens reached from the bottom navigation bar. See [Using on Your Phone](./mobile.md).

Everything below follows the selected verse. Click a verse in the reading area to change it.

## The Study tab

The Study tab contains collapsible sections: cross-references, topics, the combined commentary summary, and interlinear (Hebrew/Greek words, if provided by the translation). All sections start collapsed. Click a heading to expand it; it stays expanded as you navigate.

The thumbtack at the top pins the tab to the verse it is showing, so it no longer follows your reading. While it is pinned, a banner shows the pinned verse and a *Sync to* button that moves it to your current passage. Click the thumbtack again to unpin.

### Cross-references

Cross-references show verses that are related to the current selected one. They come from the Treasury of Scripture Knowledge. Each entry shows a reference and a snippet of the verse.

- Click an entry to go to it.
- Hover over an entry to preview it.
- *Show Verses* expands the full text of all entries.

![The Cross-References section showing related verses for a passage](/img/web/study-tools-cross-references.png)

### Topics

This section lists the topical index entries, such as those from Nave's Topical Bible, that include the selected verse. Click one to open it in the Topics tab.

If the site has entity data enabled, entities also appear: the people, places, themes, and objects the verse mentions. Topics group verses by subject; entities group them by who or what they mention.

![The Topics section listing topical entries for a verse](/img/web/study-tools-topics-section.png)

### Commentary Combined Summary

This is a single summary generated from a set of many public-domain commentaries.  It contains a notice that computers sometimes make mistakes in summarizing, and that commentaries sometimes have false doctrines.  However, I have tried to set up the summarization scripting to minimize these issues as much as I could.  To turn the summary off, use the *Modules* tab in Settings; see [Personalizing Your Experience](./personalizing.md#modules).

### Interlinear

The original Greek or Hebrew of the verse, word by word, with Strong's numbers. This is the same data that [Study display mode](./bible-reading.md#display-modes) shows inline with the English.

## The Commentary tab

A commentary is a set of verse-by-verse notes on the Bible, often written by a pastor or Bible scholar, or sometimes by a group of people.  Several commentaries can be open at once, and they follow the selected verse.

### The overview tab

The first tab in the row, marked with a house icon, is the overview. It lists every commentary with an entry for the selected verse, with a preview and word count for each. Click an entry to expand it in place.

- Filter the list by name.
- Sort by A–Z, longest first, shortest first, random, or the default order.
- The star on a row keeps that commentary at the top of the list.
- An expanded entry has *Mute*, which hides that commentary, and *Add to tabs*, which opens it in its own tab.

![The Commentary overview tab listing several commentaries for one verse](/img/web/study-tools-commentary-home.png)

### Reading one commentary

*Add to tabs* opens a commentary in its own tab next to the overview. Drag tabs to reorder them. If the commentary has no entry for the current verse, *Previous verse* and *Next verse* buttons jump to the nearest verse it covers.

![A single commentary entry open in its own tab](/img/web/study-tools-commentary-entry.png)

### Pinning a commentary

Each commentary tab has a thumbtack that pins it to a passage, as in the Study tab. For example, you can keep Barnes on Romans 8:28 while following the cross-references it mentions. A pinned tab shows a thumbtack indicator and a *Sync to* button. Each tab is pinned independently.

![The commentary tab bar with a pinned tab showing its thumbtack indicator](/img/web/study-tools-commentary-pinned-tab.png)

### References inside commentary text

Bible references in commentary text ("compare John 3:16", "see Rom 8:28") are automatically converted into Bible links.

- Click a reference to move the Bible panel to that verse.
- Hover over it to preview the verse.
- <kbd>Ctrl</kbd>+click (<kbd>Cmd</kbd>+click) it to open the verse in a new Bible tab.

![Hovering a Bible reference inside commentary text, showing the verse preview](/img/web/study-tools-verse-preview-tooltip.png)

## The Topics tab

The Topics tab is the full topic browser.

**From a verse.** Clicking a topic in the Study tab opens it here, with every verse the topic includes and its place in the hierarchy.

**Searching by name.** The search box at the top finds topics by name, such as *prayer* or *mercy*.

**Hierarchy and breadcrumbs.** Topics can have sub-topics; for example, "Faith" has sub-topics beneath it. A breadcrumb trail at the top of each entry shows where you are. Click any part of it to move up. Sub-topics can be filtered and sorted A–Z. Long verse lists load in batches.

![A topic entry with breadcrumb navigation, sub-topics, and its verse list](/img/web/study-tools-topic-detail.png)

**Entities.** If the site has entity data enabled, this tab also shows cards for people, places, themes, and objects. A card shows a short profile, the topical entries that mention it, related entities, and the verses it appears in. All of these are links.

<!-- shot: study-tools-entity-detail — An entity card for a person, showing related entities and verses -->

## Dictionary and Strong's numbers

Strong's numbers give each Greek and Hebrew word in the Bible a unique identifier. Greek numbers start with G (`G25`); Hebrew numbers start with H (`H7225`).

### Seeing the original words

Strong's numbers appear in Study display mode (see [Reading the Bible](./bible-reading.md#display-modes)) and in the interlinear section of the Study tab. Each English word is shown with its original word, a transliteration, and the Strong's number. If a translation has no interlinear data, the app shows a message.

![Study display mode with interlinear words and Strong's numbers beneath the English](/img/web/study-tools-study-mode-interlinear.png)

### Tooltip and full entry

Hover over a Strong's number to see a tooltip with the word, its transliteration, and a short definition.

![The Strong's tooltip shown on hover](/img/web/study-tools-strongs-tooltip.png)

Click the number to open the full entry: part of speech, the longer definition, etymology, and more. On a desktop, it opens in the Dictionary tab of the study panel. On a phone, it opens as a popup over the text.

### Word families and finding every occurrence

Related Greek and Hebrew words share a root. For example, G25 (*agapao*, to love), G26 (*agape*, love), and G27 (*agapetos*, beloved) belong to one family.

The full entry has a *Search all occurrences* button that finds every verse using the word. The results show the word family as pills; click one to switch words. The *Include related words* toggle searches the whole family at once. Typing a Strong's number into the search bar gives the same results. See [Searching](./search.md#strongs-number-search).

![Strong's search results with the word header and family pills](/img/web/study-tools-strongs-search-results.png)
