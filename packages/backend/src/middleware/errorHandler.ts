import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

const GENERIC_CLIENT_ERROR = 'We hit a temporary application error. Please try again.';
const GENERIC_SERVER_ERROR = 'We hit a temporary server issue. Please try again.';

function getErrorCode(err: unknown): string {
  if (typeof err !== 'object' || err === null || !('code' in err)) return '';
  return String((err as { code?: unknown }).code ?? '');
}

function hasSensitiveDetails(message: string): boolean {
  const lower = message.toLowerCase();
  return [
    'prisma',
    'connectorerror',
    'query engine',
    'schema.prisma',
    'invalid `prisma.',
    'c:\\',
    '/src/',
    '.dll',
    'migration',
  ].some((token) => lower.includes(token));
}

function getPublicErrorMessage(err: AppError, statusCode: number): string {
  const rawMessage = typeof err.message === 'string' ? err.message.trim() : '';

  if (statusCode === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (getErrorCode(err) === 'P2021') {
    return 'Document uploads are not available yet in this environment. Please try again shortly.';
  }

  if (err.isOperational && rawMessage && !hasSensitiveDetails(rawMessage)) {
    return rawMessage;
  }

  return statusCode >= 500 ? GENERIC_SERVER_ERROR : GENERIC_CLIENT_ERROR;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const publicMessage = getPublicErrorMessage(err, statusCode);

  if (statusCode >= 500 || !err.isOperational) {
    console.error('Unhandled application error:', err);
  }

  res.status(statusCode).json({
    success: false,
    error: publicMessage,
  });
}

export function createError(message: string, statusCode: number): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}

