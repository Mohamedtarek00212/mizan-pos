export const refundGateway = {
  async refundCard(_paymentId: number, _amount: number): Promise<'COMPLETED' | 'FAILED'> {
    return process.env.CARD_REFUND_MODE?.toLowerCase() === 'fail' ? 'FAILED' : 'COMPLETED';
  },
};
