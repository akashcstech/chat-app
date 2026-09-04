# Hard Message Cap & Frontend Locking

This plan outlines the steps to change the application's behavior from "automatically delete old messages" to "stop accepting new messages when the limit is reached."

## Open Questions

- **UI for Locked State**: When the send button is disabled, do you want a visual banner or text element right above the input box explicitly stating "Message limit reached — please export and reset to continue sending"? (The plan currently assumes we will show a red text warning near the input when locked).

## Proposed Changes

### Backend Updates

#### [MODIFY] [retention.ts](file:///c:/Users/AKASH%20S/Desktop/chat-app/backend/src/services/retention.ts)
- Remove `trimOldestMessages()` and all logic that deletes messages.
- Rename `recordMessageAndMaybeTrim` to `recordMessageCount` or similar. It will now *only* increment the counter and nothing else.

#### [MODIFY] [messages.controller.ts](file:///c:/Users/AKASH%20S/Desktop/chat-app/backend/src/controllers/messages.controller.ts)
- In the `sendMessage` endpoint, check the current message count against `env.maxMessages`.
- If the count is $\ge$ `env.maxMessages`, block the request and return a 403 Forbidden error (e.g., "Message limit reached. Please ask the administrator to export and reset the database.").

#### [MODIFY] [validation.ts](file:///c:/Users/AKASH%20S/Desktop/chat-app/backend/src/utils/validation.ts) (if applicable)
- Ensure any default pagination limits reflect the new preference (though the frontend passes the explicit limit, we will update any backend defaults if they exist).

### Frontend Updates

#### [MODIFY] [chat-store.ts](file:///c:/Users/AKASH%20S/Desktop/chat-app/frontend/src/lib/chat-store.ts)
- Add a new function `getStats()` to fetch the current message count and cap from `/api/admin/stats` (since we need this data to know if we should lock the UI, and currently only `DbCapacityBar` might be doing this). Note: The API is already available to all users.

#### [MODIFY] [useChat.ts](file:///c:/Users/AKASH%20S/Desktop/chat-app/frontend/src/hooks/useChat.ts)
- Change the pagination limit from 50 to 20 in the `bootstrap` load and `loadOlderMessages`.
- Introduce a new state `isCapReached` (boolean).
- Poll the stats API (or update it alongside messages/socket events) to flip `isCapReached` to true when `messageCount >= cap`.

#### [MODIFY] [MessageInput.tsx](file:///c:/Users/AKASH%20S/Desktop/chat-app/frontend/src/components/MessageInput.tsx)
- Accept `isCapReached` as a prop.
- Disable the input field and the send button when `isCapReached` is true.
- Render a warning message above or below the input if the cap is reached.

## Verification Plan

### Automated Tests
- Run backend tests (`npm test`). We will need to update `retention.test.ts` to expect *no* deletions and `messages.test.ts` to expect a 403 when the cap is reached.

### Manual Verification
- Temporarily lower the max messages limit (e.g., to 10) in the local `.env`.
- Send messages until the limit is reached.
- Verify the frontend disables the send button and shows a warning.
- Verify that old messages are *not* deleted.
- Run an export as User 2 and verify the database resets and the send button re-enables.
