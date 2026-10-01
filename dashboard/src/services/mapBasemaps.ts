export type AfatBasemapMode = 'street' | 'satellite' | 'intel';

export const AFAT_BASEMAPS: Record<AfatBasemapMode,{tiles:string[];attribution:string;opacity:number}> = {
  street: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
    opacity: 1,
  },
  satellite: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri',
    opacity: 1,
  },
  intel: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
    opacity: 0.48,
  },
};
