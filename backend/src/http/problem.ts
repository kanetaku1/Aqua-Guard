import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

export class ApiProblem extends HttpException {
  constructor(status: number, code: string, title: string, extra: Record<string, unknown> = {}) {
    super({ title, status, code, ...extra }, status);
  }
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const response = error instanceof HttpException ? error.getResponse() : undefined;
    const fields = typeof response === 'object' && response !== null ? response : {};
    const title = status === 500 ? 'Internal server error'
      : error instanceof HttpException ? error.message : 'Request failed';
    if (status === 500) this.logger.error(error);
    const body = {
      title,
      status,
      code: status === 500 ? 'internal_error' : 'request_failed',
      ...fields,
    };
    const reply = host.switchToHttp().getResponse<{
      status(code: number): { type(value: string): { send(value: unknown): void } };
    }>();
    reply.status(status).type('application/problem+json').send(body);
  }
}
