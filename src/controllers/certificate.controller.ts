import { Request, Response } from 'express'
import * as mongoose from 'mongoose'
import { OutputSchema } from '../models/output.model'
import { ResponseError, ResponseSuccess } from './../helpers/message.helper'

const Output = mongoose.model('Output', OutputSchema)

export class CertificateController {

  public info(req: Request, res: Response) {
    Output.find({
      ['attachment.type']: 'asset-cert',
      orphaned_at: 0,
    })
      .count()
      .then((count: number) => {
        res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600')
        res.json(new ResponseSuccess({
          count,
        }))
      }).catch((err: Error) => {
        console.error(err)
        res.status(400).json(new ResponseError('ERR_INFO_CERT'))
      })
  }

  public getCertificates(req: Request, res: Response) {

    const sort_by = req.query.sort_by
    const last_known = req.query.last_known
    Output.find({
      ...(last_known && { _id: { $lt: last_known } }),
      ['attachment.type']: 'asset-cert',
      orphaned_at: 0,
    })
      .sort({
        ...(sort_by === 'symbol' && { ['attachment.symbol']: 1 }),
        ...(sort_by !== 'symbol' && { height: -1 }),
      })
      .limit(20)
      .then((result) => {
        if (last_known) {
          res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600')
        } else {
          res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
        }
        res.json(new ResponseSuccess(result))
      }).catch((err) => {
        console.error(err)
        res.status(400).json(new ResponseError('ERR_LIST_CERTIFICATES'))
      })
  }

  public getCertificate(req: Request, res: Response) {

    const type = req.query.type || undefined
    const symbol = req.query.symbol.toUpperCase()
    Output.find({
      ...(type && { ['attachment.cert']: type}),
      ['attachment.type']: 'asset-cert',
      ['attachment.symbol']: symbol,
      orphaned_at: 0,
    })
      .then((result) => {
        res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600')
        res.json(new ResponseSuccess({
          result
        }))
      }).catch((err: Error) => {
        console.error(err)
        res.status(400).json(new ResponseError('ERR_GET_CERT'))
      })
  }

}
