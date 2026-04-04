// ─── Electronic Wallet (Portefeuille électronique) ───────────────────────────
import { syncDoc } from './firestore-sync'

function wKey(userId) { return `lib_wallet_${userId}` }

function saveWallet(userId, wallet) {
  localStorage.setItem(wKey(userId), JSON.stringify(wallet))
  // Fire-and-forget Firestore sync
  syncDoc(`wallets/${userId}`, wallet)
}

export function getWallet(userId) {
  if (!userId) return { balance: 0, transactions: [] }
  try {
    return JSON.parse(localStorage.getItem(wKey(userId)) || 'null') || { balance: 0, transactions: [] }
  } catch { return { balance: 0, transactions: [] } }
}

export function getBalance(userId) {
  return getWallet(userId).balance
}

export function addFunds(userId, amount, description = 'Rechargement') {
  if (!userId || amount <= 0) return null
  const wallet = getWallet(userId)
  wallet.balance = Math.round((wallet.balance + amount) * 100) / 100
  wallet.transactions = [
    { id: Date.now().toString(), type: 'credit', amount, description, date: new Date().toISOString() },
    ...(wallet.transactions || []).slice(0, 99),
  ]
  saveWallet(userId, wallet)
  return wallet
}

// Returns the updated wallet on success, false if insufficient funds
export function deductFunds(userId, amount, description = 'Paiement') {
  if (!userId) return false
  const wallet = getWallet(userId)
  if (wallet.balance < amount) return false
  wallet.balance = Math.round((wallet.balance - amount) * 100) / 100
  wallet.transactions = [
    { id: Date.now().toString(), type: 'debit', amount, description, date: new Date().toISOString() },
    ...(wallet.transactions || []).slice(0, 99),
  ]
  saveWallet(userId, wallet)
  return wallet
}

export function refundFunds(userId, amount, description = 'Remboursement') {
  return addFunds(userId, amount, description)
}
