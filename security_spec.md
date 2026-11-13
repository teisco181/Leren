# StudyFlow Firestore Security Specification

## Data Invariants
1. **Strict Tenant Isolation (`users/{userId}/...`)**: No user (authenticated or anonymous) may read, list, create, update, or delete any document under `users/{otherUserId}/...`.
2. **Guest / Anonymous Isolation**: Anonymous users (`sign_in_provider == 'anonymous'`) are strictly restricted to joining active `gameRooms/{roomCode}` lobbies and updating their own `players/{uid}` score entry. They can never access `users/{userId}` or create `gameRooms`.
3. **No Room Enumeration**: `gameRooms` denies `list` queries so users cannot scrape active 6-digit room codes. Only `get` with the exact 6-digit `roomCode` is permitted.
4. **Host-Only Room Control & Terminal State Locking**: Only `hostId == request.auth.uid` can advance `status` or `currentQuestionIndex` on `gameRooms/{roomCode}`, and once `status == 'finished'`, no further updates are allowed.
5. **Server Timestamp & Strict Key Integrity**: Every document uses `request.time` for `createdAt` and `updatedAt`, enforces `keys().hasAll(...) && keys().hasOnly(...)`, validates IDs via `isValidId()`, and validates string/list size limits.

## Dirty Dozen Adversarial Payloads (All Must Fail with PERMISSION_DENIED)
1. Cross-user folder read (`GET /users/victimUid/folders/f1` as `attackerUid`)
2. Anonymous guest accessing user items (`LIST /users/victimUid/items` as anonymous auth)
3. Identity spoofing on folder create (`CREATE /users/victimUid/folders/f1` with `ownerId: attackerUid`)
4. Shadow field injection on task create (`CREATE /users/uid/scheduleTasks/t1` with extra `isAdmin: true`)
5. Oversized ID poisoning (`CREATE /users/uid/items/<1500-char-id>`)
6. Client-forged timestamp (`CREATE /users/uid/folders/f1` with `createdAt` != `request.time`)
7. Immutable ownerId mutation (`UPDATE /users/uid/items/i1` changing `ownerId`)
8. Room scraping (`LIST /gameRooms`)
9. Anonymous guest hosting a room (`CREATE /gameRooms/123456` as anonymous auth)
10. Non-host advancing game question (`UPDATE /gameRooms/123456` as player, not hostId)
11. Mutating a finished game room (`UPDATE /gameRooms/123456` when `existing.status == 'finished'`)
12. Spoofing another player's score (`UPDATE /gameRooms/123456/players/victimUid` as `attackerUid`)
