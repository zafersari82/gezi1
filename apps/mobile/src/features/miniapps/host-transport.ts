export interface MiniAppTransport {
  request: (
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    key?: string,
  ) => Promise<unknown>;
}
