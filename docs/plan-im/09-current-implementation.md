# IM Current Implementation Notes

This file records the current IM behavior after the lightweight storage decision. Older planning docs may still describe the original cloud-history design; this note is the source of truth for the implemented behavior.

## Storage Policy

- The server stores users, authentication data, friend relationships, and only undelivered offline messages.
- The server does not store long-term chat history.
- `direct_messages` on the server is now an offline delivery queue, not a history table.
- After `sys.offline_msgs` is pushed to the recipient, those queue rows are deleted.
- All long-term message history belongs in the user's local SQLite database.

## Message Flow

- Online recipient: `msg.send` returns `msg.ack`, then the server pushes `msg.new` directly to the recipient. No server history row is kept.
- Offline recipient: `msg.send` returns `msg.ack`, then the message is inserted into the server offline queue.
- Recipient login: server pushes `sys.offline_msgs`, then removes those rows from the queue.
- `msg.history` is kept as a compatibility endpoint and returns an empty `messages` array after validating access.
- `msg.read` returns `msg.read_ack`; it does not push read notifications in the first implementation.

## Client Local Cache

- The Electron main process persists IM login state, friends, friend requests, conversations, and messages in the local app SQLite database.
- Sending while offline is allowed when a local logged-in user exists.
- Offline outgoing messages are stored locally as `pending`.
- After reconnect and token authentication, pending outgoing messages are flushed in creation order.
- If the app starts while the IM server is unavailable, the local user remains logged in locally so cached conversations and offline sending continue to work.
- If token authentication fails with an explicit auth error such as `TOKEN_INVALID`, the local login record is cleared and the UI returns to login.

## Reliability Limits

- The server currently deletes offline queue rows after pushing `sys.offline_msgs`, before receiving a client-side disk-write acknowledgement.
- This keeps the server lightweight but means a crash during local caching can lose the just-delivered offline display.
- If stronger delivery guarantees are needed later, add a `msg.delivered_ack` protocol and delete server queue rows only after that ack.

## Verification

- Local and remote smoke tests must assert that `msg.history_result.messages` is an empty array.
- After offline delivery smoke tests, the server `direct_messages` table should return count `0`.
- Restart/offline-start tests should verify that cached local conversations remain visible without a reachable IM server.
