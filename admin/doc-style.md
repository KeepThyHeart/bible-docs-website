Documentation Style
===================
How the user docs under `desktop/` and `web/` are written.

Text written by tools (including AI assistants) should be dry and factual. The maintainer adds any personality, commentary, or recommendations by hand.

Pages the maintainer has written or edited may break the tone rules below on purpose. Don't rewrite their personality or commentary to make them fit.

## Tone

For example, this is not the target register:

> Study tabs are one of the most powerful parts of the app. They seamlessly follow along as you read, so the commentary you need is always right where you'd expect it.

This is:

> The study tabs show content for the verse selected in the Bible pane. When you select a different verse, they update to match.


- Describe what the app does and how to use it. Nothing else.
- Second person ("you"), present tense, active voice. Contractions are fine.
- No opinions, study advice, or reasons a feature is good.
- No marketing words: *powerful*, *modern*, *clean*, *comfortable*, *seamless*, *genuinely*, *simply*, *just*.
- No rhetorical framing: "This is the part worth knowing", "That is the whole design", "exactly as you would expect", "much like reading a novel".
- Explain design rationale only when the reader needs it to use the feature (e.g., "Notes are stored separately from modules, so uninstalling a module does not delete them.").

## Length

- Say it once. Link to the page that covers a topic instead of restating it.
- Open a page with at most one sentence on what it covers, or none if the title is enough.
- Short paragraphs. Split long sentences joined by semicolons into a list or separate sentences.
- No "Tips", "Recommended settings", "How often", or similar advice sections.

## Accuracy

- State only what the app does. Don't guess at behavior, limits, or labels.
- Use the UI's exact labels. If the exact label is not known, describe the control instead of inventing a label.
- If something is not built or not decided yet, say so in a `:::note`, or leave an HTML comment for the maintainer.

## Formatting

- Headings: sentence case (`## Display modes`). Feature names keep their capitalization (`## Ideas Search`).
- UI labels (buttons, tabs, menu items, dialogs, settings): *italics*. Menu paths: *File → Module Manager*.
- Keys: `<kbd>Ctrl</kbd>+<kbd>C</kbd>`. Give the macOS equivalent where it differs, or once per page in a note.
- Text the reader types: `code`.
- Several options, modes, or settings, each with a description: a bulleted list or a table.
- Procedures: numbered steps.
- Admonitions (`:::note`, `:::warning`, `:::danger`) only for data loss, irreversible actions, or unfinished features.
- US spelling (color, center, recognize, behavior, license).

## Do not change

- **Frontmatter.** The `title` must not contain the product name.
- **`{{token}}` placeholders.** Never hardcode the product name, URLs, email address, or license name; use the tokens listed in the README under "Using the values".
- **Screenshots.** Keep `<!-- shot: name — description -->` placeholders and `![...](/img/...)` images. The capture scripts match on the shot name.
- **Anchors that other pages link to.** Changing a heading's words changes its anchor. Check first: `grep -rn '\.md#' desktop web`.
