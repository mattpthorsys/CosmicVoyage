import { generateSurfaceDataFromRequest, SurfaceGenerationRequest } from './surface_generator';

interface SurfaceWorkerRequest {
  id: number;
  request: SurfaceGenerationRequest;
}

interface SurfaceWorkerResponse {
  id: number;
  ok: boolean;
  data?: ReturnType<typeof generateSurfaceDataFromRequest>;
  error?: string;
}

self.onmessage = (event: MessageEvent<SurfaceWorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const data = generateSurfaceDataFromRequest(request);
    postMessage({ id, ok: true, data } satisfies SurfaceWorkerResponse);
  } catch (error) {
    postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies SurfaceWorkerResponse);
  }
};
