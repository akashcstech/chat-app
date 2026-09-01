// Augment express-session's SessionData so TypeScript knows about our custom
// session fields. The file is picked up automatically because it lives under
// src/ which is included in tsconfig.json.
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}
