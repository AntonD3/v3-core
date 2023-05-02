import { Wallet } from 'ethers'
import { MockTimeUniswapV3Pool } from '../typechain/MockTimeUniswapV3Pool'
import { expect } from './shared/expect'

import { getWallets } from './shared/zkSyncUtils'
import { poolFixture } from './shared/zkSyncFixtures'
import snapshotGasCost from './shared/snapshotGasCost'

import {
  expandTo18Decimals,
  FeeAmount,
  getMinTick,
  encodePriceSqrt,
  TICK_SPACINGS,
  createPoolFunctions,
  SwapFunction,
  MintFunction,
  getMaxTick,
  MaxUint128,
  SwapToPriceFunction,
  MAX_SQRT_RATIO,
  MIN_SQRT_RATIO,
} from './shared/utilities'


describe('UniswapV3Pool gas tests', () => {
  const [wallet, other] = getWallets()

  for (const feeProtocol of [0, 6]) {
    describe(feeProtocol > 0 ? 'fee is on' : 'fee is off', () => {
      const startingPrice = encodePriceSqrt(100001, 100000)
      const startingTick = 0
      const feeAmount = FeeAmount.MEDIUM
      const tickSpacing = TICK_SPACINGS[feeAmount]
      const minTick = getMinTick(tickSpacing)
      const maxTick = getMaxTick(tickSpacing)

      const gasTestFixture = async ([wallet]: Wallet[]) => {
        const fix = await poolFixture()

        const pool = await fix.createPool(feeAmount, tickSpacing)

        const { swapExact0For1, swapToHigherPrice, mint, swapToLowerPrice } = await createPoolFunctions({
          swapTarget: fix.swapTargetCallee,
          token0: fix.token0,
          token1: fix.token1,
          pool,
        })

        await (await pool.initialize(encodePriceSqrt(1, 1))).wait()
        await (await pool.setFeeProtocol(feeProtocol, feeProtocol)).wait()
        await (await pool.increaseObservationCardinalityNext(4)).wait()
        await (await pool.advanceTime(1)).wait()
        await (await mint(wallet.address, minTick, maxTick, expandTo18Decimals(2))).wait()

        await (await swapExact0For1(expandTo18Decimals(1), wallet.address)).wait()
        await (await pool.advanceTime(1)).wait()
        await (await swapToHigherPrice(startingPrice, wallet.address)).wait()
        await (await pool.advanceTime(1)).wait()
        expect((await pool.slot0()).tick).to.eq(startingTick)
        expect((await pool.slot0()).sqrtPriceX96).to.eq(startingPrice)

        return { pool, swapExact0For1, mint, swapToHigherPrice, swapToLowerPrice }
      }

      let swapExact0For1: SwapFunction
      let swapToHigherPrice: SwapToPriceFunction
      let swapToLowerPrice: SwapToPriceFunction
      let pool: MockTimeUniswapV3Pool
      let mint: MintFunction

      beforeEach('load the fixture', async () => {
        ;({ swapExact0For1, pool, mint, swapToHigherPrice, swapToLowerPrice } = await gasTestFixture([wallet]))
      })

      describe('#swapExact0For1', () => {
        it('first swap in block with no tick movement', async () => {
          await snapshotGasCost(swapExact0For1(2000, wallet.address))
          expect((await pool.slot0()).sqrtPriceX96).to.not.eq(startingPrice)
          expect((await pool.slot0()).tick).to.eq(startingTick)
        })

        it('first swap in block moves tick, no initialized crossings', async () => {
          await snapshotGasCost(swapExact0For1(expandTo18Decimals(1).div(10000), wallet.address))
          expect((await pool.slot0()).tick).to.eq(startingTick - 1)
        })

        it('second swap in block with no tick movement', async () => {
          await (await swapExact0For1(expandTo18Decimals(1).div(10000), wallet.address)).wait()
          expect((await pool.slot0()).tick).to.eq(startingTick - 1)
          await snapshotGasCost(swapExact0For1(2000, wallet.address))
          expect((await pool.slot0()).tick).to.eq(startingTick - 1)
        })

        it('second swap in block moves tick, no initialized crossings', async () => {
          await (await swapExact0For1(1000, wallet.address)).wait()
          expect((await pool.slot0()).tick).to.eq(startingTick)
          await snapshotGasCost(swapExact0For1(expandTo18Decimals(1).div(10000), wallet.address))
          expect((await pool.slot0()).tick).to.eq(startingTick - 1)
        })

        it('first swap in block, large swap, no initialized crossings', async () => {
          await snapshotGasCost(swapExact0For1(expandTo18Decimals(10), wallet.address))
          expect((await pool.slot0()).tick).to.eq(-35787)
        })

        it('first swap in block, large swap crossing several initialized ticks', async () => {
          await (await mint(wallet.address, startingTick - 3 * tickSpacing, startingTick - tickSpacing, expandTo18Decimals(1))).wait()
          await mint(
            wallet.address,
            startingTick - 4 * tickSpacing,
            startingTick - 2 * tickSpacing,
            expandTo18Decimals(1)
          )
          expect((await pool.slot0()).tick).to.eq(startingTick)
          await snapshotGasCost(swapExact0For1(expandTo18Decimals(1), wallet.address))
          expect((await pool.slot0()).tick).to.be.lt(startingTick - 4 * tickSpacing) // we crossed the last tick
        })

        it('first swap in block, large swap crossing a single initialized tick', async () => {
          await (await mint(wallet.address, minTick, startingTick - 2 * tickSpacing, expandTo18Decimals(1))).wait()
          await snapshotGasCost(swapExact0For1(expandTo18Decimals(1), wallet.address))
          expect((await pool.slot0()).tick).to.be.lt(startingTick - 2 * tickSpacing) // we crossed the last tick
        })

        it('second swap in block, large swap crossing several initialized ticks', async () => {
          await (await mint(wallet.address, startingTick - 3 * tickSpacing, startingTick - tickSpacing, expandTo18Decimals(1))).wait()
          await mint(
            wallet.address,
            startingTick - 4 * tickSpacing,
            startingTick - 2 * tickSpacing,
            expandTo18Decimals(1)
          )
          await (await swapExact0For1(expandTo18Decimals(1).div(10000), wallet.address)).wait()
          await snapshotGasCost(swapExact0For1(expandTo18Decimals(1), wallet.address))
          expect((await pool.slot0()).tick).to.be.lt(startingTick - 4 * tickSpacing)
        })

        it('second swap in block, large swap crossing a single initialized tick', async () => {
          await (await mint(wallet.address, minTick, startingTick - 2 * tickSpacing, expandTo18Decimals(1))).wait()
          await (await swapExact0For1(expandTo18Decimals(1).div(10000), wallet.address)).wait()
          expect((await pool.slot0()).tick).to.be.gt(startingTick - 2 * tickSpacing) // we didn't cross the initialized tick
          await snapshotGasCost(swapExact0For1(expandTo18Decimals(1), wallet.address))
          expect((await pool.slot0()).tick).to.be.lt(startingTick - 2 * tickSpacing) // we crossed the last tick
        })

        it('large swap crossing several initialized ticks after some time passes', async () => {
          await (await mint(wallet.address, startingTick - 3 * tickSpacing, startingTick - tickSpacing, expandTo18Decimals(1))).wait()
          await mint(
            wallet.address,
            startingTick - 4 * tickSpacing,
            startingTick - 2 * tickSpacing,
            expandTo18Decimals(1)
          )
          await (await swapExact0For1(2, wallet.address)).wait()
          await (await pool.advanceTime(1)).wait()
          await snapshotGasCost(swapExact0For1(expandTo18Decimals(1), wallet.address))
          expect((await pool.slot0()).tick).to.be.lt(startingTick - 4 * tickSpacing)
        })

        it('large swap crossing several initialized ticks second time after some time passes', async () => {
          await (await mint(wallet.address, startingTick - 3 * tickSpacing, startingTick - tickSpacing, expandTo18Decimals(1))).wait()
          await mint(
            wallet.address,
            startingTick - 4 * tickSpacing,
            startingTick - 2 * tickSpacing,
            expandTo18Decimals(1)
          )
          await (await swapExact0For1(expandTo18Decimals(1), wallet.address)).wait()
          await (await swapToHigherPrice(startingPrice, wallet.address)).wait()
          await (await pool.advanceTime(1)).wait()
          await snapshotGasCost(swapExact0For1(expandTo18Decimals(1), wallet.address))
          expect((await pool.slot0()).tick).to.be.lt(tickSpacing * -4)
        })
      })

      describe('#mint', () => {
        for (const { description, tickLower, tickUpper } of [
          {
            description: 'around current price',
            tickLower: startingTick - tickSpacing,
            tickUpper: startingTick + tickSpacing,
          },
          {
            description: 'below current price',
            tickLower: startingTick - 2 * tickSpacing,
            tickUpper: startingTick - tickSpacing,
          },
          {
            description: 'above current price',
            tickLower: startingTick + tickSpacing,
            tickUpper: startingTick + 2 * tickSpacing,
          },
        ]) {
          describe(description, () => {
            it('new position mint first in range', async () => {
              await snapshotGasCost(mint(wallet.address, tickLower, tickUpper, expandTo18Decimals(1)))
            })
            it('add to position existing', async () => {
              await (await mint(wallet.address, tickLower, tickUpper, expandTo18Decimals(1))).wait()
              await snapshotGasCost(mint(wallet.address, tickLower, tickUpper, expandTo18Decimals(1)))
            })
            it('second position in same range', async () => {
              await (await mint(wallet.address, tickLower, tickUpper, expandTo18Decimals(1))).wait()
              await snapshotGasCost(mint(other.address, tickLower, tickUpper, expandTo18Decimals(1)))
            })
            it('add to position after some time passes', async () => {
              await (await mint(wallet.address, tickLower, tickUpper, expandTo18Decimals(1))).wait()
              await (await pool.advanceTime(1)).wait()
              await snapshotGasCost(mint(wallet.address, tickLower, tickUpper, expandTo18Decimals(1)))
            })
          })
        }
      })

      describe('#burn', () => {
        for (const { description, tickLower, tickUpper } of [
          {
            description: 'around current price',
            tickLower: startingTick - tickSpacing,
            tickUpper: startingTick + tickSpacing,
          },
          {
            description: 'below current price',
            tickLower: startingTick - 2 * tickSpacing,
            tickUpper: startingTick - tickSpacing,
          },
          {
            description: 'above current price',
            tickLower: startingTick + tickSpacing,
            tickUpper: startingTick + 2 * tickSpacing,
          },
        ]) {
          describe(description, () => {
            const liquidityAmount = expandTo18Decimals(1)
            beforeEach('mint a position', async () => {
              await (await mint(wallet.address, tickLower, tickUpper, liquidityAmount)).wait()
            })

            it('burn when only position using ticks', async () => {
              await snapshotGasCost(pool.burn(tickLower, tickUpper, expandTo18Decimals(1)))
            })
            it('partial position burn', async () => {
              await snapshotGasCost(pool.burn(tickLower, tickUpper, expandTo18Decimals(1).div(2)))
            })
            it('entire position burn but other positions are using the ticks', async () => {
              await (await mint(other.address, tickLower, tickUpper, expandTo18Decimals(1))).wait()
              await snapshotGasCost(pool.burn(tickLower, tickUpper, expandTo18Decimals(1)))
            })
            it('burn entire position after some time passes', async () => {
              await (await pool.advanceTime(1)).wait()
              await snapshotGasCost(pool.burn(tickLower, tickUpper, expandTo18Decimals(1)))
            })
          })
        }
      })

      describe('#poke', () => {
        const tickLower = startingTick - tickSpacing
        const tickUpper = startingTick + tickSpacing

        it('best case', async () => {
          await (await mint(wallet.address, tickLower, tickUpper, expandTo18Decimals(1))).wait()
          await swapExact0For1(expandTo18Decimals(1).div(100), wallet.address)
          await (await pool.burn(tickLower, tickUpper, 0)).wait()
          await swapExact0For1(expandTo18Decimals(1).div(100), wallet.address)
          await snapshotGasCost(pool.burn(tickLower, tickUpper, 0))
        })
      })

      describe('#collect', () => {
        const tickLower = startingTick - tickSpacing
        const tickUpper = startingTick + tickSpacing

        it('close to worst case', async () => {
          await (await mint(wallet.address, tickLower, tickUpper, expandTo18Decimals(1))).wait()
          await (await swapExact0For1(expandTo18Decimals(1).div(100), wallet.address)).wait()
          await (await pool.burn(tickLower, tickUpper, 0)).wait() // poke to accumulate fees
          await snapshotGasCost(pool.collect(wallet.address, tickLower, tickUpper, MaxUint128, MaxUint128))
        })
      })

      describe('#increaseObservationCardinalityNext', () => {
        it('grow by 1 slot', async () => {
          await snapshotGasCost(pool.increaseObservationCardinalityNext(5))
        })
        it('no op', async () => {
          await snapshotGasCost(pool.increaseObservationCardinalityNext(3))
        })
      })

      describe('#snapshotCumulativesInside', () => {
        it('tick inside', async () => {
          await snapshotGasCost(pool.estimateGas.snapshotCumulativesInside(minTick, maxTick))
        })
        it('tick above', async () => {
          await (await swapToHigherPrice(MAX_SQRT_RATIO.sub(1), wallet.address)).wait()
          await snapshotGasCost(pool.estimateGas.snapshotCumulativesInside(minTick, maxTick))
        })
        it('tick below', async () => {
          await (await swapToLowerPrice(MIN_SQRT_RATIO.add(1), wallet.address)).wait()
          await snapshotGasCost(pool.estimateGas.snapshotCumulativesInside(minTick, maxTick))
        })
      })
    })
  }
})
