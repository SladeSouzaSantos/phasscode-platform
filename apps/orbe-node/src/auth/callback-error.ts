import { AppError } from '../domain/errors.js';

/** A failure after validating and consuming the browser-bound login transaction. */
export class AuthCallbackError extends AppError {
  constructor(
    error: AppError,
    readonly redirect: string,
  ) {
    super(error.code, error.status, error.message, error.retryAfterSeconds);
  }
}
