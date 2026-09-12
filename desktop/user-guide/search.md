---
sidebar_position: 3
title: Searching
---

# Searching

{{productName}} searches the Bible and can also search the text of your other modules (like commentaries).

## The search bar

<kbd>Ctrl</kbd>+<kbd>L</kbd> focuses the search bar. It has three uses:

- **Search.** Type a word or phrase. After three characters, matching verses appear as suggestions. Press <kbd>Enter</kbd> to open the full results in the study pane.
- **Navigate.** Type a reference (`John 3:16`, `Romans 8`, `Gen 1:1-5`) to go to it.
- **Run commands.** Type `/` to search commands by name. The command palette is also available with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> or <kbd>F1</kbd>.

With an empty query, the bar lists your recent searches and commands.

![The search bar with live suggestions under a partial query](/img/desktop/search-live-suggestions.png)

## Search results

Results open in the search results tab in the study pane.

- The header shows the number of matches and how long the search took.
- A distribution graph shows how matches are spread across the Old and New Testaments, charted by density.
- Each result shows the matching text with the search term highlighted. Click a result to go to that verse.
- Results from fuzzy matching are indicated as such.

![The Search Results pane, with the query, the match count, and the matching verses](/img/desktop/search-results-distribution.png)

## Advanced search

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>, or open advanced search from the search bar.

### Scope

| Scope | Searches |
| --- | --- |
| Current Module | The translation you're reading |
| All Open Modules | Everything currently open in the window |
| All Bible Translations | Every installed translation |
| All Modules | Translations and commentaries together |
| Specific Range | A defined range — OT, NT, Gospels, and so on |
| Search Within Last Results | Your previous results |

### Options

- Match case.
- Whole words only, so `love` does not match `beloved`.
- Include the surrounding verses with each result.
- Fall back to fuzzy matching when a query returns fewer than ten results.

![The Advanced Search dialog, showing its scope selector and options](/img/desktop/search-advanced-dialog.png)

## Ideas Search

Ideas Search matches meaning rather than exact words. For example, "a shepherd boy killed a giant with a sling" finds 1 Samuel 17, although the passage uses different wording.

When semantic search is available, a link in the search results header re-runs the query as a semantic search, and another link returns to the keyword results. If a keyword search finds nothing, the app shows semantic results automatically and says so.

<!-- shot: search-semantic-results — Semantic search results, with the toggle back to keyword search in the header -->

## Find in pane

<kbd>Ctrl</kbd>+<kbd>F</kbd> opens a find bar for the current pane. It works in any pane, including commentaries and notes.

- <kbd>Enter</kbd> and <kbd>Shift</kbd>+<kbd>Enter</kbd> go to the next and previous match.
- A toggle turns on match case.
- <kbd>Escape</kbd> closes the find bar.

## Strong's number searches

Search for a Strong's number (`G26`, `H430`) to find every verse where that original-language word occurs. See [Study Tools](./study-tools.md).

## Troubleshooting

If a module returns no results for text you know it contains, rebuild its search index from the *Installed* tab of the Module Manager.
