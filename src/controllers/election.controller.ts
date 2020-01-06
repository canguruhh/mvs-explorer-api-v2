import { Request, Response } from 'express'
import * as mongoose from 'mongoose'
import { get } from 'superagent'
import { ResponseError, ResponseSuccess } from '../helpers/message.helper'
import { BlockSchema } from '../models/block.model'
import { OutputSchema } from '../models/output.model'
import { IElectionRewardExt } from '../interfaces/election.interfaces'

declare function emit(k, v)

const Output = mongoose.model('Output', OutputSchema)
const Block = mongoose.model('Block', BlockSchema)

export const REQUIRED_WALLET_VERSION = process.env.DNA_VOTE_REQUIRED_WALLET_VERSION || '0.8.5'

export const CURRENT_PERIOD = parseInt(process.env.DNA_VOTE_CURRENT_PERIOD, 10) || 0
export const REVOTE_ENABLED = process.env.DNA_REVOTE_ENABLED === 'true'
export const VOTE_ENABLED = process.env.DNA_VOTE_ENABLED === 'true'
export const VOTE_ENABLED_UNTIL = process.env.DNA_VOTE_ENABLED_UNTIL ? parseInt(process.env.DNA_VOTE_ENABLED_UNTIL, 10) : undefined

export const DNAVOTE_API_HOST = process.env.DNAVOTE_API_HOST || 'https://www.dnavote.com'
export const DNAVOTE_API_KEY = process.env.DNAVOTE_API_KEY || ''

export const INTERVAL_DNA_VOTE_ON_HOLD = (process.env.INTERVAL_DNA_VOTE_ON_HOLD) ? parseInt(process.env.INTERVAL_DNA_VOTE_ON_HOLD) : 0
export const INTERVAL_DNA_VOTE_EARLY_BIRD_START = (process.env.INTERVAL_DNA_VOTE_EARLY_BIRD_START) ? parseInt(process.env.INTERVAL_DNA_VOTE_EARLY_BIRD_START) : 3090000
export const INTERVAL_DNA_VOTE_EARLY_BIRD_END = (process.env.INTERVAL_DNA_VOTE_EARLY_BIRD_END) ? parseInt(process.env.INTERVAL_DNA_VOTE_EARLY_BIRD_END) : 3152000
export const INTERVAL_DNA_VOTE_EARLY_BIRD_LOCK_UNTIL = (process.env.INTERVAL_DNA_VOTE_EARLY_BIRD_LOCK_UNTIL) ? parseInt(process.env.INTERVAL_DNA_VOTE_EARLY_BIRD_LOCK_UNTIL) : 3220000

export class ElectionController {

  public getInfo(req: Request, res: Response) {

    get(DNAVOTE_API_HOST + '/api/dna-selection/v1/period/simple-info')
      .then((apiResponse) => apiResponse.body.data.periodSelections)
      .then((selections) => Promise.all(selections.map((selection) => selection.selectionName)))
      .then((candidates) => {
        return Block.find({
          orphan: 0,
        })
          .sort({
            number: -1,
          })
          .limit(1)
          .then((result) => {
            return [result[0].toObject().number, candidates]
          })
      })
      .then(([height, candidates]) => {
        res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=20')
        res.json(new ResponseSuccess({
          candidates: INTERVAL_DNA_VOTE_ON_HOLD ? [] : candidates,
          currentPeriod: CURRENT_PERIOD,
          height,
          lockUntil: INTERVAL_DNA_VOTE_EARLY_BIRD_LOCK_UNTIL,
          revoteEnabled: REVOTE_ENABLED,
          voteEnabled: VOTE_ENABLED,
          voteEndHeight: INTERVAL_DNA_VOTE_EARLY_BIRD_END,
          voteEndTime: VOTE_ENABLED_UNTIL,
          voteStartHeight: INTERVAL_DNA_VOTE_EARLY_BIRD_START,
          walletVersionSupport: REQUIRED_WALLET_VERSION,
        }))
      }).catch((err) => {
        console.error(err)
        res.status(400).json(new ResponseError('ERR_GET_CANDIDATES'))
      })
  }

  public getHeight() {
    Block.find({
      orphan: 0,
    })
      .sort({
        number: -1,
      })
      .limit(1)
      .then((result) => {
        return result[0].toObject().number
      }).catch((err) => {
        console.error(err)
      })
  }

