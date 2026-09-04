import handler from 'vinext/server/fetch-handler';

import { setRuntimeEnvironment } from '../server/runtime-env';

type WorkerEnvironment = Record<string, unknown>;

const worker = {
  fetch(
    request: Request,
    environment: WorkerEnvironment,
    context: ExecutionContext,
  ) {
    setRuntimeEnvironment(environment);
    return handler.fetch(request, environment, context);
  },
};

export default worker;
