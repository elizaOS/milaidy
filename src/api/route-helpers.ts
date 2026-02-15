import type http from "node:http";

export interface RouteHelpers {
  json: (res: http.ServerResponse, data: object, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<T | null>;
}

export interface RouteRequestContext extends RouteHelpers {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
}
