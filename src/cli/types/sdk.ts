export type DeckTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface DeckTask {
  id: string;
  spaceId?: string;
  type?: string;
  status: DeckTaskStatus;
  error?: string | null;
  result?: unknown;
}

export interface DeckClient {
  convertHtmlToPptx(params: Record<string, unknown>): Promise<DeckTask>;
  convertHtmlToPng(params: Record<string, unknown>): Promise<DeckTask>;
  tasks: {
    wait(
      taskId: string,
      options?: {
        timeout?: number;
        useEventStream?: boolean;
        onProgress?: (task: DeckTask) => void;
      }
    ): Promise<DeckTask>;
    down(taskId: string): Promise<unknown>;
  };
  setToken(token: string): void;
  setSpaceId(spaceId: string | undefined): void;
}
