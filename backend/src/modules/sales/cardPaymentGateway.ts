export type CardGatewayOutcome = 'CAPTURED' | 'DECLINED' | 'AMBIGUOUS';

/**
 * Provider boundary for the card terminal. Until a real provider is selected,
 * development defaults to a successful sandbox capture. Tests can exercise
 * decline/timeout handling through CARD_GATEWAY_MODE without trusting a
 * client-supplied payment result.
 */
export const cardPaymentGateway = {
  async charge(_saleId: number, _amount: number): Promise<CardGatewayOutcome> {
    const mode = process.env.CARD_GATEWAY_MODE?.toLowerCase();
    if (mode === 'decline') return 'DECLINED';
    if (mode === 'ambiguous') return 'AMBIGUOUS';
    return 'CAPTURED';
  },
};
