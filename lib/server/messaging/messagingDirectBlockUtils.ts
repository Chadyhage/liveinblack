export function findOtherParticipantId(participantIds: string[], callerId: string): string | null {
  return participantIds.find((participantId) => participantId !== callerId) ?? null
}

export function hasBlockedEitherWay(
  blockedUserIdsByUserId: ReadonlyMap<string, string[]>,
  callerId: string,
  otherId: string,
): boolean {
  return (blockedUserIdsByUserId.get(callerId) || []).includes(otherId)
    || (blockedUserIdsByUserId.get(otherId) || []).includes(callerId)
}

export function toBlockedUserIdsMap(
  users: Array<{ _id: unknown; blockedUserIds?: string[] | null }>,
): Map<string, string[]> {
  return new Map(users.map((user) => [String(user._id), user.blockedUserIds ?? []] as const))
}
