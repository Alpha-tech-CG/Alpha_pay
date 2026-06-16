export interface Merchant {
  id: string;
  name: string;
  email: string;
  apiKey?: string;
  isActive: boolean;
  createdAt: Date;
}
