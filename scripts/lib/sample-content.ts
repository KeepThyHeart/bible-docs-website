/**
 * Example content used in the documentation screenshots
 * =====================================================
 *
 * Every passage, query, note, and prayer request that a reader can *read* in a
 * screenshot is declared here and nowhere else. Both capture scripts —
 * `capture-screenshots.ts` for the web app and `capture-desktop-screenshots.ts`
 * for the Electron app — import from this file.
 *
 * The point is editorial control, not deduplication. The sample text is the
 * part of a screenshot a person is most likely to want changed ("use a
 * different verse", "that prayer list is odd", "search for something else"),
 * and hunting it down across two thousand lines of Playwright is the wrong way
 * to spend an afternoon. Change a value here, re-run the affected shots, and
 * every picture that shows it agrees.
 *
 * Both scripts take `--shot=<name>`, so a single picture can be re-taken after
 * an edit here without re-running the whole set.
 */

// ---------------------------------------------------------------------------
// Passages
// ---------------------------------------------------------------------------

/**
 * References as a reader would type them into the search bar.
 *
 * Psalm 23 is short, familiar, and fits a window without scrolling. John 3 is
 * the app's own default chapter. John 1 is the interlinear workhorse: its Greek
 * is present in every module we ship, so Study-mode shots do not depend on
 * which dictionary happens to be installed.
 */
export const PASSAGES = {
  psalm23: 'Psalm 23',
  john1: 'John 1',
  john3: 'John 3',
  firstSamuel17: '1 Samuel 17',
} as const;

/**
 * The same passages as chapter routes for the web app, which addresses a
 * chapter as `<module>/<book number>/<chapter>`.
 */
export const WEB_CHAPTERS = {
  psalm23: 'KJV/19/23',
  john1: 'KJV/43/1',
  john3: 'KJV/43/3',
  firstSamuel17: 'KJV/9/17',
} as const;

/** Verse ids: `book * 1e6 + chapter * 1e3 + verse`. */
export const VERSES = {
  psalm23_1: 19023001,
  john1_1: 43001001,
  john3_3: 43003003,
  john3_16: 43003016,
  firstSamuel17_45: 9017045,
} as const;

/** Verse *numbers* within the open chapter, which is how the desktop app addresses them. */
export const VERSE_NUMBERS = {
  /** John 3:3 — early enough in the chapter to stay on screen beside the study panes. */
  john3_3: 3,
  /** John 3:16. */
  john3_16: 16,
  /** Psalm 23:1, 2 and 4 — the verses the highlighting shot colours. */
  psalm23Highlights: [1, 2, 4],
} as const;

/** Bookmark text the shots type into the app. */
export const BOOKMARKS = {
  /**
   * A name that shows why naming exists: it survives the bookmark being
   * re-pointed at a later verse, which a reference-labelled one cannot.
   */
  namedBookmark: 'Where I am reading in John',
} as const;

// ---------------------------------------------------------------------------
// Searches
// ---------------------------------------------------------------------------

export const SEARCHES = {
  /** A single word, for the plain keyword-search shots. */
  keyword: 'shepherd',
  /** A phrase, for showing the search bar with something typed into it. */
  phrase: 'the good shepherd',
  /**
   * What the type-ahead shot types.
   *
   * It must be a *complete* word. An earlier version typed a truncated
   * "shepher" to show the suggestions arriving mid-word, and the desktop app
   * answered it with "No results found" — a picture of the feature failing,
   * captioned as a picture of the feature working.
   */
  typeAhead: 'shepherd',
  /** A word common enough to give the results distribution graph a real shape. */
  distribution: 'love',
  /** A natural-language question, for the Ideas (semantic) search shots. */
  ideas: 'a shepherd boy killed a giant with a sling',
} as const;

// ---------------------------------------------------------------------------
// Strong's numbers
// ---------------------------------------------------------------------------

export const STRONGS = {
  /**
   * The number whose definition the tooltip shot displays.
   *
   * G2316 is θεός, "God" — a noun whose gloss runs to about fifty characters.
   * The shot used to take whichever Strong's number came first in John 1:1,
   * which is G1722 (ἐν, "in"): a preposition, and prepositions carry the
   * longest and least illuminating entries in the lexicon — G1722's gloss alone
   * is 603 characters.
   *
   * It has to be a number the chapter actually tags. The interlinear's chips
   * come from `interlinear_word.strongs_number`, so a number that appears only
   * in a row's secondary `metadata.strongs` — G3056, λόγος, is one — is never
   * rendered and the shot silently falls back to the preposition.
   */
  featured: 'G2316',
  /**
   * The number the "search all occurrences" shots use. G25 is ἀγαπάω, "to
   * love", which has the word family — G25 / G26 / G27 — that shot is about.
   */
  wordFamily: 'G25',
} as const;

// ---------------------------------------------------------------------------
// User-written content
// ---------------------------------------------------------------------------

export const NOTES = {
  /**
   * The note in the getting-started walkthrough.
   *
   * A quotation rather than an invented remark: it shows the reader something
   * worth writing down, and it models what most people actually put in a verse
   * note. Augustine on John 3:16, in the received English rendering.
   */
  quickStart:
    'Augustine: "God loves each one of us as if there were only one of us to love."',
  /** The note in the notes-and-highlights page's worked example. */
  verseNote:
    'Chrysostom: "God gave His Son, not as a servant, but as a Son; and gave Him to those who hated Him."',
  /** Plain text for the formatting-toolbar shot, which styles whatever it finds. */
  formattingSample: 'Formatting sample: this sentence is about to be styled.',
} as const;

export const PRAYERS = {
  listName: 'Morning prayers',
  requests: [
    'For the church in Karachi',
    'Wisdom for the elders meeting',
    'Ruth’s recovery',
  ],
} as const;
