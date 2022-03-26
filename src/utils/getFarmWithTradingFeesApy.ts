import { compound } from './compound';

export const getFarmWithTradingFeesApy = (
  farmApr,
  tradingApr: number | undefined,
  compoundingsPerYear,
  t,
  shareAfterYieldHubPerformanceFee
) => {
  const farmApy = farmApr
    ? compound(farmApr, compoundingsPerYear, t, shareAfterYieldHubPerformanceFee)
    : 0;
  const finalAPY = (1 + farmApy) * (1 + Number(tradingApr || 0)) - 1;
  return finalAPY;
};
