export interface SetupInput {
  storeName: string;
  adminFullName: string;
  adminUsername: string;
  adminPassword: string;
  registerCode: string;
  registerName: string;
  taxRatePct: number;
}

export interface SetupStatus {
  initialized: boolean;
  store_name: string | null;
  currency_code: string | null;
}
