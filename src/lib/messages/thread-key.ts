/**
 * A stable key for a fan<->creator conversation, matching Message.threadKey's
 * own schema comment. Sorting the two user ids means the key is the
 * same regardless of who's currently the sender — the same property
 * every future inbox/thread view will need to group messages by
 * conversation, not by direction. Nothing reads threadKey yet (this
 * project's minimal message-send has no inbox — see the social-feed
 * redesign plan), but writing it correctly now means a real thread
 * view built later doesn't need a backfill migration to make existing
 * rows groupable.
 */
export function threadKeyFor(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(":");
}
