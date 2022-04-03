const BigNumber = require('bignumber.js');
const { MultiCall } = require('eth-multicall');
const { telosWeb3: web3, multicallAddress } = require('../../../utils/web3');
import { getFarmWithTradingFeesApy } from '../../../utils/getFarmWithTradingFeesApy';

const ZenMaster = require('../../../abis/telos/ZenMaster.json');
const ERC20 = require('../../../abis/ERC20.json');
const fetchPrice = require('../../../utils/fetchPrice');
const pools = require('../../../data/telos/omnidexLpPools.json');
const { BASE_HPY, TELOS_CHAIN_ID } = require('../../../constants');
import { OMNIDEX_LPF } from '../../../constants';

const { compound } = require('../../../utils/compound');

const zenmaster = '0x79f5A8BD0d6a00A41EA62cdA426CEf0115117a61';
const oracleId = 'CHARM';
const oracle = 'tokens';
const DECIMALS = '1e18';
const secondsPerBlock = 0.5;
const secondsPerYear = 31536000;

const liquidityProviderFee = OMNIDEX_LPF;
const yieldHubPerformanceFee = 0.045;
const shareAfterYieldHubPerformanceFee = 1 - yieldHubPerformanceFee;

const getOmnidexLpApys = async () => {
  let apys = {};
  let apyBreakdowns = {};

  const tokenPrice = await fetchPrice({ oracle, id: oracleId });
  const { rewardPerSecond, totalAllocPoint } = await getZenMasterData();
  const { balances, allocPoints } = await getPoolsData(pools);
  const pairAddresses = pools.map(pool => pool.address);

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];

    const lpPrice = await fetchPrice({ oracle: 'lps', id: pool.name });
    const totalStakedInUsd = balances[i].times(lpPrice).dividedBy(pool.decimals);
    const poolBlockRewards = rewardPerSecond.times(allocPoints[i]).dividedBy(totalAllocPoint);
    const yearlyRewards = poolBlockRewards.dividedBy(secondsPerBlock).times(secondsPerYear);
    const yearlyRewardsInUsd = yearlyRewards.times(tokenPrice).dividedBy(DECIMALS);
    const simpleApy = yearlyRewardsInUsd.dividedBy(totalStakedInUsd);
    const vaultApr = simpleApy.times(shareAfterYieldHubPerformanceFee);
    const vaultApy = compound(simpleApy, BASE_HPY, 1, shareAfterYieldHubPerformanceFee);
    const tradingApr = new BigNumber(0);
    const totalApy = getFarmWithTradingFeesApy(
      simpleApy,
      tradingApr,
      BASE_HPY,
      1,
      shareAfterYieldHubPerformanceFee
    );

    // Create reference for legacy /apy
    const legacyApyValue = { [pool.name]: totalApy };

    apys = { ...apys, ...legacyApyValue };

    // Create reference for breakdown /apy
    const componentValues = {
      [pool.name]: {
        vaultApr: vaultApr.toNumber(),
        compoundingsPerYear: BASE_HPY,
        yieldHubPerformanceFee: yieldHubPerformanceFee,
        vaultApy: vaultApy,
        lpFee: liquidityProviderFee,
        tradingApr: tradingApr.toNumber(),
        totalApy: totalApy,
      },
    };

    apyBreakdowns = { ...apyBreakdowns, ...componentValues };
  }

  // Return both objects for later parsing
  return {
    apys,
    apyBreakdowns,
  };
};

const getZenMasterData = async () => {
  const zenMasterContract = new web3.eth.Contract(ZenMaster, zenmaster);
  const rewardPerSecond = new BigNumber(await zenMasterContract.methods.charmPerBlock().call());
  const totalAllocPoint = new BigNumber(await zenMasterContract.methods.totalAllocPoint().call());
  return { rewardPerSecond, totalAllocPoint };
};

const getPoolsData = async pools => {
  const zenMasterContract = new web3.eth.Contract(ZenMaster, zenmaster);
  const multicall = new MultiCall(web3, multicallAddress(TELOS_CHAIN_ID));
  const balanceCalls = [];
  const allocPointCalls = [];

  pools.forEach(pool => {
    const tokenContract = new web3.eth.Contract(ERC20, pool.address);
    balanceCalls.push({
      balance: tokenContract.methods.balanceOf(zenmaster),
    });
    allocPointCalls.push({
      allocPoint: zenMasterContract.methods.poolInfo(pool.poolId),
    });
  });

  const res = await multicall.all([balanceCalls, allocPointCalls]);

  const balances = res[0].map(v => new BigNumber(v.balance));
  const allocPoints = res[1].map(v => v.allocPoint['1']);
  return { balances, allocPoints };
};

module.exports = getOmnidexLpApys;