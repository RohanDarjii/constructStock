export type SupplierStatus = "ACTIVE" | "ARCHIVED";

export interface SupplierAddress {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface SupplierView {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: SupplierAddress | null;
  gstNumber: string | null;
  paymentTerms: string | null;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
}
