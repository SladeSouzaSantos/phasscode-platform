export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
export const conversationNotFound = () =>
  new AppError('CONVERSATION_NOT_FOUND', 404, 'Conversa indisponível ou token inválido.');
