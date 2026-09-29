/**
 * Classes for <option>s inside the compact pill-style <select>s (judge
 * assignment, registration status). The open list is drawn by the browser;
 * without an explicit background and text colour, some browsers (Chrome on
 * Windows in particular) show the pill's light dark-mode text on a white
 * list, making the names unreadable. Also resets the pill's tiny uppercase
 * label styling so the choices themselves are easy to read.
 */
export const PILL_OPTION_CLASS =
  "bg-ignite-surface text-ignite-ink font-ui text-[13px] font-medium normal-case tracking-normal";
