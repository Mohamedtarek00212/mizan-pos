import { NextFunction, Request, Response } from 'express';
import { registersRepository } from './registers.repository';

export const registersController = {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const registers = await registersRepository.findAll();
      res.status(200).json({ registers });
    } catch (err) {
      next(err);
    }
  },
};
