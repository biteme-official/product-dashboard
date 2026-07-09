import Dexie, { type Table } from 'dexie';
import type { SkuData } from '../types';

export interface SkuImage {
  skuId: string;
  dataUrl: string;
}

class MdDashboardDb extends Dexie {
  skus!: Table<SkuData, string>;
  images!: Table<SkuImage, string>;

  constructor() {
    super('md-dashboard-db');
    this.version(1).stores({
      skus: 'id, category, skuName',
    });
    this.version(2).stores({
      skus: 'id, category, skuName',
      images: 'skuId',
    });
  }
}

export const db = new MdDashboardDb();
