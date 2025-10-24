export interface Order {
  id: string;
  userId: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'FAILED';
}