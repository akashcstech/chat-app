import sanitizeHtml from 'sanitize-html';

/**
 * Strips all HTML/JS from user-supplied message content. Messages are
 * plain text only — we disallow every tag and attribute, neutralizing
 * <script>, event handlers, javascript: URLs, etc.
 */
export function sanitizeMessageContent(raw: string): string {
  const stripped = sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
  return stripped.trim();
}
