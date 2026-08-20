import type { ApiFetchLike } from './messagingData'
import type { BlockedUserView, MyReportView } from './types'

export async function lookupUserByEmail(apiFetch: ApiFetchLike, email: string) {
  return apiFetch<{ user: { id: string } }>(`/api/users/lookup?email=${encodeURIComponent(email)}`)
}

export async function sendFriendRequest(apiFetch: ApiFetchLike, toUserId: string) {
  return apiFetch<{ status: string }>('/api/friends/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUserId }),
  })
}

export async function actOnFriendRequest(
  apiFetch: ApiFetchLike,
  requestId: string,
  action: 'accept' | 'decline' | 'cancel'
) {
  return apiFetch(`/api/friends/requests/${requestId}/${action}`, { method: 'POST' })
}

export async function removeFriend(apiFetch: ApiFetchLike, friendUserId: string) {
  return apiFetch('/api/friends/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendUserId }),
  })
}

export async function blockUser(apiFetch: ApiFetchLike, targetUserId: string) {
  return apiFetch('/api/users/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })
}

export async function unblockUser(apiFetch: ApiFetchLike, targetUserId: string) {
  return apiFetch('/api/users/unblock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })
}

export async function listBlockedUsers(apiFetch: ApiFetchLike) {
  return apiFetch<{ blocked: BlockedUserView[] }>('/api/users/blocked')
}

export async function submitUserReport(apiFetch: ApiFetchLike, targetUserId: string, reason: string) {
  return apiFetch('/api/users/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId, reason }),
  })
}

export async function listMyReports(apiFetch: ApiFetchLike) {
  return apiFetch<{ reports: MyReportView[] }>('/api/users/report')
}
