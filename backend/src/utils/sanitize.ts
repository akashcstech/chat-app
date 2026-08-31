import sanitizeHtml from 'sanitize-html';

/**
 * Strips all HTML/JS from user-supplied message content. Messages are
 * plain text only for the MVP, so we disallow every tag and attribute —
 * this neutralizes <script>, event handlers, javascript: URLs, etc.
 */
export function sanitizeMessageContent(raw: string): string {
  const stripped = sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
  return stripped.trim();
}

/** Basic normalization for identifiers used in queries/log lines. */
export function sanitizeSingleLine(raw: string): string {
  return raw.replace(/[\r\n]/g, ' ').trim();
}
