import * as mongoose from 'mongoose';
import { BlockSchema } from '../models/block.model';
import { Request, Response } from 'express';
import { ResponseSuccess, ResponseError } from './../helpers/message.helper'

const Block = mongoose.model('Block', BlockSchema);

export class BlockController {

  public getBlocks(req: Request, res: Response) {

    const sort_by = req.query.sort_by
    const last_known = req.query.last_known
    Block.find({
      ...(last_known && { _id: { $lt: last_known } }),
      orphan: 0
    })
      .sort({
        ['number']: -1
      })
      .limit(20)
      .then((result) => {
        res.json(new ResponseSuccess(result));
      }).catch((err) => {
        console.error(err)
        res.status(400).json(new ResponseError("ERR_LIST_BLOCKS"));
      })
  }

}