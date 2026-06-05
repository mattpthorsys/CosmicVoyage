import { NebulaColourRequest, NebulaColourSample, NebulaColourSampler } from './nebula_colour_sampler';

export interface NebulaColourProvider {
  getBackgroundColor(worldX: number, worldY: number): string;
  getBackgroundColorsAsync(requests: readonly NebulaColourRequest[]): Promise<NebulaColourSample[]>;
  clearCache(): void;
}

export class LocalNebulaColourProvider implements NebulaColourProvider {
  private readonly sampler = new NebulaColourSampler();

  getBackgroundColor(worldX: number, worldY: number): string {
    return this.sampler.sample(worldX, worldY);
  }

  getBackgroundColorsAsync(requests: readonly NebulaColourRequest[]): Promise<NebulaColourSample[]> {
    return Promise.resolve().then(() => requests.map(({ worldX, worldY }) => ({
      worldX,
      worldY,
      colour: this.getBackgroundColor(worldX, worldY),
    })));
  }

  clearCache(): void {
    this.sampler.clearCache();
  }
}

let nebulaColourProvider: NebulaColourProvider = new LocalNebulaColourProvider();

export function setNebulaColourProvider(provider: NebulaColourProvider): void {
  nebulaColourProvider = provider;
}

export function getNebulaColourProvider(): NebulaColourProvider {
  return nebulaColourProvider;
}
