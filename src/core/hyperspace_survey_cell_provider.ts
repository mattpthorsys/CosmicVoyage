import {
  DeepSpacePhenomenonProperties,
  SystemDataGenerator,
  SystemMapProperties,
} from '../generation/system_data_generator';

export interface HyperspaceSurveyCellData {
  worldX: number;
  worldY: number;
  system: SystemMapProperties;
  phenomenon: DeepSpacePhenomenonProperties;
}

export interface HyperspaceSurveyCellProvider {
  getCellData(worldX: number, worldY: number): HyperspaceSurveyCellData;
  getCellDataBatchAsync(requests: readonly HyperspaceSurveyCellRequest[]): Promise<HyperspaceSurveyCellData[]>;
  clearCache(): void;
}

export interface HyperspaceSurveyCellRequest {
  worldX: number;
  worldY: number;
}

const EMPTY_PHENOMENON: DeepSpacePhenomenonProperties = {
  exists: false,
  type: null,
  name: null,
  classification: null,
  signal: null,
  char: null,
  colour: null,
  rarity: null,
};

export class LocalHyperspaceSurveyCellProvider implements HyperspaceSurveyCellProvider {
  constructor(private readonly systemDataGenerator: SystemDataGenerator) {}

  getCellData(worldX: number, worldY: number): HyperspaceSurveyCellData {
    const system = this.systemDataGenerator.getSystemMapProperties(worldX, worldY);
    const phenomenon = system.exists
      ? EMPTY_PHENOMENON
      : this.systemDataGenerator.getDeepSpacePhenomenonProperties(worldX, worldY);
    return { worldX, worldY, system, phenomenon };
  }

  getCellDataBatchAsync(requests: readonly HyperspaceSurveyCellRequest[]): Promise<HyperspaceSurveyCellData[]> {
    return Promise.resolve().then(() => requests.map(({ worldX, worldY }) => this.getCellData(worldX, worldY)));
  }

  clearCache(): void {}
}

let hyperspaceSurveyCellProvider: HyperspaceSurveyCellProvider | null = null;

export function setHyperspaceSurveyCellProvider(provider: HyperspaceSurveyCellProvider): void {
  hyperspaceSurveyCellProvider = provider;
}

export function getHyperspaceSurveyCellProvider(): HyperspaceSurveyCellProvider | null {
  return hyperspaceSurveyCellProvider;
}

