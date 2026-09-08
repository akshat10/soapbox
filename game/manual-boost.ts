export const MANUAL_BOOST = { duration: 2.4, rechargeSeconds: 8, catchupRechargeSeconds: 4.5 } as const;

/** Recharge uses real race progress; it never changes position or awards points. */
export function boostRechargeRate(progress: number, leaderProgress: number): number {
  const behind = Math.min(1, Math.max(0, leaderProgress - progress) / .025);
  return 1 / (MANUAL_BOOST.rechargeSeconds + (MANUAL_BOOST.catchupRechargeSeconds - MANUAL_BOOST.rechargeSeconds) * behind);
}
