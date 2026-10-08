import { BookOpen, Boxes, BriefcaseBusiness, Factory, FileBarChart, LayoutDashboard, Receipt, ShoppingCart, Truck, Users, Wallet, type LucideIcon } from 'lucide-react';

export type NavItem = { name: string; icon: LucideIcon; primary?: boolean };

export const NAV: NavItem[] = [
  { name: 'Dashboard', icon: LayoutDashboard, primary: true },
  { name: 'Sales', icon: ShoppingCart, primary: true },
  { name: 'Purchases', icon: Receipt, primary: true },
  { name: 'Inventory', icon: Boxes, primary: true },
  { name: 'Production', icon: Factory },
  { name: 'Recipes', icon: BookOpen },
  { name: 'Customers', icon: Users },
  { name: 'Vendors', icon: Truck },
  { name: 'Expenses', icon: Wallet },
  { name: 'Accounts', icon: BriefcaseBusiness },
  { name: 'Reports', icon: FileBarChart },
];

export const NAV_NAMES = NAV.map(n => n.name);
export const DATA_TABS = ['Sales', 'Purchases', 'Recipes', 'Production', 'Inventory', 'Customers', 'Vendors', 'Expenses', 'Accounts'];
