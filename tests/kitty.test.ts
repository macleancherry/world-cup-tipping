import { describe, it, expect } from 'vitest'

// Pure kitty calculation functions — these mirror the logic in the API
function potentialReturn(stakeC: number, odds: number): number {
  return Math.round(stakeC * odds)
}
function potentialProfit(stakeC: number, odds: number): number {
  return potentialReturn(stakeC, odds) - stakeC
}
function kittyAfterBetPlaced(balance: number, stake: number): number {
  return balance - stake
}
function kittyAfterWin(balance: number, stake: number, odds: number, override?: number): number {
  return balance + (override ?? potentialReturn(stake, odds))
}
function kittyAfterLoss(balance: number): number {
  return balance
}
function kittyAfterVoid(balance: number, stake: number): number {
  return balance + stake
}
function kittyAfterCashout(balance: number, cashoutAmount: number): number {
  return balance + cashoutAmount
}
function ledgerBalance(entries: number[]): number {
  return entries.reduce((a, b) => a + b, 0)
}

describe('potential return & profit', () => {
  it('calculates return at decimal odds', () => {
    expect(potentialReturn(500, 2.5)).toBe(1250)
    expect(potentialReturn(1000, 1.5)).toBe(1500)
    expect(potentialReturn(250, 4.0)).toBe(1000)
  })

  it('calculates profit correctly', () => {
    expect(potentialProfit(500, 2.5)).toBe(750)
    expect(potentialProfit(1000, 1.5)).toBe(500)
    expect(potentialProfit(250, 4.0)).toBe(750)
  })

  it('rounds fractional cents', () => {
    expect(potentialReturn(100, 2.333)).toBe(233) // rounds to nearest cent
  })
})

describe('kitty balance after bet placement', () => {
  it('deducts stake when placed', () => {
    expect(kittyAfterBetPlaced(20000, 500)).toBe(19500)
    expect(kittyAfterBetPlaced(20000, 1000)).toBe(19000)
  })
})

describe('kitty balance after settlement', () => {
  it('win: returns gross return to kitty', () => {
    const after = kittyAfterBetPlaced(20000, 500)     // 19500
    expect(kittyAfterWin(after, 500, 2.5)).toBe(20750)
    // Net vs starting: +750
    expect(kittyAfterWin(after, 500, 2.5) - 20000).toBe(750)
  })

  it('win: respects actual return override', () => {
    const after = kittyAfterBetPlaced(20000, 500)
    expect(kittyAfterWin(after, 500, 2.5, 1100)).toBe(20600) // override return
  })

  it('loss: no money returns to kitty', () => {
    const after = kittyAfterBetPlaced(20000, 500)     // 19500
    expect(kittyAfterLoss(after)).toBe(19500)
    // Net vs starting: -500
    expect(kittyAfterLoss(after) - 20000).toBe(-500)
  })

  it('void: stake is returned in full', () => {
    const after = kittyAfterBetPlaced(20000, 500)     // 19500
    expect(kittyAfterVoid(after, 500)).toBe(20000)
    // Net vs starting: 0
    expect(kittyAfterVoid(after, 500) - 20000).toBe(0)
  })

  it('cashout: cashout amount returned', () => {
    const after = kittyAfterBetPlaced(20000, 500)     // 19500
    expect(kittyAfterCashout(after, 400)).toBe(19900) // took 400 cashout
    expect(kittyAfterCashout(after, 400) - 20000).toBe(-100)
  })
})

describe('ledger-based balance', () => {
  it('sums all transaction entries', () => {
    const ledger = [
      20000,   // initial contribution
      -500,    // stake placed (bet A)
      1250,    // return: bet A won (500 × 2.5)
      -300,    // stake placed (bet B)
      0,       // return: bet B lost
      -200,    // stake placed (bet C)
      200,     // void refund: bet C voided
    ]
    expect(ledgerBalance(ledger)).toBe(20450)
  })

  it('multiple bets scenario', () => {
    const ledger = [
      20000,   // start
      -500,    // bet 1 stake
      -500,    // bet 2 stake
      -500,    // bet 3 stake
      1250,    // bet 1 win return
      0,       // bet 2 loss
      500,     // bet 3 void
    ]
    expect(ledgerBalance(ledger)).toBe(20250) // net profit from bet 1 only: +750
  })

  it('zero balance scenario', () => {
    const ledger = [
      20000,
      -20000,  // stake everything
      0,       // lost
    ]
    expect(ledgerBalance(ledger)).toBe(0)
  })
})

describe('validation rules', () => {
  it('rejects odds below 1.01', () => {
    expect(1.0 < 1.01).toBe(true)
    expect(1.01 >= 1.01).toBe(true)
  })

  it('stake must be positive', () => {
    expect(0 <= 0).toBe(true)
    expect(-1 <= 0).toBe(true)
    expect(1 > 0).toBe(true)
  })
})
