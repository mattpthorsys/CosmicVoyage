import { generateSurfaceDataFromRequest, SurfaceData, SurfaceGenerationRequest } from './surface_generator';

export interface SurfaceGenerationProvider {
  generateSurfaceData(request: SurfaceGenerationRequest): SurfaceData;
  generateSurfaceDataAsync?(request: SurfaceGenerationRequest): Promise<SurfaceData>;
}

export class SyncSurfaceGenerationProvider implements SurfaceGenerationProvider {
  /** Generates surface data. */
  generateSurfaceData(request: SurfaceGenerationRequest): SurfaceData {
    return generateSurfaceDataFromRequest(request);
  }
}

let activeSurfaceGenerationProvider: SurfaceGenerationProvider = new SyncSurfaceGenerationProvider();

/** Returns surface generation provider. */
export function getSurfaceGenerationProvider(): SurfaceGenerationProvider {
  return activeSurfaceGenerationProvider;
}

/** Updates surface generation provider. */
export function setSurfaceGenerationProvider(provider: SurfaceGenerationProvider): void {
  activeSurfaceGenerationProvider = provider;
}
