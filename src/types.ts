export interface Resource {
  id?: number;
  norm_id?: number;
  resource_type: 'Labour' | 'Material' | 'Equipment';
  name: string;
  unit: string;
  quantity: number;
  is_percentage?: boolean;
  percentage_base?: string; // 'TOTAL', 'LABOUR', 'MATERIAL', 'EQUIPMENT', or a specific resource name
}

export interface Norm {
  id: number;
  type: 'DOR' | 'DUDBC';
  description: string;
  unit: string;
  basis_quantity: number;
  ref_ss: string;
  resources: Resource[];
}

export interface Rate {
  id: number;
  resource_type: 'Labour' | 'Material' | 'Equipment';
  name: string;
  unit: string;
  rate: number;
  apply_vat: boolean;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  mode: 'CONTRACTOR' | 'USERS';
  created_at: string;
}

export interface BOQItem extends Norm {
  boq_id: number;
  project_id: number;
  norm_id: number;
  quantity: number;
}

export interface ProjectDetail extends Project {
  items: BOQItem[];
}
