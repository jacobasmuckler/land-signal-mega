declare module '@mapbox/shp-write' {
  export function zip(geojson: any, options?: any): Promise<any>;
  export function download(geojson: any, options?: any): void;
  export function write(data: any[], type: string, geometries: any[], cb: (err: any, files: any) => void): void;
}
