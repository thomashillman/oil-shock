export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = "internal_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError(error.message, 500, "internal_error");
  }
  return new AppError("Unknown error.", 500, "internal_error");
}
