export type Role = 'ADMIN' | 'CUSTOMER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

export interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
  meta?: PageMeta;
}

export interface AuthPayload {
  accessToken: string;
  user: User;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string;
  parent: string | null;
  level: number;
  isActive: boolean;
  children: CategoryNode[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  parent: string | null;
  ancestors: string[];
  level: number;
  isActive: boolean;
}

export interface CategoryRef {
  id?: string;
  _id?: string;
  name: string;
  slug: string;
}

export type ProductStatus = 'ACTIVE' | 'INACTIVE';

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  price: number;
  salePrice: number | null;
  effectivePrice: number;
  onSale: boolean;
  inStock: boolean;
  stock: number;
  category: CategoryRef | string;
  imageUrl: string | null;
  status: ProductStatus;
  createdAt: string;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface OrderItem {
  product: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderHistory {
  status: OrderStatus;
  at: string;
  note?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: string | { id?: string; _id?: string; name: string; email: string };
  items: OrderItem[];
  subtotal: number;
  total: number;
  status: OrderStatus;
  statusHistory: OrderHistory[];
  createdAt: string;
}

export interface DashboardStats {
  totalCustomers: number;
  activeCustomers: number;
  totalProducts: number;
  activeProducts: number;
  totalCategories: number;
  totalOrders: number;
  pendingOrders: number;
  revenue: number;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
}
