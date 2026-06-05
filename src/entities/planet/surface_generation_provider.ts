import { generateSurfaceDataFromRequest, SurfaceData, SurfaceGenerationRequest } from './surface_generator';

export interface SurfaceGenerationProvider {
  generateSurfaceData(request: SurfaceGenerationRequest): SurfaceData;
  generateSurfaceDataAsync?(request: SurfaceGenerationRequest): Promise<SurfaceData>;
}

export class SyncSurfaceGenerationProvider implements SurfaceGenerationProvider {
  generateSurfaceData(request: SurfaceGenerationRequest): SurfaceData {
    return generateSurfaceDataFromRequest(request);
  }
}

let activeSurfaceGenerationProvider: SurfaceGenerationProvider = new SyncSurfaceGenerationProvider();

export function getSurfaceGenerationProvider(): SurfaceGenerationProvider {
  return activeSurfaceGenerationProvider;
}

export function setSurfaceGenerationProvider(provider: SurfaceGenerationProvider): void {
  activeSurfaceGenerationProvider = provider;
}
