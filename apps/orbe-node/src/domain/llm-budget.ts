export interface LlmCallBudget {
  // Reserva uma tentativa real; falhas e cancelamentos posteriores não devolvem crédito.
  reserve(): Promise<void>;
}
