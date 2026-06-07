import * as os from 'os';
import * as path from 'path';
import { langgraphMock } from './mocks/langgraphMock';

jest.mock('@langchain/langgraph', () => langgraphMock);

process.env.NODE_ENV = 'test';
process.env.DEVFORGE_AGENT_CACHE_PATH = path.join(
  os.tmpdir(),
  `devforge-test-cache-${process.pid}.json`,
);
process.env.DEVFORGE_CREDENTIALS_PATH = path.join(
  os.tmpdir(),
  `devforge-test-credentials-${process.pid}.json`,
);
process.env.DEVFORGE_USE_LANGGRAPH = 'false';