  public getVotes(req: Request, res: Response) {

    const minVoteHeight = parseInt(req.query.minVoteHeight, 10)
    const maxVoteHeight = parseInt(req.query.maxVoteHeight, 10)
    const minUnlockHeight = parseInt(req.query.minUnlockHeight, 10)

    const type = req.query.type
    const asset = req.query.asset

    const query: any = {
      'attachment.symbol': asset,
      'height': {
        $gte: minVoteHeight,
        $lte: maxVoteHeight,
      },
      'vote.type': type,
    }
    if (minUnlockHeight) {
      query['vote.lockedUntil'] = { $gte: minUnlockHeight }
    }

    const voteFormat = {
      _id: 0,
      address: 1,
      attachment: 1,
      attenuation_model_param: 1,
      index: 1,
      tx: 1,
      height: 1,
      vote: 1,
    }

    Output.find(query, voteFormat)
      .sort({ height: 1 })
      .then((result) => Promise.all(result.map((output: any) => {
        return {
          address: output.address,
          asset: output.attachment.symbol,
          candidate: output.vote.get('candidate'),
          lockedAt: output.height,
          lockedUntil: output.vote.get('lockedUntil'),
          quantity: output.attachment.get('quantity'),
          tx: output.tx,
          revote: 1,
        }
      })))
      .then((result) => {
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
        res.json(new ResponseSuccess(result))
      }).catch((err) => {
        console.error(err)
        res.status(400).json(new ResponseError('ERR_GET_VOTES'))
      })
  }

  public getResult(req: Request, res: Response) {

    const minVoteHeight = parseInt(req.query.minVoteHeight, 10)
    const maxVoteHeight = parseInt(req.query.maxVoteHeight, 10)

    const minUnlockHeight = parseInt(req.query.minUnlockHeight, 10)
    const type = req.query.type
    const asset = req.query.asset

    const query: any = {
      'attachment.symbol': asset,
      'height': {
        $gte: minVoteHeight,
        $lte: maxVoteHeight,
      },
      'vote.type': type,
    }
    if (minUnlockHeight) {
      query['vote.lockedUntil'] = { $gte: minUnlockHeight }
    }

    const o: any = {}
    o.reduce = `function(key, values){ return Array.sum(values)}`
    o.map = function () { return emit(this.vote.candidate, this.attachment.quantity) }
    o.query = query
    o.out = { inline: 1 }

    Output.mapReduce(o)
      .then((mapResult) => {
        const result = {}

        mapResult.results.forEach((candidate) => {
          result[candidate._id] = candidate.value
        })
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
        res.json(new ResponseSuccess(result))
      }).catch((err) => {
        console.error(err)
        res.status(400).json(new ResponseError('ERR_GET_ELECTION_RESULTS'))
      })
  }

  public async getRewards(req: Request, res: Response) {

    try {
      if (req.query.txs === undefined) {
        throw Error('ERR_TXS_MISSING')
      }
      const trasactions: string[] = Array.isArray(req.query.txs) ? req.query.txs : [req.query.txs]

      const txidQuery = trasactions.reduce((query, txid) => {
        if (txid.length !== 64) {
          throw Error('ERR_INVALID_TXID')
        }
        return query + '&transId=' + txid
      }, '')

      const rewards: IElectionRewardExt[] = await get(`${DNAVOTE_API_HOST}/api/dna-selection/v1/period-vote/reward/transIds?apiKey=${DNAVOTE_API_KEY}${txidQuery}`)
        .then((apiResponse) => apiResponse.body.data)

      const response = rewards.map((reward) => ({
        amount: reward.voteCount,
        period: reward.lockPeriod,
        reward: reward.reward,
        txid: reward.transactionId,
      }))
      res.setHeader('Cache-Control', 'public, max-age=1200, s-maxage=1200')
      res.json(new ResponseSuccess(response))
    } catch (err) {
      switch (err.message) {
        case 'ERR_TXS_MISSING':
        case 'ERR_INVALID_TXID':
          return res.status(400).json(new ResponseError(err.message))
      }
      console.error(err)
      res.status(500).json(new ResponseError('ERR_GET_REWARDS'))
    }
  }

  public async getRevote(req: Request, res: Response) {

    const votesIntervals = [
      { start: 3085800, end: 2143806, revoteStart: 0, revoteEnd: 0 },
      { start: 3178006, end: 3227234, revoteStart: 0, revoteEnd: 0 },
      { start: 3227234, end: 3295551, revoteStart: 0, revoteEnd: 0 },
    ]

    try {
      if (req.query.tx === undefined) {
        throw Error('ERR_TX_MISSING')
      }
      const transaction: string = req.query.tx
      const type: string = 'supernode'

      if (transaction.length !== 64) {
        throw Error('ERR_INVALID_TXID')
      }

      const query: any = {
        'tx': transaction,
        'vote.type': type,
      }

      Output.findOne(query)
        .then((result) => {

          if (result === null) {
            throw Error('ERR_NOT_VOTE')
          }

          /*TO DO*/

          res.setHeader('Cache-Control', 'public, max-age=1200, s-maxage=1200')
          res.json(new ResponseSuccess(result))
        }).catch((err) => {
          switch (err.message) {
            case 'ERR_NOT_VOTE':
              return res.status(400).json(new ResponseError(err.message))
          }
          console.error(err)
          res.status(500).json(new ResponseError('ERR_GET_REVOTE'))
        })
    } catch (err) {
      switch (err.message) {
        case 'ERR_TX_MISSING':
        case 'ERR_INVALID_TXID':
          return res.status(400).json(new ResponseError(err.message))
      }
      console.error(err)
      res.status(500).json(new ResponseError('ERR_GET_REWARDS'))
    }

  }
}
